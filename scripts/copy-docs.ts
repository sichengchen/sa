#!/usr/bin/env bun
/**
 * Copies docs/ → src/engine/skills/bundled/aria/docs/ so that
 * embed-skills.ts picks them up for single-binary builds.
 * No-op if docs/ doesn't exist.
 */
import { existsSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "docs");
const DEST = join(ROOT, "src", "engine", "skills", "bundled", "aria", "docs");
const LEGACY_DESTS = [
  join(ROOT, "src", "engine", "skills", "bundled", "aria", "specs"),
];

if (!existsSync(SRC)) {
  console.log("docs/ not found — skipping copy-docs");
  process.exit(0);
}

// Clean destinations first
for (const target of [...LEGACY_DESTS, DEST]) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true });
  }
}

cpSync(SRC, DEST, { recursive: true });

console.log(`Copied docs/ → ${DEST}`);
