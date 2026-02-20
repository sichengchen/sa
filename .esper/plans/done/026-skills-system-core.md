---
id: 26
title: Skills system core
status: done
type: feature
priority: 2
phase: phase-2
branch: feature/phase-2
created: 2026-02-19
shipped_at: 2026-02-20
---
# Skills system core

## Context
SA needs a skills system following the Agent Skills specification (agentskills.io). Skills are directories containing a `SKILL.md` file with YAML frontmatter (name, description) and Markdown instructions. They are NOT tools — they are prompt-level documentation that teaches the agent how to use existing tools.

Skills use progressive disclosure:
1. **Discovery**: At startup, Engine loads only name + description of each skill (~24 tokens per skill)
2. **Activation**: When a task matches a skill's description, the agent reads the full SKILL.md
3. **Execution**: The agent follows the instructions, using existing tools (Bash, Read, Write, etc.)

Skills are loaded from:
- `~/.sa/skills/` — user-installed skills (from ClawHub or manual)
- Built-in skills bundled with SA

## Approach
1. Create `src/skills/types.ts` — skill type definitions:
   - `SkillMetadata`: name, description, license, compatibility, metadata, allowedTools
   - `LoadedSkill`: metadata + filePath + fullContent (lazy-loaded)
2. Create `src/skills/loader.ts` — skill directory scanner:
   - Scan skill directories for folders containing `SKILL.md`
   - Parse YAML frontmatter (name, description, optional fields)
   - Validate against agentskills.io spec (name format, required fields)
   - Return `SkillMetadata[]` for prompt injection
3. Create `src/skills/registry.ts` — skill registry:
   - `loadAll()` — scan all skill directories, register metadata
   - `getMetadataList()` — return all skill metadata for system prompt
   - `activate(name)` — lazy-load full SKILL.md content
   - `getContent(name)` — return full Markdown body
   - `isActive(name)` — check if skill is currently activated
4. Create `src/skills/prompt.ts` — generate the `<available_skills>` XML block for the system prompt:
   ```xml
   <available_skills>
   <skill>
   <name>skill-name</name>
   <description>What the skill does</description>
   <location>/path/to/SKILL.md</location>
   </skill>
   </available_skills>
   ```
5. Integrate with Engine runtime (`src/engine/runtime.ts`):
   - Load skills on startup
   - Inject `<available_skills>` into system prompt
   - Add a `read-skill` tool that the agent can use to load full SKILL.md content
6. Wire up tRPC procedures: `skill.list`, `skill.activate`
7. Write unit tests for loader, registry, prompt generation

## Files to change
- `src/skills/types.ts` (create — skill type definitions)
- `src/skills/loader.ts` (create — SKILL.md scanner and parser)
- `src/skills/registry.ts` (create — skill registry)
- `src/skills/prompt.ts` (create — XML prompt generation)
- `src/skills/index.ts` (create — barrel export)
- `src/engine/runtime.ts` (modify — load skills, inject into system prompt)
- `src/engine/router.ts` (modify — wire skill tRPC procedures)
- `src/tools/read-skill.ts` (create — tool for agent to read full SKILL.md)
- `tests/skills.test.ts` (create — unit tests)

## Verification
- Run: `bun test`
- Run: Create a test skill in `~/.sa/skills/test-skill/SKILL.md`, start Engine, verify it appears in system prompt
- Expected: Skills are discovered, metadata injected into prompt, agent can read full content on demand
- Edge cases: Invalid SKILL.md (missing name), empty skills directory, skill with only frontmatter

## Progress
- Created src/skills/types.ts with SkillMetadata and LoadedSkill types
- Created src/skills/loader.ts with scanSkillDirectory, loadSkillContent, parseFrontmatter
- Created src/skills/registry.ts with SkillRegistry (loadAll, activate, deactivate, getContent, getMetadataList)
- Created src/skills/prompt.ts with formatSkillsDiscovery XML and formatActiveSkills
- Created src/skills/index.ts barrel export
- Created src/tools/read-skill.ts for agent to read and activate skills
- Updated src/engine/runtime.ts to load skills on startup and inject into system prompt
- Updated src/engine/router.ts with skill.list and skill.activate tRPC procedures
- Created tests/skills.test.ts — 14 tests covering loader, registry, prompt generation
- Modified: src/skills/{types,loader,registry,prompt,index}.ts, src/tools/read-skill.ts, src/engine/{runtime,router}.ts, tests/skills.test.ts
- Verification: 136 tests pass, typecheck clean, lint clean
