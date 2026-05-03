import { stream } from "@mariozechner/pi-ai";
import { Agent } from "@aria/agent";
import type { AgentEvent, AgentOptions, ToolImpl } from "@aria/agent";
import type {
  AssistantMessage,
  Context,
  Message,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";
import type { AriaHarnessHost, HarnessSessionData } from "./host.js";
import type { AriaSessionEnv, ShellOptions, ShellResult } from "./session-env.js";
import { createCwdScopedEnv } from "./session-env.js";
import { HarnessHistory } from "./history.js";
import { buildResultPrompt, parseTypedResult } from "./results.js";
import { buildRolePrompt, resolveEffectiveRole, type AriaRoleMap } from "./roles.js";
import { resolveSkillFromEnv, type SkillResolutionOptions } from "./skills.js";
import { createTaskLink } from "./tasks.js";
import { createHarnessTools } from "./tools.js";

export interface AriaHarnessSessionOptions {
  id: string;
  agentId: string;
  env: AriaSessionEnv;
  host: AriaHarnessHost;
  agentRole?: string;
  sessionRole?: string;
  roles?: AriaRoleMap;
  skillResolution?: SkillResolutionOptions;
  createChildSession?: (options: {
    id: string;
    env: AriaSessionEnv;
    role?: string;
  }) => Promise<AriaHarnessSession>;
}

export interface PromptOptions<T = unknown> {
  role?: string;
  model?: string;
  result?: unknown;
  syntheticResponse?: string;
}

export interface SkillOptions<T = unknown> extends PromptOptions<T> {
  args?: Record<string, unknown>;
}

export interface TaskOptions<T = unknown> extends PromptOptions<T> {
  cwd?: string;
}

export interface PromptResponse<T = unknown> {
  text: string;
  result?: T;
}

export interface HarnessChatOptions extends Pick<
  AgentOptions,
  | "router"
  | "getSystemPrompt"
  | "systemPrompt"
  | "timeoutMs"
  | "toolLoopDetection"
  | "maxToolResultChars"
  | "onToolApproval"
  | "onAskUser"
  | "modelOverride"
> {
  tools?: ToolImpl[];
}

export class AriaHarnessSession {
  readonly id: string;
  readonly env: AriaSessionEnv;
  private readonly host: AriaHarnessHost;
  private readonly agentId: string;
  private readonly roles: AriaRoleMap;
  private readonly agentRole?: string;
  private readonly sessionRole?: string;
  private readonly history: HarnessHistory;
  private readonly modelMessages: Message[];
  private runtimeAgent: Agent | null = null;
  private runtimeMessages: Message[];
  private readonly skillResolution?: SkillResolutionOptions;
  private readonly createChildSession?: AriaHarnessSessionOptions["createChildSession"];

  constructor(options: AriaHarnessSessionOptions, existingData?: HarnessSessionData | null) {
    this.id = options.id;
    this.agentId = options.agentId;
    this.env = options.env;
    this.host = options.host;
    this.roles = options.roles ?? {};
    this.agentRole = options.agentRole;
    this.sessionRole = options.sessionRole;
    this.skillResolution = options.skillResolution;
    this.createChildSession = options.createChildSession;
    this.history = new HarnessHistory((existingData?.history as never[]) ?? []);
    this.modelMessages = [];
    this.runtimeMessages = [];
  }

  async prompt<T = unknown>(
    text: string,
    options: PromptOptions<T> = {},
  ): Promise<PromptResponse<T>> {
    const role = resolveEffectiveRole({
      roles: this.roles,
      agentRole: this.agentRole,
      sessionRole: this.sessionRole,
      callRole: options.role,
    });
    const model = this.host.resolveModel({ model: options.model, role });
    const prompt = options.result ? `${text}\n\n${buildResultPrompt(options.result)}` : text;
    await this.host.appendRunEvent({
      sessionId: this.id,
      type: "prompt",
      data: { role, hasTypedResult: Boolean(options.result) },
    });
    let textResult = options.syntheticResponse ?? (await this.runModelPrompt(prompt, model, role));
    this.history.append({ type: "prompt", input: prompt, output: textResult });
    await this.save();
    if (!options.result) return { text: textResult };
    let parsed: ReturnType<typeof parseTypedResult<T>>;
    try {
      parsed = parseTypedResult<T>(textResult, options.result);
    } catch (error) {
      await this.host.recordAudit({
        type: "result_validation",
        sessionId: this.id,
        message: error instanceof Error ? error.message : String(error),
      });
      if (options.syntheticResponse !== undefined) throw error;
      textResult = await this.runModelPrompt(
        [
          "The previous structured result failed validation.",
          `Validation error: ${error instanceof Error ? error.message : String(error)}`,
          "Return a corrected structured result.",
          "",
          buildResultPrompt(options.result),
        ].join("\n"),
        model,
        role,
      );
      this.history.append({ type: "prompt", input: "typed_result_repair", output: textResult });
      parsed = parseTypedResult<T>(textResult, options.result);
    }
    this.history.append({ type: "result", raw: parsed });
    await this.save();
    return { text: textResult, result: parsed.parsed };
  }

  async skill<T = unknown>(
    name: string,
    options: SkillOptions<T> = {},
  ): Promise<PromptResponse<T>> {
    const skill = await resolveSkillFromEnv(this.env, name, {
      ariaHome: this.skillResolution?.ariaHome,
      bundledRoot: this.skillResolution?.bundledRoot,
    });
    if (!skill) throw new Error(`Skill not found: ${name}`);
    const prompt = [
      skill.instructions,
      options.args ? `Arguments:\n${JSON.stringify(options.args, null, 2)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const response = await this.prompt<T>(prompt, options);
    this.history.append({ type: "skill", input: name, output: response.text });
    await this.save();
    return response;
  }

  async task<T = unknown>(text: string, options: TaskOptions<T> = {}): Promise<PromptResponse<T>> {
    if (!this.createChildSession) {
      throw new Error("This harness session cannot create child tasks.");
    }
    const link = createTaskLink({ parentSessionId: this.id, role: options.role, cwd: options.cwd });
    const childEnv = options.cwd ? createCwdScopedEnv(this.env, options.cwd) : this.env;
    const child = await this.createChildSession({
      id: link.childSessionId,
      env: childEnv,
      role: options.role,
    });
    await this.host.appendRunEvent({
      sessionId: this.id,
      type: "task_linked",
      data: link as unknown as Record<string, unknown>,
    });
    const response = await child.prompt<T>(text, options);
    this.history.append({ type: "task", input: text, output: response.text, raw: link });
    await this.save();
    return response;
  }

  async shell(command: string, options?: ShellOptions): Promise<ShellResult> {
    const result = await this.env.exec(command, options);
    this.history.append({
      type: "shell",
      input: command,
      output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
      raw: result,
    });
    await this.host.appendRunEvent({
      sessionId: this.id,
      type: "shell",
      data: {
        command,
        cwd: options?.cwd ?? this.env.cwd,
        environment: this.env.kind,
        exitCode: result.exitCode,
      },
    });
    await this.save();
    return result;
  }

  async *chat(text: string, options?: HarnessChatOptions): AsyncGenerator<AgentEvent> {
    if (!options) {
      throw new Error("Harness chat requires runtime chat options.");
    }
    await this.host.appendRunEvent({
      sessionId: this.id,
      type: "chat",
      data: { toolCount: (options.tools ?? []).length },
    });
    const agent = this.ensureRuntimeAgent(options);
    let output = "";

    try {
      for await (const event of agent.chat(text)) {
        if (event.type === "text_delta") output += event.delta;
        yield event;
      }
    } finally {
      this.runtimeMessages = Array.from(agent.getMessages());
      this.history.append({ type: "prompt", input: text, output });
      await this.save();
    }
  }

  get isRunning(): boolean {
    return this.runtimeAgent?.isRunning ?? false;
  }

  abort(): boolean {
    return this.runtimeAgent?.abort() ?? false;
  }

  getMessages(): readonly Message[] {
    return this.runtimeAgent?.getMessages() ?? this.runtimeMessages;
  }

  hydrateHistory(messages: readonly Message[]): void {
    this.runtimeMessages = Array.from(messages);
    this.runtimeAgent?.hydrateHistory(messages);
  }

  clearHistory(): void {
    this.runtimeMessages = [];
    this.runtimeAgent?.clearHistory();
  }

  async save(): Promise<void> {
    await this.host.saveHarnessSession(this.id, {
      id: this.id,
      agentId: this.agentId,
      role: this.sessionRole,
      history: this.history.toJSON(),
      updatedAt: Date.now(),
    });
  }

  private async runModelPrompt(
    prompt: string,
    model: unknown,
    role: string | undefined,
  ): Promise<string> {
    if (!model) {
      throw new Error("No model resolved for harness prompt execution.");
    }

    const userMessage: UserMessage = {
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    this.modelMessages.push(userMessage);
    let finalText = "";

    while (true) {
      const toolCalls: ToolCall[] = [];
      const context: Context = {
        systemPrompt: buildRolePrompt(
          "You are Aria Runtime executing through @aria/harness.",
          this.roles,
          role,
        ),
        messages: this.modelMessages,
        tools: this.createModelTools().map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      };

      for await (const event of stream(model as never, context)) {
        if (event.type === "text_delta") {
          finalText += event.delta;
        }
        if (event.type === "toolcall_end") {
          toolCalls.push(event.toolCall);
        }
        if (event.type === "done") {
          this.modelMessages.push(event.message as AssistantMessage);
          if (event.reason !== "toolUse" || toolCalls.length === 0) {
            return finalText;
          }
        }
      }

      for (const toolCall of toolCalls) {
        const tool = this.createModelTools().find((candidate) => candidate.name === toolCall.name);
        const result = tool
          ? await tool.execute((toolCall.arguments ?? {}) as Record<string, unknown>)
          : { content: `Unknown tool: ${toolCall.name}`, isError: true };
        const toolResult: ToolResultMessage = {
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: [{ type: "text", text: result.content }],
          isError: result.isError ?? false,
          timestamp: Date.now(),
        };
        this.modelMessages.push(toolResult);
      }
    }
  }

  private createModelTools() {
    return createHarnessTools(this.env, {
      task: async (input) => {
        const result = await this.task(input.prompt, {
          role: input.role,
          cwd: input.cwd,
        });
        return result.text;
      },
    });
  }

  private ensureRuntimeAgent(options: HarnessChatOptions): Agent {
    if (!this.runtimeAgent) {
      this.runtimeAgent = new Agent({
        router: options.router,
        tools: options.tools ?? this.createModelTools(),
        systemPrompt: options.systemPrompt,
        getSystemPrompt: options.getSystemPrompt,
        timeoutMs: options.timeoutMs,
        toolLoopDetection: options.toolLoopDetection,
        maxToolResultChars: options.maxToolResultChars,
        onToolApproval: options.onToolApproval,
        onAskUser: options.onAskUser,
        modelOverride: options.modelOverride,
      });
      if (this.runtimeMessages.length > 0) {
        this.runtimeAgent.hydrateHistory(this.runtimeMessages);
      }
    }
    return this.runtimeAgent;
  }
}
