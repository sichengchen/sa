---
id: 37
title: Prompt engineering for skill/tool compliance with weaker models
status: done
type: feature
priority: 1
phase: phase-2
branch: feature/phase-2
created: 2026-02-20
shipped_at: 2026-02-21
---
# Prompt engineering for skill/tool compliance with weaker models

## Context

SA has poor skill and tool compliance when using non-frontier models. The model frequently:
- Ignores available skills and tries to solve tasks from scratch
- Calls `read_skill` inconsistently or not at all
- Uses tools incorrectly (wrong parameters, unnecessary narration)
- Doesn't follow skill instructions after loading them

Comparing SA's prompt system with OpenClaw reveals five structural deficiencies:

### 1. No mandatory skill scan directive
SA dumps the `<available_skills>` XML at the end of the system prompt (`runtime.ts:97`) with zero behavioral instructions. OpenClaw wraps it in a `## Skills (mandatory)` section with explicit rules: "Before replying: scan `<available_skills>` descriptions. If one applies → read it, then follow it."

### 2. Skill descriptions lack routing signals
Some SA skill descriptions include "Use when" patterns (apple-mail-search, apple-notes, homeassistant), but most don't (weather, apple-calendar, pinchtab, sa). None include "NOT for" negative routing. OpenClaw uses a consistent "Use when / NOT for" pattern in every skill description to give weaker models clear activation/rejection signals.

### 3. Tool summaries are too minimal
SA formats tools as `- bash: Execute a shell command` (`tools/index.ts:21`). OpenClaw embeds behavioral hints directly in tool summaries (e.g., cron description includes "use for reminders; write the systemEvent text as..."). Weaker models need these hints to use tools correctly.

### 4. No tool-call style guidance
OpenClaw has an explicit `## Tool Call Style` section controlling narration behavior. SA has no such guidance — weaker models tend to narrate every tool call, wasting tokens and confusing users.

### 5. No skill catalog size limits
SA includes all discovered skills in the `<available_skills>` block regardless of count or size. OpenClaw caps at 150 skills / 30k chars with binary-search fitting. With many installed skills, SA's prompt can bloat beyond what weaker models handle well.

### Relevant existing code
- `src/engine/runtime.ts:84-100` — system prompt assembly
- `src/engine/skills/prompt.ts` — `formatSkillsDiscovery()` and `formatActiveSkills()`
- `src/engine/tools/index.ts:20-23` — `formatToolsSection()`
- `src/engine/tools/read-skill.ts` — `read_skill` tool definition
- `src/engine/skills/bundled/*/SKILL.md` — 12 bundled skill files

## Approach

### Milestone 1: Mandatory skill scan directive + tool-call style section

Restructure the system prompt assembly in `runtime.ts` to add two new sections and reorder for optimal model compliance.

1. **Add `## Skills (mandatory)` section** in `runtime.ts` that wraps the `<available_skills>` block with behavioral rules:
   ```
   ## Skills (mandatory)
   Before replying to each user message, scan the <available_skills> list below.
   - If exactly one skill clearly applies: call read_skill to load it, then follow its instructions.
   - If multiple could apply: choose the most specific one, then read and follow it.
   - If none clearly apply: do not read any skill.
   Never read more than one skill up front; only read additional skills if the first one directs you to.
   ```
   Place this section **before** the `<available_skills>` XML block.

2. **Add `## Tool Call Style` section** after the tools listing:
   ```
   ## Tool Call Style
   Default: do not narrate routine, low-risk tool calls — just call the tool.
   Narrate only when it helps: multi-step work, sensitive actions (e.g. deletions), or when the user explicitly asks.
   Keep narration brief and value-dense; avoid repeating what the tool result already shows.
   ```

