#!/usr/bin/env bun
/**
 * Copies docs/ into the package-owned bundled skill tree.
 * No-op if docs/ doesn't exist.
 */
import { existsSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "docs");
const DESTS = [join(ROOT, "packages", "runtime", "src", "skills", "bundled", "aria", "docs")];

if (!existsSync(SRC)) {
  console.log("docs/ not found — skipping copy-docs");
  process.exit(0);
}

// Clean destinations first
for (const target of DESTS) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true });
  }
}

for (const target of DESTS) {
  cpSync(SRC, target, { recursive: true });
}

console.log(`Copied docs/ → ${DESTS.join(", ")}`);
