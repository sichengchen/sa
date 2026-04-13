import { describe, expect, test } from "bun:test";
import { createAriaMobileAppShell } from "../apps/aria-mobile/src/app.js";
import { createAriaMobileNativeHostModel } from "../apps/aria-mobile/src/native-model.js";

describe("aria-mobile native host scaffold", () => {
  test("derives a native host summary from the mobile app shell", () => {
    const shell = createAriaMobileAppShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      ariaThreadState: {
        connected: true,
        sessionId: "mobile:session-1",
        sessionStatus: "resumed",
        approvalMode: "ask",
        securityMode: "trusted",
        securityModeRemainingTTL: 600,
        modelName: "sonnet",
        agentName: "Esperta Aria",
        messages: [{ role: "assistant", content: "hello" }],
        streamingText: "",
        isStreaming: false,
        pendingApproval: null,
        pendingQuestion: null,
        lastError: null,
      },
    });

    expect(createAriaMobileNativeHostModel(shell)).toEqual({
      title: "Aria Mobile",
      serverLabel: "mobile",
      sessionId: "mobile:session-1",
      sessionStatus: "resumed",
      approvalMode: "ask",
      securityMode: "trusted",
      transcriptCount: 1,
      latestMessage: "hello",
      pendingApproval: "none",
      pendingQuestion: "none",
      recentSessions: [],
    });
  });
});
