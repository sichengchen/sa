import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "@aria/desktop-ui/styles/globals.css";
import { AriaDesktopApplicationRoot } from "../root.js";
import {
  mountAriaDesktopRenderer,
  type AriaDesktopRendererController,
  type AriaDesktopRendererMount,
  type AriaDesktopRendererTarget,
} from "../renderer.js";

export type {
  AriaDesktopRendererController,
  AriaDesktopRendererMount,
  AriaDesktopRendererTarget,
};

const rootElement = typeof document !== "undefined" ? document.getElementById("root") : null;

if (rootElement) {
  void mountAriaDesktopRenderer(rootElement, globalThis.window?.ariaDesktop?.target).catch(
    (error: unknown) => {
      rootElement.textContent = `Failed to start Aria Desktop: ${error instanceof Error ? error.message : String(error)}`;
    },
  );
}
