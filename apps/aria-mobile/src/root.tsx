import type { ReactElement } from "react";
import type { CreateAriaMobileShellOptions } from "@aria/mobile";
import { AriaMobileApplicationShell, createAriaMobileApplicationShell } from "./shell.js";
import type { AriaMobileAppShell, AriaMobileNavigation } from "./app.js";

export interface AriaMobileApplicationRootProps {
  shell: AriaMobileAppShell;
  navigation?: AriaMobileNavigation;
  onSwitchServer?(serverId: string): void;
  onOpenAriaSession?(sessionId: string): void;
  onSendAriaMessage?(message: string): void;
  onStopAriaSession?(): void;
  onApproveToolCall?(toolCallId: string, approved: boolean): void;
  onAcceptToolCallForSession?(toolCallId: string): void;
  onAnswerQuestion?(questionId: string, answer: string): void;
}

export function AriaMobileApplicationRoot(props: AriaMobileApplicationRootProps): ReactElement {
  return (
    <AriaMobileApplicationShell
      shell={props.shell}
      navigation={props.navigation}
      onSwitchServer={props.onSwitchServer}
      onOpenAriaSession={props.onOpenAriaSession}
      onSendAriaMessage={props.onSendAriaMessage}
      onStopAriaSession={props.onStopAriaSession}
      onApproveToolCall={props.onApproveToolCall}
      onAcceptToolCallForSession={props.onAcceptToolCallForSession}
      onAnswerQuestion={props.onAnswerQuestion}
    />
  );
}

export function createAriaMobileApplicationRoot(
  options: CreateAriaMobileShellOptions,
): ReactElement {
  return createAriaMobileApplicationShell(options);
}
