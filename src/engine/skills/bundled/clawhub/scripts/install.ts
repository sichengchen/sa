#!/usr/bin/env bun
/**
 * ClawHub install script — install a skill by slug.
 * Usage: bun run install.ts <slug> [version]
 *
 * After a successful install, calls the engine's skill.reload endpoint
 * so the new skill is immediately discoverable.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { SkillInstaller } from "@sa/engine/clawhub/installer.js";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: bun run install.ts <slug> [version]");
  process.exit(1);
}
const version = process.argv[3] as string | undefined;

const saHome = process.env.SA_HOME ?? join(homedir(), ".sa");
const installer = new SkillInstaller(saHome);

try {
  const result = await installer.install(slug, version);
  console.log(`Installed skill "${result.name}" from ClawHub (${slug}).`);
  console.log(`Location: ${result.path}`);

  // Reload the engine's skill registry
  await reloadSkills(saHome);

  console.log("The skill is now available and can be activated.");
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ClawHub install failed: ${message}`);
  process.exit(1);
}

/** Call the engine's skill.reload tRPC endpoint */
async function reloadSkills(home: string): Promise<void> {
  try {
    const urlFile = join(home, "engine.url");
    const tokenFile = join(home, "engine.token");
    if (!existsSync(urlFile) || !existsSync(tokenFile)) return;

    const engineUrl = (await readFile(urlFile, "utf-8")).trim();
    const token = (await readFile(tokenFile, "utf-8")).trim();

    const res = await fetch(`${engineUrl}/skill.reload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      console.error(`Warning: skill reload returned ${res.status}`);
    }
  } catch {
    // Non-fatal — engine might not be running
  }
}
