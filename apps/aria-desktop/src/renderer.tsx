import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AriaDesktopApplicationRoot, createConnectedAriaDesktopAppShellModel } from "./index.js";

export interface AriaDesktopRendererTarget {
  serverId: string;
  baseUrl: string;
}

export interface AriaDesktopRendererMount {
  root: Root;
  model: Awaited<ReturnType<typeof createConnectedAriaDesktopAppShellModel>>;
}

export function resolveAriaDesktopRendererTarget(
  config: Partial<AriaDesktopRendererTarget> | undefined,
): AriaDesktopRendererTarget {
  return {
    serverId: config?.serverId ?? "desktop",
    baseUrl: config?.baseUrl ?? "http://127.0.0.1:7420/",
  };
}

export async function mountAriaDesktopRenderer(
  container: Element,
  config?: Partial<AriaDesktopRendererTarget>,
): Promise<AriaDesktopRendererMount> {
  const model = await createConnectedAriaDesktopAppShellModel({
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
