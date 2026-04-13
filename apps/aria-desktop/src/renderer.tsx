import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resolveHostAccessClientTarget } from "@aria/access-client";
import {
  AriaDesktopApplicationRoot,
  connectAriaDesktopAppShellModel,
  createAriaDesktopAppShellModel,
  loadAriaDesktopAppShellRecentSessions,
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
  const model = await startAriaDesktopRendererModel({
    target: resolveAriaDesktopRendererTarget(config),
  });
  const root = createRoot(container);
  root.render(createElement(AriaDesktopApplicationRoot, { model }));
  return { root, model };
}

const rootElement = typeof document !== "undefined" ? document.getElementById("root") : null;

if (rootElement) {
  void mountAriaDesktopRenderer(rootElement, globalThis.window?.ariaDesktop?.target).catch(
    (error) => {
      rootElement.textContent = `Failed to start Aria Desktop: ${error instanceof Error ? error.message : String(error)}`;
    },
  );
}
