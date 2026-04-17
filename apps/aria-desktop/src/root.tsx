import type { ReactElement } from "react";
import type { CreateAriaDesktopAppShellOptions } from "./shell.js";
import {
  createAriaDesktopAppShell,
  type AriaDesktopAppShellModel,
} from "./shell.js";
import { DesktopShellUI } from "./DesktopShellUI.js";

export interface AriaDesktopApplicationRootProps {
  model: AriaDesktopAppShellModel;
  onSwitchServer?(serverId: string): void;
  onOpenAriaSession?(sessionId: string): void;
  onSearchAriaSessions?(query: string): void;
  onSelectProjectThread?(threadId: string): void;
  onSelectThreadEnvironment?(environmentId: string): void;
  onSendAriaMessage?(message: string): void;
  onStopAriaSession?(): void;
  onApproveToolCall?(toolCallId: string, approved: boolean): void;
  onAcceptToolCallForSession?(toolCallId: string): void;
  onAnswerQuestion?(questionId: string, answer: string): void;
}

export function AriaDesktopApplicationRoot(props: AriaDesktopApplicationRootProps): ReactElement {
  return (
    <DesktopShellUI
      model={props.model}
      onSwitchServer={props.onSwitchServer}
      onOpenAriaSession={props.onOpenAriaSession}
      onSearchAriaSessions={props.onSearchAriaSessions}
      onSelectProjectThread={props.onSelectProjectThread}
      onSelectThreadEnvironment={props.onSelectThreadEnvironment}
      onSendAriaMessage={props.onSendAriaMessage}
      onStopAriaSession={props.onStopAriaSession}
      onApproveToolCall={props.onApproveToolCall}
      onAcceptToolCallForSession={props.onAcceptToolCallForSession}
      onAnswerQuestion={props.onAnswerQuestion}
    />
  );
}

export function createAriaDesktopApplicationRoot(
  options: CreateAriaDesktopAppShellOptions,
): ReactElement {
  return createAriaDesktopAppShell(options).element;
}
