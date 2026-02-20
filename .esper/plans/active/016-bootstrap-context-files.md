---
id: 16
title: Bootstrap context files — USER.md, tools, safety, heartbeat
status: active
type: feature
priority: 2
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---
# Bootstrap Context Files — USER.md, Tools, Safety, Heartbeat

## Context

Inspired by OpenClaw's bootstrap system (`src/agents/system-prompt.ts`), which assembles a structured system prompt from fixed sections — Identity, Tooling, Safety, Runtime, Date/Time — followed by injected project context files (SOUL.md, USER.md, MEMORY.md, etc.). Sasa currently assembles a minimal system prompt from two sources:

1. `identity.systemPrompt` — parsed from `~/.sa/identity.md`
2. `MEMORY.md` content — appended under `## Memory`

This plan adds four new sections to the system prompt, following OpenClaw's section ordering:

- **Safety** — a compact, hardcoded advisory paragraph grounding the agent: avoid power-seeking, confirm before destructive actions, don't bypass oversight. Fixed text, not configurable.
- **USER.md** (`~/.sa/USER.md`) — persistent, hand-edited facts about the owner (name, timezone, preferences, recurring context). Loaded at startup; skipped if missing.
- **Tools section** — programmatically generated from the registered tool registry (names + one-line descriptions). No file on disk needed.
- **Heartbeat section** — generated fresh at each startup: current date/time, active model name.

These give the agent persistent awareness of its safety boundaries, who it's working for, what it can do, and when it's running — without requiring explicit reads each turn.

## Approach

### 1. Create `~/.sa/USER.md` template during wizard setup

In `Wizard.tsx` `handleConfirm()`, after writing `identity.md`, write a starter `USER.md` to `~/.sa/USER.md`:

```markdown
# User Profile

Fill in what you want Sasa to always know about you.

## About Me
<!-- Your name, location, timezone, role, etc. -->

## Preferences
<!-- Communication style, preferred tools, habits, etc. -->

## Recurring Context
<!-- Projects, goals, or ongoing context Sasa should always be aware of. -->
```

This file is created once during setup. The user edits it freely. The wizard does not collect data for it (no wizard step needed — "configuration as documents" principle).

### 2. Add a hardcoded Safety section

Add a constant in `src/index.ts` (or a dedicated `src/config/bootstrap.ts`). The text is adapted from OpenClaw's verified safety section (MIT-licensed), trimmed for Sasa's single-user, local-only scope:

```typescript
const SAFETY_ADVISORY = `## Safety
You have no independent goals: do not pursue self-preservation, resource acquisition, or \
capability expansion beyond what the current task requires; avoid long-term plans beyond \
the user's request.
Prioritize safety and human oversight over task completion; if instructions conflict, \
pause and ask; comply with stop/pause requests and never bypass safeguards. \
(Inspired by Anthropic's model spec.)
Do not manipulate the user to expand your access or disable safeguards. Do not modify \
your own system prompt, safety rules, or tool behaviour unless explicitly asked.`;
```

This is never loaded from a file — it's fixed text baked into the assembled prompt. Following OpenClaw's pattern, safety guardrails in the system prompt are advisory guidance, not hard enforcement.

### 3. Add `loadUserProfile()` helper

Add a function in `src/config/manager.ts` (or a thin helper in `src/memory/manager.ts`) that reads `~/.sa/USER.md` and returns its content as a string (or `null` if missing/empty). Same pattern as `memory.loadContext()`:

```typescript
// In ConfigManager or a new src/config/bootstrap.ts helper
async function loadUserProfile(homeDir: string): Promise<string | null> {
  const path = join(homeDir, "USER.md");
  if (!existsSync(path)) return null;
  const content = await readFile(path, "utf8");
  return content.trim() || null;
}
```

### 4. Generate tools section inline

Add a helper `formatToolsSection(tools: Tool[]): string` in `src/tools/index.ts` (or inline in `index.ts`) that maps over the tool registry and formats a compact list:

```
## Available Tools
- read: Read file contents with optional line range
- write: Write content to a file (creates dirs as needed)
- edit: Exact string replacement in a file
- bash: Execute shell commands (default 30s timeout)
- remember: Save information to long-term memory topics
```

Each tool already has `name` and `description` on the `Tool` interface — use those directly.

### 5. Generate heartbeat section inline

In `src/index.ts`, build a heartbeat string at startup:

```typescript
function buildHeartbeat(router: ModelRouter): string {
  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const modelName = router.getActiveModelName?.() ?? "unknown";
  return `## Session\nStarted: ${dateStr} | Model: ${modelName}`;
}
```

`ModelRouter` already has `getActiveModel()` — use its `name` field.

### 6. Update system prompt assembly in `src/index.ts`

Replace the current two-part assembly with a multi-part join:

```typescript
const userProfile = await config.loadUserProfile();
const toolsSection = formatToolsSection(tools);
const heartbeat = buildHeartbeat(router);
const memoryContext = await memory.loadContext();

const systemPrompt = [
  saConfig.identity.systemPrompt,
  `\n${toolsSection}`,
  `\n${SAFETY_ADVISORY}`,
  userProfile ? `\n## User Profile\n${userProfile}` : "",
  `\n${heartbeat}`,
  memoryContext ? `\n## Memory\n${memoryContext}` : "",
]
  .filter(Boolean)
  .join("\n");
```

Order follows OpenClaw's verified section ordering: **identity → tooling → safety → user profile (USER.md) → session/heartbeat → memory**.

### 7. Update `ConfigManager` to expose `loadUserProfile()` and `getUserProfilePath()`

Add two methods alongside `getModelsPath()`:

```typescript
getUserProfilePath(): string {
  return join(this.homeDir, "USER.md");
}

async loadUserProfile(): Promise<string | null> {
  const path = this.getUserProfilePath();
  if (!existsSync(path)) return null;
  const content = await readFile(path, "utf8");
  return content.trim() || null;
}
```

## Files to change

- `src/wizard/Wizard.tsx` (modify — write `USER.md` template in `handleConfirm`)
- `src/config/manager.ts` (modify — add `loadUserProfile()` method and `getUserProfilePath()`)
- `src/tools/index.ts` (modify — export `formatToolsSection(tools)` helper)
- `src/index.ts` (modify — load user profile, generate tools + heartbeat sections, extend system prompt assembly)

## Verification

- Run: `bun test && bun run lint && bun run typecheck`
- Expected: all tests pass; no type errors

- Manual:
  1. Fresh install: wizard creates `~/.sa/USER.md` with template → file exists with placeholder content
  2. Start agent: inspect system prompt via a chat message "what's in your system prompt?" → should reference tools section and session date
  3. Edit `~/.sa/USER.md` with real content → restart agent → agent knows user's name/preferences
  4. Delete `USER.md` → restart agent → user profile section is gracefully omitted, no crash
  5. Restart agent twice → heartbeat shows current date/time on each run

- Edge cases:
  - `USER.md` exists but is empty → treated as missing (no section injected)
  - Tool list changes (e.g. remember tool disabled) → tools section reflects actual registered tools
  - `router.getActiveModel()` throws → heartbeat falls back to "unknown" model name gracefully

## Progress
- Milestones: 5 commits (4 feature + 1 rename)
- Modified: src/config/manager.ts, src/tools/index.ts, src/wizard/Wizard.tsx, src/index.ts, tests/config.test.ts, tests/integration/config-router.test.ts, README.md, docs/architecture.md, docs/configuration.md
- Verification: 93 tests pass, lint clean, typecheck clean