3. **Reorder system prompt sections** for optimal compliance (matching OpenClaw's proven order):
   1. Identity system prompt
   2. Available Tools
   3. Tool Call Style (new)
   4. Safety Advisory
   5. User Profile
   6. Session heartbeat
   7. Memory
   8. Skills (mandatory) + `<available_skills>` (moved up from last position, now with directive wrapper)

### Milestone 2: Enrich all 12 bundled skill descriptions

Update every bundled SKILL.md `description` field to follow the "Use when / NOT for" pattern. This is the single most impactful change for weaker model routing.

Format template:
```
description: [What it does]. Use when: [specific triggers]. NOT for: [common mismatches to reject].
```

Planned updates:
| Skill | Current description | Proposed description |
|-------|---|---|
| `weather` | "Get current weather and forecasts (no API key required)." | "Get current weather and forecasts via wttr.in and Open-Meteo (no API key needed). Use when: checking weather, forecasts, or temperature for a location. NOT for: historical weather data or climate analysis." |
| `apple-calendar` | "Apple Calendar.app integration for macOS. CRUD operations..." | "Manage macOS Calendar.app events via AppleScript. Use when: creating, viewing, editing, or deleting calendar events, or searching by date range. NOT for: Google Calendar, Outlook, or non-macOS systems." |
| `pinchtab` | "Control a headless or headed Chrome browser via Pinchtab's HTTP API..." | "Browser automation via Pinchtab's HTTP API: navigate, click, fill forms, scrape, manage tabs. Use when: web scraping, form automation, or any task requiring a browser. NOT for: simple HTTP requests (use bash+curl instead) or tasks that don't need a browser." |
| `sa` | "Knowledge about the SA (Sasa) project itself..." | "Knowledge about SA's own architecture, configuration, commands, and common tasks. Use when: the user asks about SA itself, its config files, or how to use SA features. NOT for: general programming questions unrelated to SA." |
| `clawhub` | "Search, install, and update agent skills from the ClawHub registry." | "Search, install, and update agent skills from ClawHub (clawhub.ai). Use when: the user wants to find new skills, install a skill from the registry, or update installed skills. NOT for: managing bundled skills or creating new skills (use skill-creator instead)." |
| `apple-reminders` | Current is decent | Add "NOT for: non-macOS systems or third-party reminder apps." |
| `apple-notes` | Current has "Use when" | Add "NOT for: non-macOS systems, Notion, Obsidian, or other note apps." |
| `apple-mail-search` | Current has "Use when" | Add "NOT for: sending email, Gmail, or non-Apple Mail clients." |
| `apple-contacts` | Current has "Use when" | Add "NOT for: non-macOS systems or third-party contact apps." |
| `homeassistant-skill` | Current has "Use when" | Add "NOT for: devices not connected to Home Assistant." |
| `1password` | Current has "Use when" | Add "NOT for: other password managers (Bitwarden, LastPass, etc.)." |
| `skill-creator` | Current has "Use when" | Add "NOT for: installing existing skills (use clawhub) or editing already-created skills." |

### Milestone 3: Enrich tool summaries with behavioral hints

Update `formatToolsSection()` in `tools/index.ts` to use richer descriptions. Instead of pulling from `tool.description` (which is optimized for the JSON schema), add a separate `summary` field for the system prompt.

1. Add optional `summary?: string` to the `ToolImpl` interface in `types.ts`
2. Update `formatToolsSection()` to prefer `tool.summary ?? tool.description`
3. Add summaries to key tools:
   - `bash`: "Execute a shell command. Use for: running CLI tools, installing packages, curl requests, system operations. Always prefer dedicated tools (read, write, edit) over bash for file operations."
   - `read_skill`: "Read and activate a skill's full instructions. Call this when a task matches an available skill's description in the <available_skills> block."
   - `remember`: "Save information to long-term memory. Use for: facts the user asks you to remember across sessions, stable preferences, or recurring context."
   - `read`: "Read file contents. Prefer this over bash+cat."
   - `write`: "Create or overwrite a file. Prefer this over bash+echo."
   - `edit`: "Make precise string replacements in a file. Prefer this over bash+sed."

### Milestone 4: Skill catalog size limits

Add hard caps to `formatSkillsDiscovery()` in `prompt.ts` to prevent prompt bloat with many installed skills.

1. Add constants:
   - `MAX_SKILLS_IN_PROMPT = 150`
   - `MAX_SKILLS_PROMPT_CHARS = 30_000`
2. If skills exceed `MAX_SKILLS_IN_PROMPT`, truncate the list (keep first N, sorted by name)
3. If the formatted XML exceeds `MAX_SKILLS_PROMPT_CHARS`, use binary search to find the largest prefix that fits
4. Append a note when truncated: `<!-- {N} additional skills omitted. Use clawhub_search to find more. -->`

### Milestone 5: Tests

1. Create `src/engine/skills/prompt.test.ts`:
   - Test `formatSkillsDiscovery()` output format
   - Test truncation at MAX_SKILLS_IN_PROMPT
   - Test truncation at MAX_SKILLS_PROMPT_CHARS
   - Test truncation note is appended

2. Update existing tests if any reference the old prompt format

## Files to change

- `src/engine/runtime.ts` (modify — reorder prompt sections, add Skills mandatory directive, add Tool Call Style section)
- `src/engine/skills/prompt.ts` (modify — add size limits, binary search fitting, truncation note)
- `src/engine/tools/index.ts` (modify — update `formatToolsSection()` to use `summary` field)
- `src/engine/agent/types.ts` (modify — add optional `summary` field to `ToolImpl`)
- `src/engine/tools/bash.ts` (modify — add `summary`)
- `src/engine/tools/read.ts` (modify — add `summary`)
- `src/engine/tools/write.ts` (modify — add `summary`)
- `src/engine/tools/edit.ts` (modify — add `summary`)
- `src/engine/tools/remember.ts` (modify — add `summary`)
- `src/engine/tools/read-skill.ts` (modify — add `summary`)
- `src/engine/skills/bundled/weather/SKILL.md` (modify — enrich description)
- `src/engine/skills/bundled/apple-calendar/SKILL.md` (modify — enrich description)
- `src/engine/skills/bundled/pinchtab/SKILL.md` (modify — enrich description)
- `src/engine/skills/bundled/sa/SKILL.md` (modify — enrich description)
- `src/engine/skills/bundled/clawhub/SKILL.md` (modify — enrich description)
- `src/engine/skills/bundled/apple-reminders/SKILL.md` (modify — add NOT for)
- `src/engine/skills/bundled/apple-notes/SKILL.md` (modify — add NOT for)
- `src/engine/skills/bundled/apple-mail-search/SKILL.md` (modify — add NOT for)
- `src/engine/skills/bundled/apple-contacts/SKILL.md` (modify — add NOT for)
- `src/engine/skills/bundled/homeassistant-skill/SKILL.md` (modify — add NOT for)
- `src/engine/skills/bundled/1password/SKILL.md` (modify — add NOT for)
- `src/engine/skills/bundled/skill-creator/SKILL.md` (modify — add NOT for)
- `src/engine/skills/prompt.test.ts` (create — size limit tests)

## Verification

- Run: `bun test`
- Expected: All tests pass
- Run: `bun run typecheck`
- Expected: No type errors
- Manual: Start SA with a weaker model (e.g., Haiku, GPT-4o-mini), ask "what's the weather in Tokyo?" — model should scan skills, call read_skill("weather"), then follow the skill instructions
- Manual: Ask a question that matches NO skill — model should NOT call read_skill
- Manual: Install 200+ skills from ClawHub, verify prompt doesn't exceed 30k chars for the skills block
- Edge cases:
  - Zero skills loaded → no Skills section in prompt at all
  - Skill description contains XML special chars (< > &) → must be escaped in the XML catalog
  - Tool with no `summary` field → falls back to `description` gracefully

## Progress
- Milestone 1: Added `## Skills (mandatory)` directive, `## Tool Call Style` section, reordered prompt assembly
- Milestone 2: Updated all 12 bundled SKILL.md descriptions with "Use when / NOT for" routing pattern
- Milestone 3: Added `summary` field to `ToolImpl`, enriched 6 tool summaries with behavioral hints
- Milestone 4: Added 150 skill / 30k char limits with binary search fitting and XML escaping
- Milestone 5: Created prompt.test.ts with 8 tests covering format, sorting, escaping, and truncation
- Modified: runtime.ts, prompt.ts, types.ts, index.ts, bash.ts, read.ts, write.ts, edit.ts, remember.ts, read-skill.ts, 12x SKILL.md, prompt.test.ts
- Verification: 184 tests pass, lint clean, typecheck clean
