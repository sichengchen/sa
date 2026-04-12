import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { EMBEDDED_SKILLS } from "@aria/engine/skills/embedded-skills.generated.js";

const PHASE9_LEDGER_PATH = "docs/development/phase-9-architecture-truth-table.md";
const REQUIRED_TARGET_SURFACES = [
  "@aria/server",
  "@aria/desktop",
  "@aria/mobile",
  "@aria/projects",
  "@aria/workspaces",
  "@aria/jobs",
  "@aria/agents-coding",
  "@aria/access-client",
  "@aria/ui",
];
const REQUIRED_LEGACY_SURFACES = [
  "@aria/runtime",
  "@aria/projects-engine",
  "packages/connectors",
  "@aria/providers-{codex,claude-code,opencode}",
  "@aria/shared-types",
  "packages/cli",
];

async function readText(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf-8");
}

describe("Phase 9 architecture truth-table docs", () => {
  test("tracks the phase 9 truth table from the development docs", async () => {
    const [docsReadme, developmentReadme, migration, extractionLedger, ledger] = await Promise.all([
      readText("docs/README.md"),
      readText("docs/development/README.md"),
      readText("docs/development/migration.md"),
      readText("docs/development/package-extraction-ledger.md"),
      readText(PHASE9_LEDGER_PATH),
    ]);

    expect(docsReadme).toContain("phase-9-architecture-truth-table.md");
    expect(developmentReadme).toContain("phase-9-architecture-truth-table.md");
    expect(migration).toContain("Phase 9 Architecture Truth Table");
    expect(migration).toContain("./phase-9-architecture-truth-table.md");
    expect(extractionLedger).toContain("## Phase 9 Architecture Truth Table");

    for (const classification of [
      "target-owned",
      "hybrid target shell",
      "legacy-owned seam",
      "legacy-only compatibility surface",
    ]) {
      expect(ledger).toContain(classification);
    }

    for (const surface of [...REQUIRED_TARGET_SURFACES, ...REQUIRED_LEGACY_SURFACES]) {
      expect(ledger).toContain(surface);
    }
  });

  test("keeps architecture docs aligned with the phase 9 ownership truth table", async () => {
    const [packagesDoc, serverDoc, desktopMobileDoc] = await Promise.all([
      readText("docs/new-architecture/packages.md"),
      readText("docs/new-architecture/server.md"),
      readText("docs/new-architecture/desktop-and-mobile.md"),
    ]);

    for (const doc of [packagesDoc, serverDoc, desktopMobileDoc]) {
      expect(doc).toContain("phase-9-architecture-truth-table.md");
    }

    for (const surface of ["@aria/server", "@aria/desktop", "@aria/mobile"]) {
      expect(packagesDoc).toContain(surface);
      expect(documentsForClientShellCheck([desktopMobileDoc, serverDoc])).toContain(surface);
    }
  });

  test("refreshes bundled and embedded Aria docs for the phase 9 ledger", async () => {
    const [bundledLedger, bundledPackagesDoc, bundledDesktopMobileDoc, bundledServerDoc] =
      await Promise.all([
        readText("packages/runtime/src/skills/bundled/aria/docs/development/phase-9-architecture-truth-table.md"),
        readText("packages/runtime/src/skills/bundled/aria/docs/new-architecture/packages.md"),
        readText("packages/runtime/src/skills/bundled/aria/docs/new-architecture/desktop-and-mobile.md"),
        readText("packages/runtime/src/skills/bundled/aria/docs/new-architecture/server.md"),
      ]);
    const embeddedDocs = EMBEDDED_SKILLS.aria ?? {};

    for (const surface of [...REQUIRED_TARGET_SURFACES, ...REQUIRED_LEGACY_SURFACES]) {
      expect(bundledLedger).toContain(surface);
    }

    expect(bundledPackagesDoc).toContain("phase-9-architecture-truth-table.md");
    expect(bundledDesktopMobileDoc).toContain("phase-9-architecture-truth-table.md");
    expect(bundledServerDoc).toContain("phase-9-architecture-truth-table.md");

    expect(embeddedDocs[PHASE9_LEDGER_PATH]).toBe(bundledLedger);
    expect(embeddedDocs["docs/README.md"]).toContain("phase-9-architecture-truth-table.md");
    expect(embeddedDocs["docs/development/README.md"]).toContain("phase-9-architecture-truth-table.md");
    expect(embeddedDocs["docs/new-architecture/packages.md"]).toContain("phase-9-architecture-truth-table.md");
    expect(embeddedDocs["docs/new-architecture/desktop-and-mobile.md"]).toContain(
      "phase-9-architecture-truth-table.md",
    );
    expect(embeddedDocs["docs/new-architecture/server.md"]).toContain("phase-9-architecture-truth-table.md");
  });
});

function documentsForClientShellCheck(docs: string[]): string {
  return docs.join("\n");
}
