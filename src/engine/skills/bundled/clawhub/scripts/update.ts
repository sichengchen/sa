#!/usr/bin/env bun
/**
 * ClawHub update script — check for and apply skill updates.
 * Usage: bun run update.ts [slug]
 *
 * Pass a slug to update one skill, or omit to check all installed skills.
 * Calls the engine's skill.reload endpoint if any updates are applied.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ClawHubClient } from "../lib/client.js";
import { SkillInstaller } from "../lib/installer.js";

const slug = process.argv[2] as string | undefined;

const saHome = process.env.SA_HOME ?? join(homedir(), ".sa");
const client = new ClawHubClient();
const installer = new SkillInstaller(saHome, client);

try {
  const installed = await installer.listInstalled();
  if (installed.length === 0) {
    console.log("No ClawHub skills are installed. Nothing to update.");
    process.exit(0);
  }

  const toCheck = slug
    ? installed.filter((e) => e.slug === slug)
    : installed;

  if (toCheck.length === 0) {
    console.error(`Skill "${slug}" is not installed from ClawHub.`);
    process.exit(1);
  }

  const updates: string[] = [];
  const errors: string[] = [];

  for (const entry of toCheck) {
    try {
      const detail = await client.getSkill(entry.slug);
      if (detail.version !== entry.version) {
        await installer.install(entry.slug, detail.version);
        updates.push(
          `Updated "${entry.name}" (${entry.slug}): ${entry.version} → ${detail.version}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to check "${entry.slug}": ${msg}`);
    }
  }

  // Reload engine skill registry if anything was updated
  if (updates.length > 0) {
    await reloadSkills(saHome);
  }

  if (updates.length > 0) {
    console.log(`Updated ${updates.length} skill(s):`);
    console.log(updates.join("\n"));
  } else {
    console.log("All installed skills are up to date.");
  }
  if (errors.length > 0) {
    console.error(`\nErrors:\n${errors.join("\n")}`);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ClawHub update failed: ${message}`);
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
