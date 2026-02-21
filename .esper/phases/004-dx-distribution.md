---
phase: 004-dx-distribution
title: "DX & Distribution"
status: active
---

# Phase 4: DX & Distribution

## Goal
Make SA installable, updatable, and release-ready. Introduce calendar versioning, a Homebrew tap for macOS distribution, GitHub Actions CI/CD with automated releases, and developer experience improvements (tsconfig path aliases). This phase transitions SA from a "clone and run" project to a properly distributed CLI tool.

## In Scope
- **CalVer versioning**: Adopt calendar versioning (YYYY.MM.patch) in package.json with bump scripts
- **GitHub Actions CI/CD**: Lint + typecheck + test + build on every PR; auto-release with binaries on version tags
- **Homebrew tap**: Custom Homebrew formula/tap for `brew install sa` on macOS
- **Installation & update support**: `brew install` for fresh installs, `brew upgrade` for updates
- **tsconfig path aliases**: Add `@sa/*` import aliases to replace fragile relative cross-boundary imports (plan 051, carried from Phase 3)
- **Build hardening**: Ensure `bun build` produces a correct, self-contained executable with proper bin field pointing to dist

## Out of Scope (deferred)
- npm registry publishing
- Linux package managers (apt, dnf, etc.)
- Windows support
- Docker distribution
- Auto-update daemon / self-update mechanism beyond Homebrew
- Web UI or native apps

## Acceptance Criteria
- [ ] `package.json` uses CalVer (e.g., `2026.2.0`) with `bun run version:bump` script
- [ ] GitHub Actions workflow runs lint, typecheck, test, and build on every PR
- [ ] Merging a version tag triggers a GitHub Release with the built binary attached
- [ ] A Homebrew tap repo exists with a working formula
- [ ] `brew install <tap>/sa` installs SA and the `sa` command works
- [ ] `brew upgrade sa` updates to the latest release
- [ ] tsconfig path aliases (`@sa/engine/*`, `@sa/shared/*`, etc.) replace all 37 cross-boundary relative imports
- [ ] `bun run typecheck`, `bun run lint`, and `bun test` all pass

## Phase Notes
Phase 3 shipped all 9 plans (042–050) covering connectors, tools, and media. SA is feature-rich but only installable via git clone + bun install. The build already produces a single 7.1 MB executable (`dist/index.js` with `#!/usr/bin/env bun` shebang), but there's no versioning, no CI, and no distribution channel. Plan 051 (tsconfig path aliases) was deferred from Phase 3 and is carried into this phase as a DX improvement.

## Shipped Plans
- #052 — CalVer versioning, GitHub Actions CI/CD, and Homebrew tap distribution: Switch to CalVer (YYYY.M.patch), add CI/CD workflows, Homebrew tap, and version bump scripts. Files: package.json, scripts/version.ts, scripts/update-homebrew.ts, ci.yml, release.yml
