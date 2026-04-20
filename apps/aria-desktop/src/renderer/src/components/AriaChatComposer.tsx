import { ArrowUp, FileText, Plus, Wrench } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { AriaDesktopProjectPromptSuggestions } from "../../../shared/api.js";

type AriaChatComposerProps = {
  footerEnd?: ReactNode;
  footerStart?: ReactNode;
  centered?: boolean;
  onSend: (message: string) => void | Promise<void>;
  placeholder?: string;
  promptSuggestions?: AriaDesktopProjectPromptSuggestions | null;
  title?: string | null;
};

type ComposerPromptSuggestion = {
  description?: string | null;
  icon: ReactNode;
  id: string;
  label: string;
  replacement: string;
  secondaryLabel?: string | null;
};

type ComposerPromptQuery = {
  end: number;
  query: string;
  sigil: "$" | "@";
  start: number;
};

const COMPOSER_PROMPT_TRIGGER_PATTERN = /(^|[\s(])([@$])([^\s@$]*)$/;
const MAX_VISIBLE_PROMPT_SUGGESTIONS = 8;

export function resolveComposerPromptQuery(
  value: string,
  selectionStart: number,
): ComposerPromptQuery | null {
  const prefix = value.slice(0, selectionStart);
  const match = COMPOSER_PROMPT_TRIGGER_PATTERN.exec(prefix);
  if (!match) {
    return null;
  }

  const leading = match[1] ?? "";
  const sigil = match[2];
  if (sigil !== "$" && sigil !== "@") {
    return null;
  }

  const query = match[3] ?? "";
  const start = prefix.length - match[0].length + leading.length;
  return {
    end: selectionStart,
    query,
    sigil,
    start,
  };
}

export function buildComposerPromptSuggestions(
  promptSuggestions: AriaDesktopProjectPromptSuggestions | null | undefined,
  activeQuery: ComposerPromptQuery | null,
): ComposerPromptSuggestion[] {
  if (!promptSuggestions || !activeQuery) {
    return [];
  }

  const normalizedQuery = activeQuery.query.trim().toLowerCase();
  const suggestions =
    activeQuery.sigil === "$"
      ? promptSuggestions.skills.map((skill) => ({
          description: skill.description ?? null,
          icon: <Wrench aria-hidden="true" />,
          id: `skill:${skill.value}`,
          label: skill.label,
          replacement: `$${skill.value}`,
          secondaryLabel: skill.description ?? null,
        }))
      : promptSuggestions.files.map((file) => ({
          description: file.detail ?? null,
          icon: <FileText aria-hidden="true" />,
          id: `file:${file.value}`,
          label: file.label,
          replacement: `@${file.value}`,
          secondaryLabel: file.detail ?? null,
        }));

  return suggestions
    .filter((suggestion) => {
      if (!normalizedQuery) {
        return true;
      }

      const haystacks = [
        suggestion.label.toLowerCase(),
        suggestion.replacement.toLowerCase(),
        suggestion.secondaryLabel?.toLowerCase() ?? "",
      ];
      return haystacks.some((value) => value.includes(normalizedQuery));
    })
    .sort((left, right) => {
      const leftStarts = left.label.toLowerCase().startsWith(normalizedQuery);
      const rightStarts = right.label.toLowerCase().startsWith(normalizedQuery);
      if (leftStarts !== rightStarts) {
        return leftStarts ? -1 : 1;
      }
      return left.label.localeCompare(right.label);
    })
    .slice(0, MAX_VISIBLE_PROMPT_SUGGESTIONS);
}

export function applyComposerPromptSuggestion(
  value: string,
  activeQuery: ComposerPromptQuery,
  suggestion: Pick<ComposerPromptSuggestion, "replacement">,
): { nextCursor: number; nextValue: string } {
  const before = value.slice(0, activeQuery.start);
  const after = value.slice(activeQuery.end).replace(/^ /, "");
  const inserted = `${suggestion.replacement} `;
  const nextValue = `${before}${inserted}${after}`;
  return {
    nextCursor: before.length + inserted.length,
    nextValue,
  };
}

export function AriaChatComposer({
  centered = false,
  footerEnd = null,
  footerStart = null,
  onSend,
  placeholder = "Message Aria",
  promptSuggestions = null,
  title = null,
}: AriaChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState("");
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0);
  const [dismissedPromptQueryKey, setDismissedPromptQueryKey] = useState<string | null>(null);

  const activePromptQuery = useMemo(
    () => resolveComposerPromptQuery(draft, textareaRef.current?.selectionStart ?? draft.length),
    [draft],
  );
  const activePromptQueryKey = activePromptQuery
    ? `${activePromptQuery.sigil}:${activePromptQuery.start}:${activePromptQuery.query}`
    : null;
  const promptSuggestionsEnabled = activePromptQueryKey !== dismissedPromptQueryKey;
  const visiblePromptSuggestions = useMemo(
    () =>
      promptSuggestionsEnabled
        ? buildComposerPromptSuggestions(promptSuggestions, activePromptQuery)
        : [],
    [activePromptQuery, promptSuggestions, promptSuggestionsEnabled],
  );
  const activePromptSuggestion =
    visiblePromptSuggestions[
      Math.min(highlightedSuggestionIndex, Math.max(visiblePromptSuggestions.length - 1, 0))
    ] ?? null;

  async function submit(): Promise<void> {
    const nextMessage = draft.trim();
    if (!nextMessage) {
      return;
    }

    setDraft("");
    setHighlightedSuggestionIndex(0);
    setDismissedPromptQueryKey(null);
    await onSend(nextMessage);
  }

  function commitPromptSuggestion(suggestion: ComposerPromptSuggestion): void {
    if (!textareaRef.current || !activePromptQuery) {
      return;
    }

    const nextState = applyComposerPromptSuggestion(draft, activePromptQuery, suggestion);
    setDraft(nextState.nextValue);
    setHighlightedSuggestionIndex(0);
    setDismissedPromptQueryKey(null);

    requestAnimationFrame(() => {
      if (!textareaRef.current) {
        return;
      }
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextState.nextCursor, nextState.nextCursor);
    });
  }

  return (
    <div className={`aria-chat-composer${centered ? " is-centered" : ""}`}>
      {centered && title ? <h2 className="aria-chat-composer-title">{title}</h2> : null}
      {visiblePromptSuggestions.length > 0 ? (
        <div className="aria-chat-composer-suggestions" aria-label="Prompt suggestions">
          {visiblePromptSuggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              className={`aria-chat-composer-suggestion${index === highlightedSuggestionIndex ? " is-active" : ""}`}
              onMouseDown={(event) => {
                event.preventDefault();
                commitPromptSuggestion(suggestion);
              }}
            >
              <span className="aria-chat-composer-suggestion-icon">{suggestion.icon}</span>
              <span className="aria-chat-composer-suggestion-label">{suggestion.label}</span>
            </button>
          ))}
        </div>
      ) : null}
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
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setHighlightedSuggestionIndex(0);
            setDismissedPromptQueryKey(null);
          }}
          onClick={() => {
            setHighlightedSuggestionIndex(0);
            setDismissedPromptQueryKey(null);
          }}
          onKeyDown={(event) => {
            if (visiblePromptSuggestions.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlightedSuggestionIndex((current) =>
                  Math.min(current + 1, visiblePromptSuggestions.length - 1),
                );
                return;
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedSuggestionIndex((current) => Math.max(current - 1, 0));
                return;
              }

              if ((event.key === "Enter" || event.key === "Tab") && activePromptSuggestion) {
                event.preventDefault();
                commitPromptSuggestion(activePromptSuggestion);
                return;
              }

              if (event.key === "Escape") {
                event.preventDefault();
                setHighlightedSuggestionIndex(0);
                setDismissedPromptQueryKey(activePromptQueryKey);
                return;
              }
            }

            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="aria-chat-composer-footer">
          <div className="aria-chat-composer-tools">
            <button
              type="button"
              className="aria-chat-composer-utility"
              aria-label="Composer tools"
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
          <button type="submit" className="aria-chat-composer-submit" aria-label="Send message">
            <ArrowUp aria-hidden="true" />
          </button>
        </div>
      </form>
      {footerStart || footerEnd ? (
        <div className="aria-chat-composer-meta" aria-label="Composer context">
          <div className="aria-chat-composer-meta-slot is-start">{footerStart}</div>
          <div className="aria-chat-composer-meta-slot is-end">{footerEnd}</div>
        </div>
      ) : null}
    </div>
  );
}
