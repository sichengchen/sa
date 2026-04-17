import { describe, expect, test } from "bun:test";

import {
  DEFAULT_WECHAT_API_BASE_URL,
  ChatSDKAdapter,
  createChatSDKClient,
  createDiscordConnector,
  createGChatConnector,
  createGitHubConnector,
  createLinearConnector,
  createSlackConnector,
  createTeamsConnector,
  createTelegramConnector,
  formatToolResult,
  startWeChatConnector,
  startSlackSocketConnector,
  startWeChatLogin,
} from "../packages/connectors-im/src/index.js";

describe("@aria/connectors-im package entrypoints", () => {
  test("re-exports the shared chat-sdk surface", () => {
    expect(formatToolResult("read", "hello", 20)).toContain("hello");
    expect(typeof createChatSDKClient).toBe("function");
    expect(typeof ChatSDKAdapter).toBe("function");
  });

  test("re-exports connector factories from the package root", () => {
    expect(typeof createSlackConnector).toBe("function");
    expect(typeof startSlackSocketConnector).toBe("function");
    expect(typeof createDiscordConnector).toBe("function");
    expect(typeof createTelegramConnector).toBe("function");
    expect(typeof createTeamsConnector).toBe("function");
    expect(typeof createGChatConnector).toBe("function");
    expect(typeof createGitHubConnector).toBe("function");
    expect(typeof createLinearConnector).toBe("function");
    expect(typeof startWeChatConnector).toBe("function");
    expect(typeof startWeChatLogin).toBe("function");
  });

  test("re-exports WeChat config helpers from the package root", () => {
    expect(DEFAULT_WECHAT_API_BASE_URL).toBe("https://ilinkai.weixin.qq.com/");
  });
});
