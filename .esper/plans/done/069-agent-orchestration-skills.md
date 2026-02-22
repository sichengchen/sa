---
id: 69
title: Skill-based agent orchestration
status: done
type: feature
priority: 3
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# Skill-based agent orchestration

## Context
SA can already launch CLI agents via the `exec` tool (one-shot mode with `--print` or equivalent flags). However, the agent doesn't know the right CLI flags, output formats, or best practices for each external agent. Orchestration skills teach the agent how to delegate tasks to external agents effectively.

Key constraint from exploration 002: env sanitization in `exec.ts` strips `ANTHROPIC_*`, `OPENAI_*`, etc. from subprocess environments. The skill must instruct the agent to pass API keys explicitly via the `env` parameter or note that keys are available in `process.env` before sanitization.

Bundled skills live in `src/engine/skills/bundled/<name>/SKILL.md` with YAML frontmatter.

## Approach

### 1. Create `src/engine/skills/bundled/claude-code/SKILL.md`
Teach SA how to delegate coding tasks to Claude Code CLI:
- When to delegate: code generation, file editing, debugging, refactoring — tasks where a code-focused agent is more capable
- How to invoke: `exec({ command: "claude --print '<task description>'", background: true })` for longer tasks, foreground for quick ones
- Passing context: include file paths, error messages, and constraints in the prompt
- API key handling: note that `ANTHROPIC_API_KEY` must be passed via the `env` parameter since exec sanitizes it
- Output handling: Claude Code's `--print` mode outputs plain text; use `exec_status` to poll background tasks
- Limitations: no interactive mode (no stdin pipe), one-shot only

### 2. Create `src/engine/skills/bundled/codex/SKILL.md`
Teach SA how to delegate to OpenAI Codex CLI (if installed):
- Similar structure to Claude Code skill
- Invocation: `codex --quiet '<task>'`
- API key: `OPENAI_API_KEY` via env parameter

### 3. Tests
Write a test that verifies the skill files are valid SKILL.md format (parseable frontmatter, required fields present). Add to existing `tests/skills.test.ts` or create a new test.

## Files to change
- `src/engine/skills/bundled/claude-code/SKILL.md` (create — Claude Code orchestration skill)
- `src/engine/skills/bundled/codex/SKILL.md` (create — Codex orchestration skill)
- `tests/skills.test.ts` (modify — add validation test for new skills)

## Verification
- Run: `bun test tests/skills.test.ts`
- Expected: New skills are discovered by SkillRegistry and have valid frontmatter
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Manual: Start SA, ask "delegate a coding task to Claude Code", verify it reads the skill and uses exec with correct flags
- Edge cases: Claude Code not installed (skill should instruct agent to inform user); API key not available (skill should guide agent to use set_env_secret)

## Progress
- Created claude-code/SKILL.md: --print one-shot, background exec, ANTHROPIC_API_KEY env param, danger classification, limitations
- Created codex/SKILL.md: --quiet one-shot, background exec, OPENAI_API_KEY env param, similar structure
- Added 5 tests to tests/skills.test.ts: frontmatter validity, required topic coverage, SkillRegistry discovery, env/background docs
- Regenerated embedded-skills.generated.ts (24 files across 14 skills)
- Verification: typecheck clean, lint clean, 447 pass / 9 skip / 0 fail
- Modified: claude-code/SKILL.md, codex/SKILL.md, tests/skills.test.ts, embedded-skills.generated.ts
