import { type ReactElement } from "react";
import { ScrollArea } from "@aria/desktop-ui";
import { MessageItem } from "../MessageItem";
import { ApprovalCard } from "../ApprovalCard";
import { QuestionCard } from "../QuestionCard";
import type {
  AriaChatMessage,
  AriaChatPendingApproval,
  AriaChatPendingQuestion,
} from "@aria/access-client";

export interface ChatInterfaceProps {
  messages: AriaChatMessage[];
  streamingText?: string;
  isStreaming?: boolean;
  pendingApproval?: AriaChatPendingApproval | null;
  pendingQuestion?: AriaChatPendingQuestion | null;
  onApproveToolCall?: (toolCallId: string, approved: boolean) => void;
  onAcceptToolCallForSession?: (toolCallId: string) => void;
  onAnswerQuestion?: (questionId: string, answer: string) => void;
  className?: string;
}

export function ChatInterface({
  messages,
  streamingText,
  isStreaming,
  pendingApproval,
  pendingQuestion,
  onApproveToolCall,
  onAcceptToolCallForSession,
  onAnswerQuestion,
  className,
}: ChatInterfaceProps): ReactElement {
  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex min-h-[160px] flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--aria-border)] p-4 text-center">
        <strong className="text-sm text-[var(--aria-text)]">No stream events yet</strong>
        <p className="m-0 text-xs text-[var(--aria-text-muted)]">
          Select a project thread and start a run to fill the activity stream.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <ScrollArea className="flex-1 overflow-auto rounded-md border border-[var(--aria-border)] bg-white">
        {messages.map((message, index) => (
          <MessageItem
            key={`${message.role}-${index}`}
            message={message}
          />
        ))}
        {streamingText && isStreaming && (
          <div className="flex flex-col gap-1 border-b border-[var(--aria-border)] p-3 bg-blue-50/50">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--aria-text-muted)]">
              Streaming
            </div>
            <p className="m-0 whitespace-pre-wrap text-xs text-[var(--aria-text)]">
              {streamingText}
            </p>
          </div>
        )}
      </ScrollArea>

      {pendingApproval && onApproveToolCall && onAcceptToolCallForSession && (
        <ApprovalCard
          approval={pendingApproval}
          onApprove={(approved) => onApproveToolCall(pendingApproval.toolCallId, approved)}
          onAllowForSession={() => onAcceptToolCallForSession(pendingApproval.toolCallId)}
        />
      )}

      {pendingQuestion && onAnswerQuestion && (
        <QuestionCard
          question={pendingQuestion}
          onAnswer={(answer) => onAnswerQuestion(pendingQuestion.questionId, answer)}
        />
      )}
    </div>
  );
}
