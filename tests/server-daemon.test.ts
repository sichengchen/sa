import { describe, expect, test } from "bun:test";
import { HOME_ENV_VAR, createEngineDaemonController, getRuntimeDiscoveryPaths } from "@aria/server";

function createDaemonHarness() {
  const discoveryPaths = getRuntimeDiscoveryPaths("/tmp/aria-daemon-test");
  const files = new Map<string, string>();
  const alivePids = new Set<number>();
  const logs: string[] = [];
  const errors: string[] = [];
  const killCalls: Array<{ pid: number; signal?: NodeJS.Signals | 0 }> = [];
  const spawnCalls: Array<{
    runtimeHome: string;
    logFile: string;
    env?: NodeJS.ProcessEnv;
  }> = [];
  const spawnChecks: Array<() => void> = [];
  let nextSpawnPid = 9001;
  let fetchStatus = "ok";
  let fetchThrows = false;

  const controller = createEngineDaemonController({
    discoveryPaths,
    env: { [HOME_ENV_VAR]: discoveryPaths.runtimeHome },
    dependencies: {
      existsSync(path) {
        return files.has(path);
      },
      async readFile(path) {
        const value = files.get(path);
        if (value === undefined) {
          throw new Error(`Missing file: ${path}`);
        }
        return value;
      },
      async unlink(path) {
        files.delete(path);
      },
      async sleep() {},
      spawnDaemonHost(options) {
        spawnCalls.push(options);
        spawnChecks.forEach((check) => check());
        const pid = nextSpawnPid;
        alivePids.add(pid);
        files.set(discoveryPaths.pidFile, `${pid}\n`);
        files.set(discoveryPaths.urlFile, `http://127.0.0.1:${pid}`);
        return { pid };
      },
      isProcessAlive(pid) {
        return alivePids.has(pid);
      },
      kill(pid, signal) {
        killCalls.push({ pid, signal });
        if (signal !== 0) {
          alivePids.delete(pid);
        }
      },
      async fetch() {
        if (fetchThrows) {
          throw new Error("unreachable");
        }
        return {
          ok: true,
          async json() {
            return { status: fetchStatus };
          },
        };
      },
      log(message) {
        logs.push(message);
      },
      error(message) {
        errors.push(message);
      },
      exit(code) {
        throw new Error(`exit:${code}`);
      },
    },
  });

  return {
    controller,
    discoveryPaths,
    files,
    alivePids,
    logs,
    errors,
    killCalls,
    spawnCalls,
    spawnChecks,
    setNextSpawnPid(pid: number) {
      nextSpawnPid = pid;
    },
    setFetchStatus(status: string) {
      fetchStatus = status;
    },
    setFetchThrows(value: boolean) {
      fetchThrows = value;
    },
  };
}

describe("server daemon controller", () => {
  test("cleans stale discovery files before starting a new daemon", async () => {
    const harness = createDaemonHarness();
    harness.files.set(harness.discoveryPaths.pidFile, "41\n");
    harness.files.set(harness.discoveryPaths.urlFile, "http://127.0.0.1:41\n");
    harness.spawnChecks.push(() => {
      expect(harness.files.has(harness.discoveryPaths.pidFile)).toBe(false);
      expect(harness.files.has(harness.discoveryPaths.urlFile)).toBe(false);
    });

    await harness.controller.startEngine();

    expect(harness.spawnCalls).toEqual([
      expect.objectContaining({
        runtimeHome: "/tmp/aria-daemon-test",
        logFile: "/tmp/aria-daemon-test/engine.log",
        env: expect.objectContaining({
          [HOME_ENV_VAR]: "/tmp/aria-daemon-test",
        }),
      }),
    ]);
    expect(harness.logs).toEqual([
      "Aria Runtime started (PID 9001).",
      "Listening on http://127.0.0.1:9001",
    ]);
    expect(harness.errors).toEqual([]);
  });

  test("restarts an active daemon by stopping the current pid before spawning a replacement", async () => {
    const harness = createDaemonHarness();
    harness.files.set(harness.discoveryPaths.pidFile, "321\n");
    harness.files.set(harness.discoveryPaths.urlFile, "http://127.0.0.1:321\n");
    harness.alivePids.add(321);
    harness.setNextSpawnPid(654);
    harness.spawnChecks.push(() => {
      expect(harness.files.has(harness.discoveryPaths.pidFile)).toBe(false);
      expect(harness.files.has(harness.discoveryPaths.urlFile)).toBe(false);
    });

    await harness.controller.restartEngine();

    expect(harness.killCalls).toEqual([{ pid: 321, signal: "SIGTERM" }]);
    expect(harness.spawnCalls).toHaveLength(1);
    expect(harness.files.get(harness.discoveryPaths.pidFile)).toBe("654\n");
    expect(harness.logs).toEqual([
      "Aria Runtime stopped.",
      "Aria Runtime started (PID 654).",
      "Listening on http://127.0.0.1:654",
    ]);
  });

  test("reports daemon status with URL and health when reachable", async () => {
    const harness = createDaemonHarness();
    harness.files.set(harness.discoveryPaths.pidFile, "777\n");
    harness.files.set(harness.discoveryPaths.urlFile, "http://127.0.0.1:777\n");
    harness.alivePids.add(777);
    harness.setFetchStatus("ok");

    await harness.controller.statusEngine();

    expect(harness.logs).toEqual([
      "Aria Runtime: running (PID 777)",
      "URL: http://127.0.0.1:777",
      "Status: ok",
    ]);

    harness.logs.length = 0;
    harness.setFetchThrows(true);
    await harness.controller.statusEngine();
    expect(harness.logs).toEqual([
      "Aria Runtime: running (PID 777)",
      "URL: http://127.0.0.1:777",
      "Status: unreachable (may still be starting)",
    ]);
  });
});
