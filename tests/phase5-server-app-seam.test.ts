import { describe, expect, test } from "bun:test";
import { CLI_NAME, PRODUCT_NAME, engineCommand, ensureEngine, getRuntimeDiscoveryPaths, startAriaServer } from "@aria/server";
import type { EngineServer } from "@aria/gateway/server";
import type { EngineRuntime } from "@aria/runtime/runtime";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ariaServerHost, createAriaServerHostBootstrap } from "../apps/aria-server/src/index.js";

function readRepoJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(import.meta.dir, "..", relativePath), "utf-8")) as T;
}

function readRepoFile(relativePath: string): string {
  return readFileSync(join(import.meta.dir, "..", relativePath), "utf-8");
}

type WorkspacePackageJson = {
  name?: string;
  main?: string;
  types?: string;
  scripts?: Record<string, string>;
  exports?: Record<string, string>;
};

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

  test("exposes a server-app host bootstrap over the public server seam", async () => {
    const bootstrap = createAriaServerHostBootstrap("/tmp/aria-server-app");

    expect(bootstrap.host).toEqual(ariaServerHost);
    expect(bootstrap.host.shellPackage).toBe("@aria/server");
    expect(bootstrap.host.sharedPackages).toContain("@aria/runtime");
    expect(bootstrap.discoveryPaths.pidFile).toBe("/tmp/aria-server-app/engine.pid");

    const runtime = {
      close: async () => {},
    } as EngineRuntime;
    const server = {
      port: 7420,
      stop: async () => {},
    } satisfies EngineServer;

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

  test("keeps runnable dev entrypoints on the server package and thin server app wrapper", () => {
    const serverPackage = readRepoJson<WorkspacePackageJson>("packages/server/package.json");
    const serverApp = readRepoJson<WorkspacePackageJson>("apps/aria-server/package.json");
    const serverAppSource = readRepoFile("apps/aria-server/src/index.ts");
    const serverAppMainSource = readRepoFile("apps/aria-server/src/main.ts").trim();

    expect(serverPackage.name).toBe("@aria/server");
    expect(serverPackage.main).toBe("./src/index.ts");
    expect(serverPackage.types).toBe("./src/index.ts");
    expect(serverPackage.exports?.["."]).toBe("./src/index.ts");
    expect(serverPackage.scripts?.dev).toBe("bun ./src/engine.ts");

    expect(serverApp.name).toBe("aria-server");
    expect(serverApp.main).toBe("./src/index.ts");
    expect(serverApp.scripts?.dev).toBe("bun ./src/main.ts");
    expect(serverApp.scripts?.start).toBe("bun ./src/main.ts");
    expect(serverAppSource).toContain('from "@aria/server"');
    expect(serverAppSource).not.toContain('from "@aria/server/engine"');
    expect(serverAppMainSource).toBe('import "@aria/server/engine";');
  });
});
