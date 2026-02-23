---
id: 95
title: Update Claude Code & Codex skills: OAuth-first auth, docs links
status: active
type: feature
priority: 2
phase: 007-memory-redesign
branch: fix/update-orchestration-skills
created: 2026-02-23
---
# Update Claude Code & Codex skills: OAuth-first auth, docs links

## Context

Both `claude-code` and `codex` bundled skills (`src/engine/skills/bundled/claude-code/SKILL.md`, `src/engine/skills/bundled/codex/SKILL.md`) currently instruct the agent to always pass API keys explicitly via the `env` parameter on every `exec` call. This is because the `exec` tool sanitizes `ANTHROPIC_*` and `OPENAI_*` env vars from subprocesses.

However, both CLIs support **OAuth login** — users who have run `claude login` or `codex auth login` already have valid sessions stored locally. In this case, forcing explicit API key passing is unnecessary and error-prone. The skills should try the OAuth path first and only fall back to explicit key passing if the OAuth session is missing.

Additionally:
- The Claude Code install instruction (`npm install -g @anthropic-ai/claude-code`) is **outdated** — Claude Code now uses a native installer (`curl -fsSL https://claude.ai/install.sh | bash`), no Node.js dependency required. The npm package is no longer the recommended install path.
- Codex install (`npm install -g @openai/codex`) is still current, with `brew install --cask codex` as an alternative.
- Neither skill links to official online documentation, which would help the agent understand capabilities better.

This is a **docs-only** change — only SKILL.md files are updated. No code changes.

## Approach

### 1. Update Claude Code SKILL.md

- **OAuth-first flow**: Restructure "API key handling" section to:
  1. First, try invoking `claude --print` without passing `ANTHROPIC_API_KEY` in `env` — this works if the user has an active OAuth session
  2. If the command fails with an auth error, fall back to passing `ANTHROPIC_API_KEY` explicitly via `env`
  3. Instruct agent to check for auth error patterns in output (e.g. "not authenticated", "API key required")
- **Install instruction**: Replace `npm install -g @anthropic-ai/claude-code` with the native installer: `curl -fsSL https://claude.ai/install.sh | bash`. Note that npm packages (`@anthropic-ai/claude-code`, `claude`) are **outdated** and should not be used.
- **Add docs link**: Add a "Documentation" section linking to https://code.claude.com/docs

### 2. Update Codex SKILL.md

- **OAuth-first flow**: Same pattern as Claude Code:
  1. Try `codex --quiet` without `OPENAI_API_KEY` in `env`
  2. Fall back to explicit key if auth error detected
- **Install instruction**: Keep `npm install -g @openai/codex` (still current). Also mention `brew install --cask codex` as alternative.
- **Add docs link**: Add a "Documentation" section linking to https://developers.openai.com/codex/cli/

### 3. Update tests

- The test in `tests/skills.test.ts` checks that both skills mention `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — these should still pass since the keys are still mentioned (as fallback). No test changes expected, but verify.

### 4. Regenerate embedded skills

- Run `bun run scripts/embed-skills.ts` (or equivalent) to regenerate `embedded-skills.generated.ts` with the updated skill content.

## Files to change

- `src/engine/skills/bundled/claude-code/SKILL.md` (modify — OAuth-first auth, docs link, install note)
- `src/engine/skills/bundled/codex/SKILL.md` (modify — OAuth-first auth, docs link)
- `src/engine/skills/embedded-skills.generated.ts` (regenerate — reflects SKILL.md changes)

## Verification

- Run: `bun test tests/skills.test.ts`
- Expected: All existing skill tests pass (skills still mention API keys as fallback, so `mustMention` assertions hold)
- Run: `bun run typecheck && bun run lint`
- Expected: Clean pass
- Manual: Read both updated SKILL.md files and confirm:
  - OAuth-first flow is clearly documented
  - Fallback to explicit key is preserved
  - Install instructions are correct with outdated-package warning
  - Documentation links are present and point to correct URLs

## Progress
- Milestones: 3 commits
- Modified: src/engine/skills/bundled/claude-code/SKILL.md, src/engine/skills/bundled/codex/SKILL.md, src/engine/skills/embedded-skills.generated.ts
- Verification: not yet run — run /esper:finish to verify and archive
