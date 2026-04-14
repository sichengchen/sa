import { afterEach, describe, expect, test } from "bun:test";
import {
  createStreamHandler,
  EDIT_THROTTLE_MS,
} from "../packages/connectors-im/src/shared/stream-handler.js";

const originalNow = Date.now;

afterEach(() => {
  Date.now = originalNow;
});

describe("shared stream handler", () => {
  test("sends the first delta, finalizes the primary chunk, and posts overflow chunks", async () => {
    let now = EDIT_THROTTLE_MS + 1;
    Date.now = () => now;

    const sent: string[] = [];
    const edited: string[] = [];
    const extras: string[] = [];
    const message = { id: "sent-1" };

    const { state, handleTextDelta, handleDone } = createStreamHandler({
      send: async (content) => {
        sent.push(content);
        return message;
      },
      edit: async (_msg, content) => {
        edited.push(content);
      },
      sendExtra: async (content) => {
        extras.push(content);
      },
      format: (text) => text.toUpperCase(),
      split: (formatted) => [formatted.slice(0, 5), formatted.slice(5)],
      sendError: async () => {},
    });

    handleTextDelta("hello world");
    await state.editLock;

    now += EDIT_THROTTLE_MS + 1;
    handleDone();
    await state.editLock;

    expect(sent).toEqual(["HELLO WORLD"]);
    expect(edited).toEqual(["HELLO"]);
    expect(extras).toEqual([" WORLD"]);
  });

  test("routes stream errors through the injected error sender", async () => {
    const errors: string[] = [];

    const { handleError } = createStreamHandler({
      send: async () => ({ id: "unused" }),
      edit: async () => {},
      sendExtra: async () => {},
      format: (text) => text,
      split: (formatted) => [formatted],
      sendError: async (message) => {
        errors.push(message);
      },
    });

    await handleError("connector offline");

    expect(errors).toEqual(["connector offline"]);
  });
});
