/**
 * Shared streaming message handler for IM connectors (Telegram, Discord).
 *
 * Handles text_delta throttling, edit-lock serialization, done finalization,
 * and error replies. Platform-specific send/edit operations are injected via
 * the StreamOps interface.
 */

export const EDIT_THROTTLE_MS = 1000;

/** Platform-specific message operations. */
export interface StreamOps<TMsg> {
  /** Send the first message and return its handle. */
  send: (content: string) => Promise<TMsg>;
  /** Edit an existing message in-place. */
  edit: (msg: TMsg, content: string) => Promise<void>;
  /** Send an additional message (for overflow chunks). */
  sendExtra: (content: string) => Promise<void>;
  /** Format accumulated text for display (e.g. markdownToHtml). */
  format: (text: string) => string;
  /** Split formatted text into chunks that fit the platform's limits. */
  split: (formattedText: string) => string[];
  /** Send an error message. */
  sendError: (message: string) => Promise<void>;
}

export interface StreamState<TMsg> {
  sentMsg: TMsg | null;
  fullText: string;
  lastEditTime: number;
  editLock: Promise<void>;
}

/**
 * Creates the shared onData handler for text streaming.
 *
 * Returns { state, handleTextDelta, handleDone, handleError } so the
 * connector can wire them into its own switch alongside platform-specific
 * event handlers (tool_end, tool_approval_request).
 */
export function createStreamHandler<TMsg>(ops: StreamOps<TMsg>) {
  const state: StreamState<TMsg> = {
    sentMsg: null,
    fullText: "",
    lastEditTime: 0,
    editLock: Promise.resolve(),
  };

  function handleTextDelta(delta: string): void {
    state.fullText += delta;
    if (Date.now() - state.lastEditTime > EDIT_THROTTLE_MS && state.fullText.length > 0) {
      state.lastEditTime = Date.now();
      state.editLock = state.editLock.then(async () => {
        const content = ops.format(state.fullText);
        try {
          if (!state.sentMsg) {
            state.sentMsg = await ops.send(content);
          } else {
            await ops.edit(state.sentMsg, content);
          }
        } catch (err) {
          console.warn("[stream-handler] edit failed:", err instanceof Error ? err.message : err);
        } finally {
          state.lastEditTime = Date.now();
        }
      });
    }
  }

  function handleDone(): void {
    if (state.fullText) {
      state.editLock = state.editLock.then(async () => {
        const formatted = ops.format(state.fullText);
        const chunks = ops.split(formatted);
        try {
          if (!state.sentMsg) {
            state.sentMsg = await ops.send(chunks[0]!);
          } else {
            await ops.edit(state.sentMsg, chunks[0]!);
          }
        } catch (err) {
          console.warn(
            "[stream-handler] final edit failed:",
            err instanceof Error ? err.message : err,
          );
        }
        for (let i = 1; i < chunks.length; i++) {
          await ops.sendExtra(chunks[i]!);
        }
      });
    }
  }

  async function handleError(message: string): Promise<void> {
    await ops.sendError(message);
  }

  return { state, handleTextDelta, handleDone, handleError };
}
