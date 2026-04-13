#!/usr/bin/env bun
/**
 * Updates the Homebrew tap formula with the current version and checksum.
 *
 * Uses the GitHub API to commit the formula directly — no git clone needed.
 *
 * Requires:
 *   TAP_GITHUB_TOKEN env var — a GitHub PAT with repo scope for the tap repo
 *
 * Usage (called by .github/workflows/release.yml):
 *   bun run scripts/update-homebrew.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const TAP_REPO = "sichengchen/homebrew-tap";
const FORMULA_PATH = "Formula/aria.rb";
const APP_REPO = process.env.GITHUB_REPOSITORY;

const token = process.env.TAP_GITHUB_TOKEN;
if (!token) {
  console.error("Error: TAP_GITHUB_TOKEN env var is required");
  process.exit(1);
}
if (!APP_REPO) {
  console.error("Error: GITHUB_REPOSITORY env var is required");
  process.exit(1);
}

// Read version from package.json
const pkgPath = resolve(import.meta.dir, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const version = pkg.version as string;

// Read checksum from local artifact file
const checksumContent = readFileSync(
  resolve(import.meta.dir, "..", "artifacts", "aria-darwin.sha256"),
  "utf-8",
);
const sha = checksumContent.trim().split(/\s+/)[0];

console.log(`Version: ${version}`);
console.log(`SHA256: ${sha}`);

// Generate formula content
const formula = `class Aria < Formula
  desc "Local-first agent platform"
  homepage "https://github.com/${APP_REPO}"
  version "${version}"
  license "MIT"

  url "https://github.com/${APP_REPO}/releases/download/v${version}/aria-darwin"
  sha256 "${sha}"

  depends_on "oven-sh/bun/bun"

  def install
    bin.install "aria-darwin" => "aria"
  end

  service do
    run [opt_bin/"aria", "engine", "start"]
    working_dir Dir.home
    environment_variables ARIA_HOME: "#{Dir.home}/.aria", PATH: "#{HOMEBREW_PREFIX}/bin:#{HOMEBREW_PREFIX}/sbin:/usr/bin:/bin:/usr/sbin:/sbin"
  end

  test do
    assert_match "Usage: aria", shell_output("#{bin}/aria --help")
  end
end
`;

const api = `https://api.github.com/repos/${TAP_REPO}/contents/${FORMULA_PATH}`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// Get current file SHA (needed for updates, absent for creation)
let fileSha: string | undefined;
const getRes = await fetch(api, { headers });
if (getRes.ok) {
  const data = (await getRes.json()) as { sha: string };
  fileSha = data.sha;
}

// Commit the formula via the Contents API
const body: Record<string, string> = {
  message: `aria ${version}`,
  content: Buffer.from(formula).toString("base64"),
};
if (fileSha) body.sha = fileSha;

const putRes = await fetch(api, {
  method: "PUT",
  headers,
  body: JSON.stringify(body),
});

if (!putRes.ok) {
  const err = await putRes.text();
  console.error(`Failed to update formula: ${putRes.status} ${err}`);
  process.exit(1);
}

console.log(`\nHomebrew formula updated to ${version}`);
