import { type ReactElement } from "react";
import { cn } from "@aria/desktop-ui";
import type { AriaChatMessage } from "@aria/access-client";

export interface MessageItemProps {
  message: AriaChatMessage;
  className?: string;
}

function formatRole(role: string): string {
  switch (role) {
    case "assistant":
      return "Aria";
    case "user":
      return "You";
    case "tool":
      return "Tool";
    case "error":
      return "Error";
    default:
      return role;
  }
}

export function MessageItem({ message, className }: MessageItemProps): ReactElement {
  const isAssistant = message.role === "assistant";
  const isError = message.role === "error";

  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-[var(--aria-border)] p-3 last:border-b-0",
        isAssistant && "bg-blue-50/50",
        isError && "bg-red-50/50",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--aria-text-muted)]">
          {formatRole(message.role)}
        </span>
        {"toolName" in message && message.toolName && (
          <span className="text-[10px] text-[var(--aria-text-muted)]">{message.toolName}</span>
        )}
      </div>
      <p className="m-0 whitespace-pre-wrap text-xs text-[var(--aria-text)]">
        {message.content}
      </p>
    </div>
  );
}
