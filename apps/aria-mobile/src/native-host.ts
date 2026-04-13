import {
  resolveHostAccessClientTarget,
  type AccessClientTarget,
  type AriaChatController,
  type AriaChatState,
} from "@aria/access-client";
import { createAriaMobileNativeHostModel, type AriaMobileNativeHostModel } from "./native-model.js";
import {
  acceptAriaMobileAppShellToolCallForSession,
  answerAriaMobileAppShellQuestion,
  approveAriaMobileAppShellToolCall,
  createAriaMobileAppShell,
  openAriaMobileAppShellSession,
  sendAriaMobileAppShellMessage,
  stopAriaMobileAppShell,
  switchAriaMobileAppShellServer,
  startAriaMobileNativeHostShell,
  type AriaMobileAppShell,
  type AriaMobileAppShellSourceOptions,
} from "./app.js";

export function resolveAriaMobileNativeHostTarget(
  config: Partial<AccessClientTarget> | undefined,
): AccessClientTarget {
  return resolveHostAccessClientTarget(config, {
    serverId: "mobile",
    baseUrl: "http://127.0.0.1:7420/",
  });
}

export interface AriaMobileNativeHostBootstrap {
  target: AccessClientTarget;
  shell: AriaMobileAppShell;
  model: AriaMobileNativeHostModel;
}

export interface AriaMobileNativeHostController {
  getBootstrap(): AriaMobileNativeHostBootstrap;
  subscribe(listener: (bootstrap: AriaMobileNativeHostBootstrap) => void): () => void;
  start(): Promise<AriaMobileNativeHostBootstrap>;
  switchServer(serverId: string): Promise<AriaMobileNativeHostBootstrap>;
  openSession(sessionId: string): Promise<AriaMobileNativeHostBootstrap>;
  sendMessage(message: string): Promise<AriaMobileNativeHostBootstrap>;
  stop(): Promise<AriaMobileNativeHostBootstrap>;
  approveToolCall(toolCallId: string, approved: boolean): Promise<AriaMobileNativeHostBootstrap>;
  acceptToolCallForSession(toolCallId: string): Promise<AriaMobileNativeHostBootstrap>;
  answerQuestion(questionId: string, answer: string): Promise<AriaMobileNativeHostBootstrap>;
}

export interface AriaMobileNativeHostBootstrapOptions extends Partial<AccessClientTarget> {
  servers?: AriaMobileAppShellSourceOptions["servers"];
  activeServerId?: AriaMobileAppShellSourceOptions["activeServerId"];
  projects?: AriaMobileAppShellSourceOptions["projects"];
  initialThread?: AriaMobileAppShellSourceOptions["initialThread"];
  activeThreadContext?: AriaMobileAppShellSourceOptions["activeThreadContext"];
  ariaThreadController?: AriaChatController;
  createAriaThreadController?: (target: AccessClientTarget) => AriaChatController;
  ariaThreadState?: AriaChatState;
}

export function createAriaMobileNativeHostBootstrap(
  config?: AriaMobileNativeHostBootstrapOptions,
): AriaMobileNativeHostBootstrap {
  const target = resolveAriaMobileNativeHostTarget(config);
  const shell = createAriaMobileAppShell({
    target,
    servers: config?.servers,
    activeServerId: config?.activeServerId,
    projects: config?.projects,
    initialThread: config?.initialThread,
    activeThreadContext: config?.activeThreadContext,
    ariaThreadController: config?.ariaThreadController,
    createAriaThreadController: config?.createAriaThreadController,
    ariaThreadState: config?.ariaThreadState,
  });
  return {
    target,
    shell,
    model: createAriaMobileNativeHostModel(shell),
  };
}

export async function startAriaMobileNativeHostBootstrap(
  config?: AriaMobileNativeHostBootstrapOptions,
): Promise<AriaMobileNativeHostBootstrap> {
  const target = resolveAriaMobileNativeHostTarget(config);
  const shell = await startAriaMobileNativeHostShell({
    target,
    servers: config?.servers,
    activeServerId: config?.activeServerId,
    projects: config?.projects,
    initialThread: config?.initialThread,
    activeThreadContext: config?.activeThreadContext,
    ariaThreadController: config?.ariaThreadController,
    createAriaThreadController: config?.createAriaThreadController,
    ariaThreadState: config?.ariaThreadState,
  });
  return {
    target,
    shell,
    model: createAriaMobileNativeHostModel(shell),
  };
}

export async function switchAriaMobileNativeHostBootstrapServer(
  bootstrap: AriaMobileNativeHostBootstrap,
  serverId: string,
): Promise<AriaMobileNativeHostBootstrap> {
  const shell = await switchAriaMobileAppShellServer(bootstrap.shell, serverId);
  return {
    ...bootstrap,
    target: shell.sourceOptions.target,
    shell,
    model: createAriaMobileNativeHostModel(shell),
  };
}

export function createAriaMobileNativeHostController(
  config?: AriaMobileNativeHostBootstrapOptions,
): AriaMobileNativeHostController {
  let bootstrap = createAriaMobileNativeHostBootstrap(config);
  const listeners = new Set<(bootstrap: AriaMobileNativeHostBootstrap) => void>();

  const publish = () => {
    for (const listener of listeners) {
      listener(bootstrap);
    }
    return bootstrap;
  };

  const update = async (next: Promise<AriaMobileNativeHostBootstrap>) => {
    bootstrap = await next;
    return publish();
  };

  const mapShell = (shell: AriaMobileAppShell): AriaMobileNativeHostBootstrap => ({
    ...bootstrap,
    target: shell.sourceOptions.target,
    shell,
    model: createAriaMobileNativeHostModel(shell),
  });

  return {
    getBootstrap() {
      return bootstrap;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      return update(startAriaMobileNativeHostBootstrap(config));
    },
    switchServer(serverId: string) {
      return update(switchAriaMobileNativeHostBootstrapServer(bootstrap, serverId));
    },
    openSession(sessionId: string) {
      return update(openAriaMobileAppShellSession(bootstrap.shell, sessionId).then(mapShell));
    },
    sendMessage(message: string) {
      return update(sendAriaMobileAppShellMessage(bootstrap.shell, message).then(mapShell));
    },
    stop() {
      return update(stopAriaMobileAppShell(bootstrap.shell).then(mapShell));
    },
    approveToolCall(toolCallId: string, approved: boolean) {
      return update(
        approveAriaMobileAppShellToolCall(bootstrap.shell, toolCallId, approved).then(mapShell),
      );
    },
    acceptToolCallForSession(toolCallId: string) {
      return update(
        acceptAriaMobileAppShellToolCallForSession(bootstrap.shell, toolCallId).then(mapShell),
      );
    },
    answerQuestion(questionId: string, answer: string) {
      return update(
        answerAriaMobileAppShellQuestion(bootstrap.shell, questionId, answer).then(mapShell),
      );
    },
  };
}
