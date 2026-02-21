---
id: 52
title: CalVer versioning, GitHub Actions CI/CD, and Homebrew tap distribution
status: done
type: feature
priority: 1
phase: 004-dx-distribution
branch: feature/004-dx-distribution
created: 2026-02-21
shipped_at: 2026-02-21
pr: https://github.com/sichengchen/sa/pull/9
---
# CalVer versioning, GitHub Actions CI/CD, and Homebrew tap distribution

## Context
SA currently has no CI/CD, no release process, and no distribution channel. The build (`bun build src/cli/index.ts --outdir dist --target bun`) produces a single 7.1 MB executable at `dist/index.js` with a `#!/usr/bin/env bun` shebang, but:

- `package.json` version is `0.1.0` (placeholder semver)
- `package.json` `bin` field points to source (`src/cli/index.ts`), not dist
- No GitHub Actions workflows exist (no `.github/` directory)
- No version bump scripts
- No Homebrew formula or tap
- No GitHub Releases

The user wants CalVer (`YYYY.MM.patch`), a full CI pipeline, auto-releases on tags, and a Homebrew tap for macOS install/update.

### Dependencies
- Bun must be installed on the target machine (the built binary uses `#!/usr/bin/env bun`)
- A separate GitHub repo is needed for the Homebrew tap (e.g., `sichengchen/homebrew-tap`)

## Approach

### 1. Adopt CalVer in package.json
Switch version from `0.1.0` to CalVer format: `YYYY.M.patch` (e.g., `2026.2.0`).

- `YYYY` = full year
- `M` = month (no zero-padding, so February = `2`)
- `patch` = incremental within the month, starting at 0

### 2. Create version bump scripts
Add a `scripts/version.ts` Bun script that:
- Reads current version from `package.json`
- Computes the next version: if current month matches, increment patch; otherwise reset to `YYYY.M.0`
- Writes updated version to `package.json`
- Creates a git tag `v{version}`
- Optionally pushes the tag (`--push` flag)

Add npm scripts:
- `bun run version:bump` — bump version + tag
- `bun run version:bump -- --push` — bump + tag + push (triggers release)

### 3. Fix build output and bin field
- Update `package.json` `bin` to point to `dist/index.js` (the built executable) for distribution
- Keep `src/cli/index.ts` as main entry for development
- Ensure `bun run build` produces a correct, self-contained binary

### 4. GitHub Actions CI workflow
Create `.github/workflows/ci.yml`:
- **Trigger**: push to `main`, pull requests to `main`
- **Runner**: `ubuntu-latest` (Bun runs on Linux)
- **Steps**:
  1. Checkout
  2. Setup Bun (`oven-sh/setup-bun@v2`)
  3. `bun install`
  4. `bun run lint`
  5. `bun run typecheck`
  6. `bun test`
  7. `bun run build`
  8. Upload `dist/` as artifact (on main branch only)

### 5. GitHub Actions release workflow
Create `.github/workflows/release.yml`:
- **Trigger**: push of tags matching `v*`
- **Runner**: `macos-latest` (build for macOS, the primary target)
- **Strategy matrix**: Build on both `macos-latest` (ARM64) and `macos-13` (x86_64) for broad macOS coverage
- **Steps**:
  1. Checkout
  2. Setup Bun
  3. `bun install`
  4. `bun run build`
  5. Rename binary: `sa-darwin-arm64` / `sa-darwin-x86_64`
  6. Create GitHub Release via `softprops/action-gh-release@v2`
  7. Attach built binaries to the release
  8. Generate SHA256 checksums and attach

### 6. Homebrew tap
Create a separate repo `sichengchen/homebrew-tap` with a formula `Formula/sa.rb`:
- **Dependencies**: `bun` (Homebrew formula exists)
- **Install method**: Download the pre-built binary from GitHub Releases, install to `bin/sa`
- **Update**: `brew upgrade sa` pulls the latest release binary
- **Formula template**:
  ```ruby
  class Sa < Formula
    desc "Personal AI agent assistant"
    homepage "https://github.com/sichengchen/sa"
    version "YYYY.M.P"

    on_arm do
      url "https://github.com/sichengchen/sa/releases/download/vYYYY.M.P/sa-darwin-arm64"
      sha256 "ARM_SHA"
    end
    on_intel do
      url "https://github.com/sichengchen/sa/releases/download/vYYYY.M.P/sa-darwin-x86_64"
      sha256 "INTEL_SHA"
    end

    depends_on "bun"

    def install
      binary = Dir["sa-darwin-*"].first
      bin.install binary => "sa"
    end
  end
  ```

### 7. Formula update script
Add `scripts/update-homebrew.ts` that:
- Reads the current version from `package.json`
- Downloads the release SHA256 checksums from GitHub
- Updates `Formula/sa.rb` in the tap repo with new version, URLs, and hashes
- Creates a commit and pushes (or opens a PR)

This script will be called by the release workflow after binaries are uploaded.

### 8. Add release workflow step to update the tap
After the GitHub Release is created, add a step in `release.yml` that:
- Checks out the tap repo
- Runs the formula update script
- Pushes the updated formula

## Files to change

### In this repo (`sichengchen/sa`)
- `package.json` (modify — CalVer version, add version:bump script, update bin field)
- `scripts/version.ts` (create — version bump + tag script)
- `scripts/update-homebrew.ts` (create — update Homebrew formula with new release)
- `.github/workflows/ci.yml` (create — CI pipeline)
- `.github/workflows/release.yml` (create — auto-release on version tags)

### In tap repo (`sichengchen/homebrew-tap`) — created manually or by script
- `Formula/sa.rb` (create — Homebrew formula)

## Verification
- Run: `bun run typecheck` — no errors
- Run: `bun run lint` — no errors
- Run: `bun test` — all tests pass
- Run: `bun run build` — produces `dist/index.js`, executable
- Run: `bun run version:bump` — updates package.json version, creates git tag
- Push a version tag → GitHub Actions creates a Release with binaries attached
- PR to main → GitHub Actions runs lint + typecheck + test + build
- `brew tap sichengchen/tap && brew install sa` — installs SA, `sa --help` works
- `brew upgrade sa` — picks up new version after formula update
- Edge cases:
  - First release of a new month resets patch to 0
  - Multiple releases in same month increment patch correctly
  - Release workflow handles both ARM64 and x86_64 binaries
  - Formula correctly selects binary by architecture

## Progress
- Adopted CalVer `2026.2.0` in package.json, updated bin to `dist/index.js`
- Created `scripts/version.ts` — bump + tag + optional push
- Created `.github/workflows/ci.yml` — lint, typecheck, test, build on PRs and main
- Created `.github/workflows/release.yml` — builds macOS ARM64 + x86_64, creates GitHub Release, updates Homebrew tap
- Created `scripts/update-homebrew.ts` — updates Formula/sa.rb in tap repo with new version and checksums
- Created `sichengchen/homebrew-tap` repo with placeholder `Formula/sa.rb`
- Modified: package.json, scripts/version.ts, scripts/update-homebrew.ts, .github/workflows/ci.yml, .github/workflows/release.yml
- Verification: typecheck pass, lint pass, 201 tests pass, build produces 7.11 MB binary
