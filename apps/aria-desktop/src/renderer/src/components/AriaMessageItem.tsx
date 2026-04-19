import type { AriaDesktopChatMessage } from "../../../shared/api.js";
import { AriaMarkdown } from "./AriaMarkdown.js";

export function AriaMessageItem({ message }: { message: AriaDesktopChatMessage }) {
  if (message.role === "assistant") {
    return (
      <article className="aria-message aria-message-assistant">
        <div className="aria-message-assistant-content">
          <AriaMarkdown content={message.content} />
        </div>
      </article>
    );
  }

  if (message.role === "user") {
    return (
      <article className="aria-message aria-message-user">
        <div className="aria-message-user-bubble">{message.content}</div>
      </article>
    );
  }

  return (
    <article className={`aria-message aria-message-meta aria-message-${message.role}`}>
      <div className="aria-message-meta-content">
        {message.toolName ? (
          <span className="aria-message-meta-label">{message.toolName}</span>
        ) : null}
        <pre>{message.content}</pre>
      </div>
    </article>
  );
}
