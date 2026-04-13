import { describe, expect, test } from "bun:test";
import {
  CLI_NAME,
  PRODUCT_NAME,
  engineCommand,
  ensureEngine,
  getRuntimeDiscoveryPaths,
  startAriaServer,
} from "@aria/server";
import type { EngineServer } from "@aria/gateway/server";
import type { EngineRuntime } from "@aria/server/runtime";

import {
  ariaServerHost,
  createAriaServerHostBootstrap,
  runAriaServerHost,
} from "../apps/aria-server/src/index.js";

describe("server host surface", () => {
  test("starts and stops the server shell through the public package boundary", async () => {
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
    expect(calls).toEqual(["createRuntime", "startServer:0.0.0.0:9001"]);

    await app.stop();
    expect(stopCalls).toBe(1);
  });

  test("exposes a thin app wrapper over the server package shell", async () => {
    const bootstrap = createAriaServerHostBootstrap("/tmp/aria-server-app");

    expect(bootstrap.host).toEqual(ariaServerHost);
    expect(bootstrap.host).toMatchObject({
      shellPackage: "@aria/server",
      command: "aria",
      displayName: PRODUCT_NAME,
    });
    expect(bootstrap.host.sharedPackages).toEqual([
      "@aria/server",
      "@aria/runtime",
      "@aria/gateway",
    ]);
    expect(bootstrap.discoveryPaths).toEqual(getRuntimeDiscoveryPaths("/tmp/aria-server-app"));

    const runtime = { close: async () => {} } as EngineRuntime;
    const server = { port: 7420, stop: async () => {} } satisfies EngineServer;
    const app = await bootstrap.start({
      factories: {
        async createRuntime() {
          return runtime;
        },
        async startServer() {
          return server;
        },
      },
    });

    expect(app.runtime).toBe(runtime);
    expect(app.server).toBe(server);
  });

  test("keeps public server command metadata stable", () => {
    expect(typeof ensureEngine).toBe("function");
    expect(typeof engineCommand).toBe("function");
    expect(CLI_NAME).toBe("aria");
    expect(PRODUCT_NAME).toBe("Esperta Aria");
  });

  test("runs the thin app wrapper through the host bootstrap", async () => {
    const runtime = { close: async () => {} } as EngineRuntime;
    const server = { port: 8123, stop: async () => {} } satisfies EngineServer;

    const app = await runAriaServerHost({
      runtimeHome: "/tmp/aria-server-app",
      port: 8123,
      factories: {
        async createRuntime() {
          return runtime;
        },
        async startServer(receivedRuntime, options) {
          expect(receivedRuntime).toBe(runtime);
          expect(options?.port).toBe(8123);
          return server;
        },
      },
    });

    expect(app.runtime).toBe(runtime);
    expect(app.server).toBe(server);
  });
});
