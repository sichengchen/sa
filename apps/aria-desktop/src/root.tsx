import type { ReactElement } from "react";
import type { CreateAriaDesktopAppShellOptions } from "./shell.js";
import {
  AriaDesktopAppShell,
  createAriaDesktopAppShell,
  type AriaDesktopAppShellModel,
} from "./shell.js";

export interface AriaDesktopApplicationRootProps {
  model: AriaDesktopAppShellModel;
}

export function AriaDesktopApplicationRoot(
  props: AriaDesktopApplicationRootProps,
): ReactElement {
  return <AriaDesktopAppShell model={props.model} />;
}

export function createAriaDesktopApplicationRoot(
  options: CreateAriaDesktopAppShellOptions,
): ReactElement {
  return createAriaDesktopAppShell(options).element;
}
