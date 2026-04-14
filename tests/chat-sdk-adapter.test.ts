import { describe, expect, test } from "bun:test";
import { ChatSDKAdapter } from "../packages/connectors-im/src/chat-sdk/adapter.js";

function createFakeChat() {
  return {
    onNewMention() {},
    onSubscribedMessage() {},
    onAction() {},
  } as any;
}

function createFakeThread() {
  const posts: string[] = [];
  return {
    thread: {
      id: "thread-1",
      channelId: "channel-1",
      isDM: false,
      async post(content: string) {
        posts.push(content);
        return {
          id: `msg-${posts.length}`,
          async edit() {},
        };
      },
      async subscribe() {},
    },
    posts,
  };
}

describe("ChatSDKAdapter command handling", () => {
  test("submits numbered answers for pending multiple-choice questions", async () => {
    const { thread, posts } = createFakeThread();
    const answers: Array<{ id: string; answer: string }> = [];
    const adapter = new ChatSDKAdapter(createFakeChat(), {
      connectorType: "telegram",
      platformName: "telegram",
    });

    (adapter as any).client = {
      question: {
        answer: {
          mutate: async (input: { id: string; answer: string }) => {
            answers.push(input);
          },
        },
      },
    };
    (adapter as any).pendingFreeTextQuestions.set(thread.id, "question-1");
    (adapter as any)._questionOptions = new Map([["question-1", ["red", "blue", "green"]]]);

    const handled = await (adapter as any).handleCommand(thread, "answer 2");

    expect(handled).toBe(true);
    expect(answers).toEqual([{ id: "question-1", answer: "blue" }]);
    expect(posts).toEqual(["Answer: blue"]);
    expect((adapter as any).pendingFreeTextQuestions.has(thread.id)).toBe(false);
  });

  test("approves pending tool calls via the short text command fallback", async () => {
    const { thread, posts } = createFakeThread();
    const approvals: Array<{ toolCallId: string; approved: boolean }> = [];
    const adapter = new ChatSDKAdapter(createFakeChat(), {
      connectorType: "telegram",
      platformName: "telegram",
    });

    (adapter as any).client = {
      tool: {
        approve: {
          mutate: async (input: { toolCallId: string; approved: boolean }) => {
            approvals.push(input);
          },
        },
      },
    };
    (adapter as any).pendingApprovals.set("tool1234", "tool1234-full");

    const handled = await (adapter as any).handleCommand(thread, "approve tool1234");

    expect(handled).toBe(true);
    expect(approvals).toEqual([{ toolCallId: "tool1234-full", approved: true }]);
    expect(posts).toEqual(["Tool approved."]);
    expect((adapter as any).pendingApprovals.has("tool1234")).toBe(false);
  });

  test("starts a new connector-scoped session from the text command path", async () => {
    const { thread, posts } = createFakeThread();
    const creates: Array<{ connectorType: string; prefix: string }> = [];
    const adapter = new ChatSDKAdapter(createFakeChat(), {
      connectorType: "telegram",
      platformName: "telegram",
    });

    (adapter as any).client = {
      session: {
        create: {
          mutate: async (input: { connectorType: string; prefix: string }) => {
            creates.push(input);
            return { session: { id: "telegram:channel-1:new" } };
          },
        },
      },
    };

    const handled = await (adapter as any).handleCommand(thread, "/new");

    expect(handled).toBe(true);
    expect(creates).toEqual([{ connectorType: "telegram", prefix: "telegram:channel-1" }]);
    expect(posts).toEqual(["New session started."]);
    expect((adapter as any).activeSessions.get(thread.id)).toBe("telegram:channel-1:new");
  });
});
