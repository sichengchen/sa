import type { ReactElement } from "react";
import type { CreateAriaDesktopAppShellOptions } from "./shell.js";
import {
  AriaDesktopAppShell,
  createAriaDesktopAppShell,
  type AriaDesktopAppShellModel,
} from "./shell.js";

export interface AriaDesktopApplicationRootProps {
  model: AriaDesktopAppShellModel;
  onSwitchServer?(serverId: string): void;
  onOpenAriaSession?(sessionId: string): void;
  onSendAriaMessage?(message: string): void;
  onStopAriaSession?(): void;
}

export function AriaDesktopApplicationRoot(props: AriaDesktopApplicationRootProps): ReactElement {
  return (
    <AriaDesktopAppShell
      model={props.model}
      onSwitchServer={props.onSwitchServer}
      onOpenAriaSession={props.onOpenAriaSession}
      onSendAriaMessage={props.onSendAriaMessage}
      onStopAriaSession={props.onStopAriaSession}
    />
  );
}

export function createAriaDesktopApplicationRoot(
  options: CreateAriaDesktopAppShellOptions,
): ReactElement {
  return createAriaDesktopAppShell(options).element;
}
