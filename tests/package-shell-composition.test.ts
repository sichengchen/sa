import { describe, expect, test } from "bun:test";

import { ariaServerApp, createAriaServerBootstrap } from "@aria/server";

describe("package shell composition", () => {
  test("@aria/server exposes package-owned server shell metadata and bootstrap discovery", () => {
    const bootstrap = createAriaServerBootstrap({
      runtimeHome: "/tmp/aria-shell-test",
      hostname: "127.0.0.1",
      port: 7420,
    });

    expect(ariaServerApp).toMatchObject({
      id: "aria-server",
      displayName: "Esperta Aria",
      runtimeName: "Aria Runtime",
      cliName: "aria",
      surface: "server",
    });
    expect(ariaServerApp.capabilities).toContain("aria-agent-host");
    expect(ariaServerApp.ownership).toMatchObject({
      ariaAgent: "server-only",
      memory: "server-only",
      automation: "server-only",
      connectors: "server-only",
      projectLocalExecution: "unsupported",
    });
    expect(ariaServerApp.sharedPackages).toEqual(["@aria/runtime", "@aria/gateway"]);
    expect(bootstrap).toMatchObject({
      app: ariaServerApp,
      runtimeHome: "/tmp/aria-shell-test",
      hostname: "127.0.0.1",
      port: 7420,
    });
    expect(bootstrap.discovery).toMatchObject({
      pidFile: "/tmp/aria-shell-test/engine.pid",
      urlFile: "/tmp/aria-shell-test/engine.url",
      logFile: "/tmp/aria-shell-test/engine.log",
      restartMarkerFile: "/tmp/aria-shell-test/engine.restart",
    });
  });
});
