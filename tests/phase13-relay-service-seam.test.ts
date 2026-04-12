import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EMBEDDED_SKILLS } from "@aria/engine/skills/embedded-skills.generated.js";
import { createAriaRelayServiceBootstrap } from "../services/aria-relay/src/index.js";

async function readText(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf-8");
}

describe("Phase 13 relay service seam", () => {
  test("creates a thin relay service wrapper over @aria/relay", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aria-relay-service-"));
    try {
      const bootstrap = createAriaRelayServiceBootstrap(join(dir, "relay-state.json"));
      expect(bootstrap.service.id).toBe("aria-relay");
      expect(bootstrap.service.sharedPackages).toContain("@aria/relay");
      const device = await bootstrap.relay.registerDevice({ deviceId: "device-1", label: "Phone", pairedAt: 1 });
      expect(device.deviceId).toBe("device-1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("consumes the public relay package instead of package src internals", async () => {
    const serviceSource = await readText("services/aria-relay/src/index.ts");
    expect(serviceSource).toContain('from "@aria/relay"');
    expect(serviceSource).not.toContain("packages/relay/src");
  });

  test("tracks the relay service seam in docs and embedded docs", async () => {
    const [docsReadme, developmentReadme, migration, extractionLedger, packagesDoc, relayDoc, bundledLedger] = await Promise.all([
      readText("docs/README.md"),
      readText("docs/development/README.md"),
      readText("docs/development/migration.md"),
      readText("docs/development/package-extraction-ledger.md"),
      readText("docs/new-architecture/packages.md"),
      readText("docs/new-architecture/relay.md"),
      readText("packages/runtime/src/skills/bundled/aria/docs/development/phase-13-relay-service-seam-ledger.md"),
    ]);
    expect(docsReadme).toContain("phase-13-relay-service-seam-ledger.md");
    expect(developmentReadme).toContain("phase-13-relay-service-seam-ledger.md");
    expect(migration).toContain("Phase 13 Relay Service Seam");
    expect(extractionLedger).toContain("## Phase 13 Extracted Ownership");
    expect(packagesDoc).toContain("phase-13-relay-service-seam-ledger.md");
    expect(relayDoc).toContain("phase-13-relay-service-seam-ledger.md");
    expect(bundledLedger).toContain("services/aria-relay");
    expect(EMBEDDED_SKILLS.aria?.["docs/development/phase-13-relay-service-seam-ledger.md"]).toBe(bundledLedger);
  });
});
