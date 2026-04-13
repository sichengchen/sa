import { describe, expect, test } from "bun:test";

import { AuthManager } from "../packages/gateway/src/auth.js";
import {
  createContext,
  createAppRouter,
  DEFAULT_TASK_TIER,
  flushProcedureState,
  router,
} from "../packages/gateway/src/index.js";

describe("@aria/gateway package entrypoints", () => {
  test("re-exports gateway auth manager", () => {
    expect(typeof AuthManager).toBe("function");
  });

  test("re-exports router helpers", () => {
    expect(DEFAULT_TASK_TIER.chat).toBe("performance");
    expect(typeof router).toBe("function");
  });

  test("re-exports gateway context creation", () => {
    const req = new Request("https://example.com", {
      headers: { authorization: "Bearer token-123" },
    });
    expect(createContext({ req })).toMatchObject({ token: "token-123", sessionId: null });
  });

  test("re-exports gateway procedures", () => {
    expect(typeof createAppRouter).toBe("function");
    expect(typeof flushProcedureState).toBe("function");
  });
});
