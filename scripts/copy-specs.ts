#!/usr/bin/env bun
/**
 * Copies specs/ → src/engine/skills/bundled/aria/specs/ so that
 * embed-skills.ts picks them up for single-binary builds.
 * No-op if specs/ doesn't exist.
 */
import { existsSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "specs");
const DEST = join(ROOT, "src", "engine", "skills", "bundled", "aria", "specs");
const LEGACY_DEST = join(ROOT, "src", "engine", "skills", "bundled", "sa", "specs");

if (!existsSync(SRC)) {
  console.log("specs/ not found — skipping copy-specs");
  process.exit(0);
}

// Clean destinations first
if (existsSync(LEGACY_DEST)) {
  rmSync(LEGACY_DEST, { recursive: true });
}
if (existsSync(DEST)) {
  rmSync(DEST, { recursive: true });
}

cpSync(SRC, DEST, { recursive: true });

console.log(`Copied specs/ → ${DEST}`);
