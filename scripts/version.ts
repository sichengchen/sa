#!/usr/bin/env bun
/**
 * CalVer version bump script.
 *
 * Format: YYYY.M.patch
 *   YYYY  = full year
 *   M     = month (no zero-padding)
 *   patch = incremental within the month, starting at 0
 *
 * Usage:
 *   bun run scripts/version.ts          # bump + create git tag
 *   bun run scripts/version.ts --push   # bump + tag + push tag
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const pkgPath = resolve(import.meta.dir, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const current = pkg.version as string;

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1; // 1-indexed

// Parse current version
const parts = current.split(".");
const curYear = parseInt(parts[0], 10);
const curMonth = parseInt(parts[1], 10);
const curPatch = parseInt(parts[2], 10);

let nextVersion: string;
if (curYear === year && curMonth === month) {
  // Same month — increment patch
  nextVersion = `${year}.${month}.${curPatch + 1}`;
} else {
  // New month — reset patch
  nextVersion = `${year}.${month}.0`;
}

// Write back
pkg.version = nextVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// Stage and tag
execSync(`git add ${pkgPath}`, { stdio: "inherit" });
execSync(`git commit -m "chore: bump version to ${nextVersion}"`, { stdio: "inherit" });
execSync(`git tag v${nextVersion}`, { stdio: "inherit" });

console.log(`\nVersion bumped: ${current} → ${nextVersion}`);
console.log(`Tag created: v${nextVersion}`);

// Optional push
if (process.argv.includes("--push")) {
  execSync(`git push && git push origin v${nextVersion}`, { stdio: "inherit" });
  console.log("Tag pushed — release workflow will trigger.");
}
