import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { EMBEDDED_SKILLS } from "@aria/engine/skills/embedded-skills.generated.js";

const PHASE8_LEDGER_PATH = "docs/development/phase-8-client-shell-seams-ledger.md";
const REQUIRED_PHASE8_SURFACES = ["@aria/desktop", "@aria/mobile"];
const REQUIRED_PHASE8_FOUNDATIONS = [
  "apps/aria-desktop",
  "apps/aria-mobile",
  "@aria/access-client",
  "@aria/ui",
  "@aria/projects",
];

async function readText(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf-8");
}

describe("Phase 8 client shell seam docs", () => {
  test("tracks the phase 8 ledger from the development docs", async () => {
    const [docsReadme, developmentReadme, migration, extractionLedger, ledger] = await Promise.all([
      readText("docs/README.md"),
      readText("docs/development/README.md"),
      readText("docs/development/migration.md"),
      readText("docs/development/package-extraction-ledger.md"),
      readText(PHASE8_LEDGER_PATH),
    ]);

    expect(docsReadme).toContain("phase-8-client-shell-seams-ledger.md");
    expect(developmentReadme).toContain("phase-8-client-shell-seams-ledger.md");
    expect(migration).toContain("Phase 8 Client Shell Seams");
    expect(migration).toContain("./phase-8-client-shell-seams-ledger.md");
    expect(extractionLedger).toContain("## Phase 8 Extracted Ownership");
    expect(ledger).toContain("phase-9-architecture-truth-table.md");
    expect(ledger).toContain("hybrid target shells");
    expect(ledger).not.toContain("remain thin wrappers over those shells");
    expect(ledger).not.toContain("thin compatibility wrappers");

    for (const surface of [...REQUIRED_PHASE8_SURFACES, ...REQUIRED_PHASE8_FOUNDATIONS]) {
      expect(ledger).toContain(surface);
    }
  });

  test("keeps architecture docs aligned with the phase 8 client shell seams", async () => {
    const [packagesDoc, serverDoc, desktopMobileDoc] = await Promise.all([
      readText("docs/new-architecture/packages.md"),
      readText("docs/new-architecture/server.md"),
      readText("docs/new-architecture/desktop-and-mobile.md"),
    ]);

    for (const doc of [packagesDoc, serverDoc, desktopMobileDoc]) {
      expect(doc).toContain("phase-8-client-shell-seams-ledger.md");
    }

    for (const surface of REQUIRED_PHASE8_SURFACES) {
      expect(packagesDoc).toContain(surface);
      expect(desktopMobileDoc).toContain(surface);
    }
  });

  test("refreshes bundled and embedded Aria docs for the phase 8 ledger", async () => {
    const [bundledLedger, bundledPackagesDoc, bundledDesktopMobileDoc, bundledServerDoc] =
      await Promise.all([
        readText("packages/runtime/src/skills/bundled/aria/docs/development/phase-8-client-shell-seams-ledger.md"),
        readText("packages/runtime/src/skills/bundled/aria/docs/new-architecture/packages.md"),
        readText("packages/runtime/src/skills/bundled/aria/docs/new-architecture/desktop-and-mobile.md"),
        readText("packages/runtime/src/skills/bundled/aria/docs/new-architecture/server.md"),
      ]);
    const embeddedDocs = EMBEDDED_SKILLS.aria ?? {};

    for (const surface of [...REQUIRED_PHASE8_SURFACES, ...REQUIRED_PHASE8_FOUNDATIONS]) {
      expect(bundledLedger).toContain(surface);
    }

    expect(bundledPackagesDoc).toContain("phase-8-client-shell-seams-ledger.md");
    expect(bundledDesktopMobileDoc).toContain("phase-8-client-shell-seams-ledger.md");
    expect(bundledServerDoc).toContain("phase-8-client-shell-seams-ledger.md");

    expect(embeddedDocs[PHASE8_LEDGER_PATH]).toBe(bundledLedger);
    expect(embeddedDocs["docs/README.md"]).toContain("phase-8-client-shell-seams-ledger.md");
    expect(embeddedDocs["docs/development/README.md"]).toContain("phase-8-client-shell-seams-ledger.md");
    expect(embeddedDocs["docs/new-architecture/packages.md"]).toContain("phase-8-client-shell-seams-ledger.md");
    expect(embeddedDocs["docs/new-architecture/desktop-and-mobile.md"]).toContain(
      "phase-8-client-shell-seams-ledger.md",
    );
    expect(embeddedDocs["docs/new-architecture/server.md"]).toContain("phase-8-client-shell-seams-ledger.md");
  });
});
