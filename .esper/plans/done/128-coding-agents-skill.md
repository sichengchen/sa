---
id: 128
title: Coding agents skill with esperkit integration
status: done
type: feature
priority: 2
phase: 009-chat-sdk-and-agent-tools
branch: feature/009-chat-sdk-and-agent-tools
created: 2026-02-25
shipped_at: 2026-02-26
pr: https://github.com/sichengchen/sa/pull/31
---
# Coding agents skill with esperkit integration

## Context

SA has native `claude_code` and `codex` tools (shipped in phase 9, plans 124-125) that delegate coding tasks via subprocess. The old bundled `claude-code` and `codex` skills are deprecated — they contain outdated `exec`-based instructions.

The new skill replaces both deprecated skills with a single unified `coding-agents` skill that:
1. Documents how the agent should use the native `claude_code` and `codex` tools effectively
2. Introduces `esperkit` (available on npm) as an optional project management workflow tool
3. Includes the procedure for asking the user whether they want to use esperkit when delegating coding tasks

Existing bundled skills follow the standard pattern:
- `src/engine/skills/bundled/<skill-name>/SKILL.md` with YAML frontmatter
- Auto-discovered by `SkillRegistry.loadAll()` at engine startup
- Content loaded on demand via `read_skill` tool

The `ask_user` tool (plan 096) is now available for the agent to ask clarifying questions mid-execution, which is exactly the interaction needed for the "do you want to use esperkit?" prompt.

## Approach

### 1. Create the new `coding-agents` bundled skill

Create `src/engine/skills/bundled/coding-agents/SKILL.md` with:
- Frontmatter: `name: coding-agents`, description about delegating coding tasks
- **When to delegate** section — clear guidance on when to use `claude_code` vs `codex` vs handling directly
- **How to use the tools** — document the native tool parameters (task, files, workdir, background, handle)
- **Project management with esperkit** — describe what esperkit does, when to suggest it
- **Esperkit decision flow** — instruct the agent to use `ask_user` to ask if the user wants to use esperkit before incorporating it into the coding task prompt
- **Best practices** — context passing, background execution, result handling

### 2. Remove deprecated skills

Delete the deprecated bundled skills:
- `src/engine/skills/bundled/claude-code/SKILL.md`
- `src/engine/skills/bundled/codex/SKILL.md`

These are fully replaced by the native tools + new unified skill.

### 3. Update specs

Update `specs/skills.md` if it references the old claude-code/codex skills. Ensure the new skill is documented.

## Files to change

- `src/engine/skills/bundled/coding-agents/SKILL.md` (create — new unified coding agents skill)
- `src/engine/skills/bundled/claude-code/SKILL.md` (delete — replaced by coding-agents)
- `src/engine/skills/bundled/codex/SKILL.md` (delete — replaced by coding-agents)
- `specs/skills.md` (modify — update skill references if needed)

## Verification

- Run: `bun run typecheck`, `bun run lint`, `bun test`
- Expected: all pass (no code changes, only skill markdown files)
- Manual: Start engine, run `read_skill("coding-agents")` — verify content loads correctly
- Manual: Verify deprecated `read_skill("claude-code")` and `read_skill("codex")` return not found
- Edge cases:
  - Skill discovery picks up the new skill directory automatically
  - `{baseDir}` interpolation works if any sub-files are added later
  - The esperkit ask_user flow is clearly documented (not ambiguous instructions)

## Progress
- Milestones: 4 commits
- Created: src/engine/skills/bundled/coding-agents/SKILL.md
- Deleted: src/engine/skills/bundled/claude-code/, src/engine/skills/bundled/codex/
- Modified: specs/skills.md, tests/skills.test.ts
- Verification: typecheck ✓, lint ✓, tests ✓ (738 pass, 9 skip, 0 fail)
