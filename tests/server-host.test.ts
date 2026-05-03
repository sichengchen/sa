import { describe, expect, test } from "bun:test";
import {
  CLI_NAME,
  PRODUCT_NAME,
  engineCommand,
  ensureEngine,
  getRuntimeDiscoveryPaths,
  startAriaServer,
} from "@aria/server";
import {
  ARIA_SERVER_DAEMON_COMMAND,
  ariaServerHost,
  createAriaServerDaemonHostBootstrap,
  createAriaServerHostBootstrap,
  resolveAriaServerDaemonProcessSpec,
  runAriaServerDaemonHost,
  runAriaServerHost,
} from "aria-server";
import type { EngineServer } from "@aria/gateway/server";
import type { EngineRuntime } from "@aria/server/runtime";

describe("server host surface", () => {
  test("starts and stops the server shell through the public package boundary", async () => {
    const calls: string[] = [];
    let stopCalls = 0;
    let connectorStopCalls = 0;

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
        async startConnectors() {
          calls.push("startConnectors");
          return {
            handles: [],
            async stop() {
              connectorStopCalls += 1;
            },
          };
        },
      },
    });

    expect(app.runtime).toBe(runtime);
    expect(app.server).toBe(server);
    expect(calls).toEqual(["createRuntime", "startServer:0.0.0.0:9001", "startConnectors"]);

    await app.stop();
    expect(connectorStopCalls).toBe(1);
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
        async startConnectors() {
          return {
            handles: [],
            async stop() {},
          };
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
        async startConnectors() {
          return {
            handles: [],
            async stop() {},
          };
        },
      },
    });

    expect(app.runtime).toBe(runtime);
    expect(app.server).toBe(server);
  });

  test("exposes a daemon-host bootstrap over the app wrapper", () => {
    const bootstrap = createAriaServerDaemonHostBootstrap("/tmp/aria-server-app");
    expect(bootstrap.host).toBe(ariaServerHost);
    expect(bootstrap.hiddenCommand).toBe(ARIA_SERVER_DAEMON_COMMAND);
    expect(bootstrap.discoveryPaths).toEqual(getRuntimeDiscoveryPaths("/tmp/aria-server-app"));
    expect(typeof runAriaServerDaemonHost).toBe("function");
  });

  test("stops the server if connector auto-start fails after gateway boot", async () => {
    let serverStopCalls = 0;
    let runtimeCloseCalls = 0;

    const runtime = {
      close: async () => {
        runtimeCloseCalls += 1;
      },
    } as EngineRuntime;

    const server = {
      port: 7420,
      stop: async () => {
        serverStopCalls += 1;
      },
    } satisfies EngineServer;

    await expect(
      startAriaServer({
        factories: {
          async createRuntime() {
            return runtime;
          },
          async startServer() {
            return server;
          },
          async startConnectors() {
            throw new Error("connector boom");
          },
        },
      }),
    ).rejects.toThrow("connector boom");

    expect(serverStopCalls).toBe(1);
    expect(runtimeCloseCalls).toBe(0);
  });

  test("resolves an app-owned daemon process spec before falling back to the CLI host command", () => {
    expect(
      resolveAriaServerDaemonProcessSpec({
        execPath: "/usr/local/bin/bun",
        cliEntrypoint: "/tmp/aria-cli.mjs",
        appEntrypoint: "/Users/sichengchen/src/esperta-aria/apps/aria-server/src/main.ts",
      }),
    ).toEqual({
      executable: "/usr/local/bin/bun",
      args: ["/Users/sichengchen/src/esperta-aria/apps/aria-server/src/main.ts"],
      mode: "app_entry",
    });

    expect(
      resolveAriaServerDaemonProcessSpec({
        execPath: "/usr/local/bin/bun",
        cliEntrypoint: "/tmp/aria-cli.mjs",
        appEntrypoint: "/tmp/missing-aria-server-main.ts",
      }),
    ).toEqual({
      executable: "/usr/local/bin/bun",
      args: ["/tmp/aria-cli.mjs", ARIA_SERVER_DAEMON_COMMAND],
      mode: "cli_hidden_command",
    });
  });

  test("uses an explicit server main entry from the environment before CLI fallback", () => {
    expect(
      resolveAriaServerDaemonProcessSpec({
        execPath: "/Applications/Aria Desktop.app/Contents/MacOS/Electron",
        cliEntrypoint: "/tmp/aria-cli.mjs",
        env: {
          ARIA_SERVER_MAIN_ENTRY:
            "/Users/sichengchen/src/esperta-aria/apps/aria-server/src/main.ts",
          npm_execpath: "/opt/homebrew/bin/bun",
        },
      }),
    ).toEqual({
      executable: "/opt/homebrew/bin/bun",
      args: ["/Users/sichengchen/src/esperta-aria/apps/aria-server/src/main.ts"],
      mode: "app_entry",
    });
  });

  test("does not use Electron as the server daemon executable", () => {
    expect(
      resolveAriaServerDaemonProcessSpec({
        execPath: "/Applications/Aria Desktop.app/Contents/MacOS/Electron",
        cliEntrypoint: "/tmp/aria-cli.mjs",
        appEntrypoint: "/Users/sichengchen/src/esperta-aria/apps/aria-server/src/main.ts",
        env: { npm_execpath: "/opt/homebrew/bin/bun" },
      }),
    ).toEqual({
      executable: "/opt/homebrew/bin/bun",
      args: ["/Users/sichengchen/src/esperta-aria/apps/aria-server/src/main.ts"],
      mode: "app_entry",
    });

    expect(
      resolveAriaServerDaemonProcessSpec({
        execPath: "/Applications/Aria Desktop.app/Contents/MacOS/Electron",
        cliEntrypoint: "/tmp/aria-cli.mjs",
        appEntrypoint: "/tmp/missing-aria-server-main.ts",
        env: { npm_execpath: "/opt/homebrew/bin/bun" },
      }),
    ).toEqual({
      executable: "/opt/homebrew/bin/bun",
      args: ["/tmp/aria-cli.mjs", ARIA_SERVER_DAEMON_COMMAND],
      mode: "cli_hidden_command",
    });
  });
});
