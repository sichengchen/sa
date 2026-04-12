import { describe, expect, test } from "bun:test";
import { CLI_NAME, PRODUCT_NAME, engineCommand, ensureEngine, getRuntimeDiscoveryPaths, startAriaServer } from "@aria/server";
import type { EngineServer } from "@aria/gateway/server";
import type { EngineRuntime } from "@aria/runtime/runtime";

describe("Phase 5 server app seam", () => {
  test("composes runtime and gateway through @aria/server", async () => {
    const calls: string[] = [];
    let stopCalls = 0;

    const runtime = {
      close: async () => {
        calls.push("runtime.close");
      },
    } as EngineRuntime;

    const server = {
      port: 7420,
      stop: async () => {
        stopCalls += 1;
      },
    } satisfies EngineServer;

    const app = await startAriaServer({
      port: 9001,
      hostname: "0.0.0.0",
      factories: {
        async createRuntime() {
          calls.push("createRuntime");
          return runtime;
        },
        async startServer(receivedRuntime, options) {
          calls.push(`startServer:${options?.hostname}:${options?.port}`);
          expect(receivedRuntime).toBe(runtime);
          return server;
        },
      },
    });

    expect(app.runtime).toBe(runtime);
    expect(app.server).toBe(server);
    expect(calls).toEqual([
      "createRuntime",
      "startServer:0.0.0.0:9001",
    ]);

    await app.stop();
    expect(stopCalls).toBe(1);
  });

  test("closes the bootstrapped runtime when server startup fails", async () => {
    const calls: string[] = [];
    const runtime = {
      close: async () => {
        calls.push("runtime.close");
      },
    } as EngineRuntime;

    await expect(
      startAriaServer({
        factories: {
          async createRuntime() {
            calls.push("createRuntime");
            return runtime;
          },
          async startServer() {
            calls.push("startServer");
            throw new Error("server bootstrap failed");
          },
        },
      }),
    ).rejects.toThrow("server bootstrap failed");

    expect(calls).toEqual([
      "createRuntime",
      "startServer",
      "runtime.close",
    ]);
  });

  test("exports daemon lifecycle helpers from @aria/server", () => {
    expect(typeof ensureEngine).toBe("function");
    expect(typeof engineCommand).toBe("function");
    expect(getRuntimeDiscoveryPaths("/tmp/aria-test").pidFile).toBe("/tmp/aria-test/engine.pid");
    expect(CLI_NAME).toBe("aria");
    expect(PRODUCT_NAME).toBe("Esperta Aria");
  });
});
