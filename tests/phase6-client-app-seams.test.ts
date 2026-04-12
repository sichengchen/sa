import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { EMBEDDED_SKILLS } from "@aria/engine/skills/embedded-skills.generated.js";

const PHASE6_LEDGER_PATH = "docs/development/phase-6-client-app-seams-ledger.md";
const REQUIRED_PHASE6_SURFACES = [
  "@aria/access-client",
  "@aria/ui",
  "apps/aria-desktop",
  "apps/aria-mobile",
];

async function readText(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf-8");
}

describe("Phase 6 client app seam docs", () => {
  test("tracks the phase 6 ledger from the development docs", async () => {
    const [docsReadme, developmentReadme, migration, ledger] = await Promise.all([
      readText("docs/README.md"),
      readText("docs/development/README.md"),
      readText("docs/development/migration.md"),
      readText(PHASE6_LEDGER_PATH),
    ]);

    expect(docsReadme).toContain("phase-6-client-app-seams-ledger.md");
    expect(docsReadme).not.toContain("phase-6-client-seams-ledger.md");
    expect(developmentReadme).toContain("phase-6-client-app-seams-ledger.md");
    expect(migration).toContain("Phase 6 Client App Seams");
    expect(migration).toContain("./phase-6-client-app-seams-ledger.md");

    for (const surface of REQUIRED_PHASE6_SURFACES) {
      expect(ledger).toContain(surface);
    }
  });

  test("keeps architecture docs aligned with the phase 6 client seams", async () => {
    const [packagesDoc, serverDoc, desktopMobileDoc, bundledDesktopMobileDoc] = await Promise.all([
      readText("docs/new-architecture/packages.md"),
      readText("docs/new-architecture/server.md"),
      readText("docs/new-architecture/desktop-and-mobile.md"),
      readText("packages/runtime/src/skills/bundled/aria/docs/new-architecture/desktop-and-mobile.md"),
    ]);

    expect(packagesDoc).toContain("phase-6-client-app-seams-ledger.md");
    expect(serverDoc).toContain("phase-6-client-app-seams-ledger.md");
    expect(desktopMobileDoc).toContain("phase-6-client-app-seams-ledger.md");
    expect(desktopMobileDoc).not.toContain("phase-6-client-seams-ledger.md");
    expect(bundledDesktopMobileDoc).toContain("phase-6-client-app-seams-ledger.md");
    expect(bundledDesktopMobileDoc).not.toContain("phase-6-client-seams-ledger.md");

    for (const surface of REQUIRED_PHASE6_SURFACES) {
      expect(packagesDoc).toContain(surface);
      expect(desktopMobileDoc).toContain(surface);
    }
  });

  test("refreshes bundled and embedded Aria docs for the phase 6 ledger", async () => {
    const bundledLedger = await readText(
      "packages/runtime/src/skills/bundled/aria/docs/development/phase-6-client-app-seams-ledger.md",
    );
    const embeddedDocs = EMBEDDED_SKILLS.aria ?? {};

    for (const surface of REQUIRED_PHASE6_SURFACES) {
      expect(bundledLedger).toContain(surface);
    }

    expect(embeddedDocs["docs/development/phase-6-client-app-seams-ledger.md"]).toBe(bundledLedger);
    expect(embeddedDocs["docs/README.md"]).toContain("phase-6-client-app-seams-ledger.md");
    expect(embeddedDocs["docs/development/README.md"]).toContain("phase-6-client-app-seams-ledger.md");
    expect(embeddedDocs["docs/new-architecture/desktop-and-mobile.md"]).toContain("phase-6-client-app-seams-ledger.md");
    expect(embeddedDocs["docs/new-architecture/desktop-and-mobile.md"]).not.toContain("phase-6-client-seams-ledger.md");
  });
});
