import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resolveHostAccessClientTarget } from "@aria/access-client";
import {
  AriaDesktopApplicationRoot,
  connectAriaDesktopAppShellModel,
  createAriaDesktopAppShellModel,
  loadAriaDesktopAppShellRecentSessions,
  openAriaDesktopAppShellSession,
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
  sendMessage(message: string): Promise<AriaDesktopAppShellModel>;
  stop(): Promise<AriaDesktopAppShellModel>;
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
    sendMessage(message: string) {
      return update(sendAriaDesktopAppShellMessage(model, message));
    },
    stop() {
      return update(stopAriaDesktopAppShell(model));
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
