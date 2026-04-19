import { ArrowUp, Plus } from "lucide-react";
import { useRef } from "react";

type AriaChatComposerProps = {
  centered?: boolean;
  onSend: (message: string) => void | Promise<void>;
  placeholder?: string;
  title?: string | null;
};

export function AriaChatComposer({
  centered = false,
  onSend,
  placeholder = "Message Aria",
  title = null,
}: AriaChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function submit(): Promise<void> {
    const nextMessage = textareaRef.current?.value.trim() ?? "";
    if (!nextMessage) {
      return;
    }

    if (textareaRef.current) {
      textareaRef.current.value = "";
    }
    await onSend(nextMessage);
  }

  return (
    <div className={`aria-chat-composer${centered ? " is-centered" : ""}`}>
      {centered && title ? <h2 className="aria-chat-composer-title">{title}</h2> : null}
      <form
        className="aria-chat-composer-shell"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          ref={textareaRef}
          className="aria-chat-composer-input"
          placeholder={placeholder}
          rows={centered ? 4 : 3}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="aria-chat-composer-footer">
          <div className="aria-chat-composer-tools">
            <button type="button" className="aria-chat-composer-utility" aria-label="Composer tools">
              <Plus aria-hidden="true" />
            </button>
          </div>
          <button
            type="submit"
            className="aria-chat-composer-submit"
            aria-label="Send message"
          >
            <ArrowUp aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
