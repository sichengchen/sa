import { useState } from "react";
import type { AriaDesktopChatState } from "../../../shared/api.js";
import { AriaMarkdown } from "./AriaMarkdown.js";
import { AriaMessageItem } from "./AriaMessageItem.js";

type AriaMessageStreamProps = {
  chat: AriaDesktopChatState;
  onAcceptForSession: (toolCallId: string) => void;
  onAnswerQuestion: (questionId: string, answer: string) => void;
  onApproveToolCall: (toolCallId: string, approved: boolean) => void;
};

export function AriaMessageStream({
  chat,
  onAcceptForSession,
  onAnswerQuestion,
  onApproveToolCall,
}: AriaMessageStreamProps) {
  const [answer, setAnswer] = useState("");

  return (
    <div className="aria-message-stream">
      {chat.messages.map((message) => (
        <AriaMessageItem key={message.id} message={message} />
      ))}

      {chat.streamingText ? (
        <article className="aria-message aria-message-assistant is-streaming">
          <div className="aria-message-assistant-content">
            <div className="aria-streaming-status" aria-live="polite">
              <span className="aria-streaming-status-label">Thinking</span>
              <span className="aria-streaming-status-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
            <AriaMarkdown content={chat.streamingText} />
          </div>
        </article>
      ) : chat.isStreaming ? (
        <article className="aria-message aria-message-assistant is-streaming">
          <div className="aria-message-assistant-content">
            <div className="aria-streaming-status" aria-live="polite">
              <span className="aria-streaming-status-label">Thinking</span>
              <span className="aria-streaming-status-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        </article>
      ) : null}

      {chat.pendingApproval ? (
        <section className="aria-inline-card">
          <div className="aria-inline-card-title">{chat.pendingApproval.toolName}</div>
          <pre className="aria-inline-card-copy">
            {JSON.stringify(chat.pendingApproval.args, null, 2)}
          </pre>
          <div className="aria-inline-card-actions">
            <button
              type="button"
              className="aria-inline-card-button"
              onClick={() => onApproveToolCall(chat.pendingApproval!.toolCallId, true)}
            >
              Approve
            </button>
            <button
              type="button"
              className="aria-inline-card-button"
              onClick={() => onAcceptForSession(chat.pendingApproval!.toolCallId)}
            >
              Allow session
            </button>
            <button
              type="button"
              className="aria-inline-card-button"
              onClick={() => onApproveToolCall(chat.pendingApproval!.toolCallId, false)}
            >
              Deny
            </button>
          </div>
        </section>
      ) : null}

      {chat.pendingQuestion ? (
        <section className="aria-inline-card">
          <div className="aria-inline-card-title">{chat.pendingQuestion.question}</div>
          {chat.pendingQuestion.options?.length ? (
            <div className="aria-inline-card-actions">
              {chat.pendingQuestion.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="aria-inline-card-button"
                  onClick={() => onAnswerQuestion(chat.pendingQuestion!.questionId, option)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <div className="aria-inline-card-answer">
              <input
                className="aria-inline-card-input"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <button
                type="button"
                className="aria-inline-card-button"
                onClick={() => {
                  if (!answer.trim()) {
                    return;
                  }
                  onAnswerQuestion(chat.pendingQuestion!.questionId, answer.trim());
                  setAnswer("");
                }}
              >
                Submit
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
