import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resolveHostAccessClientTarget } from "@aria/access-client";
import {
  AriaDesktopApplicationRoot,
  acceptAriaDesktopAppShellToolCallForSession,
  answerAriaDesktopAppShellQuestion,
  approveAriaDesktopAppShellToolCall,
  connectAriaDesktopAppShellModel,
  createAriaDesktopAppShellModel,
  loadAriaDesktopAppShellRecentSessions,
  openAriaDesktopAppShellSession,
  selectAriaDesktopAppShellEnvironment,
  selectAriaDesktopAppShellThread,
  searchAriaDesktopAppShellSessions,
  sendAriaDesktopAppShellMessage,
  stopAriaDesktopAppShell,
  switchAriaDesktopAppShellServer,
  type AriaDesktopAppShellModel,
  type CreateAriaDesktopAppShellModelOptions,
} from "./index.js";

export interface AriaDesktopRendererTarget {
  serverId: string;
  baseUrl: string;
}

export interface AriaDesktopRendererMount {
  root: Root;
  model: Awaited<ReturnType<typeof startAriaDesktopRendererModel>>;
  controller: AriaDesktopRendererController;
}

export interface AriaDesktopRendererController {
  getModel(): AriaDesktopAppShellModel;
  subscribe(listener: (model: AriaDesktopAppShellModel) => void): () => void;
  start(): Promise<AriaDesktopAppShellModel>;
  switchServer(serverId: string): Promise<AriaDesktopAppShellModel>;
  openSession(sessionId: string): Promise<AriaDesktopAppShellModel>;
  selectThread(threadId: string): Promise<AriaDesktopAppShellModel>;
  selectEnvironment(environmentId: string): Promise<AriaDesktopAppShellModel>;
  searchSessions(query: string): Promise<AriaDesktopAppShellModel>;
  sendMessage(message: string): Promise<AriaDesktopAppShellModel>;
  stop(): Promise<AriaDesktopAppShellModel>;
  approveToolCall(toolCallId: string, approved: boolean): Promise<AriaDesktopAppShellModel>;
  acceptToolCallForSession(toolCallId: string): Promise<AriaDesktopAppShellModel>;
  answerQuestion(questionId: string, answer: string): Promise<AriaDesktopAppShellModel>;
}

export async function startAriaDesktopRendererModel(
  options: CreateAriaDesktopAppShellModelOptions,
) {
  const connected = await connectAriaDesktopAppShellModel(createAriaDesktopAppShellModel(options));
  return loadAriaDesktopAppShellRecentSessions(connected);
}

export async function switchAriaDesktopRendererModel(
  model: AriaDesktopAppShellModel,
  serverId: string,
) {
  return switchAriaDesktopAppShellServer(model, serverId);
}

export function createAriaDesktopRendererController(
  options: CreateAriaDesktopAppShellModelOptions,
): AriaDesktopRendererController {
  let model = createAriaDesktopAppShellModel(options);
  const listeners = new Set<(model: AriaDesktopAppShellModel) => void>();

  const publish = () => {
    for (const listener of listeners) {
      listener(model);
    }
    return model;
  };

  const update = async (next: Promise<AriaDesktopAppShellModel>) => {
    model = await next;
    return publish();
  };

  return {
    getModel() {
      return model;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      return update(startAriaDesktopRendererModel(model.sourceOptions));
    },
    switchServer(serverId: string) {
      return update(switchAriaDesktopRendererModel(model, serverId));
    },
    openSession(sessionId: string) {
      return update(openAriaDesktopAppShellSession(model, sessionId));
    },
    selectThread(threadId: string) {
      return update(Promise.resolve(selectAriaDesktopAppShellThread(model, threadId)));
    },
    selectEnvironment(environmentId: string) {
      return update(Promise.resolve(selectAriaDesktopAppShellEnvironment(model, environmentId)));
    },
    searchSessions(query: string) {
      return update(searchAriaDesktopAppShellSessions(model, query));
    },
    sendMessage(message: string) {
      return update(sendAriaDesktopAppShellMessage(model, message));
    },
    stop() {
      return update(stopAriaDesktopAppShell(model));
    },
    approveToolCall(toolCallId: string, approved: boolean) {
      return update(approveAriaDesktopAppShellToolCall(model, toolCallId, approved));
    },
    acceptToolCallForSession(toolCallId: string) {
      return update(acceptAriaDesktopAppShellToolCallForSession(model, toolCallId));
    },
    answerQuestion(questionId: string, answer: string) {
      return update(answerAriaDesktopAppShellQuestion(model, questionId, answer));
    },
  };
}

export function resolveAriaDesktopRendererTarget(
  config: Partial<AriaDesktopRendererTarget> | undefined,
): AriaDesktopRendererTarget {
  return resolveHostAccessClientTarget(config, {
    serverId: "desktop",
    baseUrl: "http://127.0.0.1:7420/",
  });
}

export async function mountAriaDesktopRenderer(
  container: Element,
  config?: Partial<AriaDesktopRendererTarget>,
): Promise<AriaDesktopRendererMount> {
  const controller = createAriaDesktopRendererController({
    target: resolveAriaDesktopRendererTarget(config),
  });
  const root = createRoot(container);
  const render = (nextModel: AriaDesktopAppShellModel) =>
    root.render(
      createElement(AriaDesktopApplicationRoot, {
        model: nextModel,
        onSwitchServer: (serverId: string) => {
          void controller.switchServer(serverId);
        },
        onOpenAriaSession: (sessionId: string) => {
          void controller.openSession(sessionId);
        },
        onSelectProjectThread: (threadId: string) => {
          void controller.selectThread(threadId);
        },
        onSelectThreadEnvironment: (environmentId: string) => {
          void controller.selectEnvironment(environmentId);
        },
        onSearchAriaSessions: (query: string) => {
          void controller.searchSessions(query);
        },
        onSendAriaMessage: (message: string) => {
          void controller.sendMessage(message);
        },
        onStopAriaSession: () => {
          void controller.stop();
        },
        onApproveToolCall: (toolCallId: string, approved: boolean) => {
          void controller.approveToolCall(toolCallId, approved);
        },
        onAcceptToolCallForSession: (toolCallId: string) => {
          void controller.acceptToolCallForSession(toolCallId);
        },
        onAnswerQuestion: (questionId: string, answer: string) => {
          void controller.answerQuestion(questionId, answer);
        },
      }),
    );
  render(controller.getModel());
  controller.subscribe(render);
  const model = await controller.start();
  return { root, model, controller };
}

const rootElement = typeof document !== "undefined" ? document.getElementById("root") : null;

if (rootElement) {
  void mountAriaDesktopRenderer(rootElement, globalThis.window?.ariaDesktop?.target).catch(
    (error) => {
      rootElement.textContent = `Failed to start Aria Desktop: ${error instanceof Error ? error.message : String(error)}`;
    },
  );
}
