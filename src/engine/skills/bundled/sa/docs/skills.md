# SA Skills System

## Overview

SA uses the **Agent Skills** specification ([agentskills.io](https://agentskills.io)) to extend the agent's capabilities through prompt-level instructions. Skills are Markdown files named `SKILL.md` with YAML frontmatter. They teach the agent how to perform specific tasks using existing tools -- they are **not** tools themselves.

When a user message arrives, the agent inspects an `<available_skills>` catalog injected into its system prompt, identifies the most relevant skill, loads its full content via the `read_skill` tool, and follows its instructions. This lazy-loading design keeps the system prompt compact while making a large library of domain knowledge available on demand.

## SKILL.md Format

Every skill is a single `SKILL.md` file living inside a named directory. The file consists of two parts: YAML frontmatter and a Markdown body.

### Frontmatter

The frontmatter is delimited by `---` fences and must contain two required fields:

```yaml
---
name: my-skill
description: One-line summary of what this skill does and when to use it.
---
```

| Field         | Required | Description                                                            |
|---------------|----------|------------------------------------------------------------------------|
| `name`        | Yes      | Kebab-case identifier (e.g., `apple-calendar`, `code-review`).         |
| `description` | Yes      | Short description. Should state what the skill does, when to use it, and what it is NOT for. |
| `homepage`    | No       | URL to the skill's homepage or repository.                             |
| `license`     | No       | SPDX license identifier.                                              |
| `compatibility` | No    | Platform or version constraints (e.g., `macOS 14+`).                   |
| `metadata`    | No       | JSON blob with extra metadata (required binaries, install instructions, etc.). |

Skills that are missing `name` or `description` in their frontmatter are silently skipped during discovery. The loader emits a warning to the console.

### Body

Everything after the closing `---` fence is the skill's body. This is the prompt-level instruction text that gets injected into the agent's context when the skill is activated. Write in second person ("You have access to...", "Use this when..."). Be specific about which tools or CLI commands to use, include example invocations, and document expected output formats.

The body supports a special `{baseDir}` interpolation variable. At load time, `{baseDir}` is replaced with the absolute path to the skill's directory on disk. This lets skills reference companion files (scripts, reference docs, assets) without hardcoding paths.

### Parsing

Frontmatter parsing is handled by `parseFrontmatter()` in `src/engine/skills/loader.ts`. It uses a simple regex to extract the YAML block and splits each line on the first colon to build a key-value map. This is intentionally lightweight -- it does not use a full YAML parser, so values must be single-line strings.

## Skill Types

SA discovers skills from three sources, in order of priority:

### 1. Bundled Skills

Ship with the SA source code at `src/engine/skills/bundled/`. Each subdirectory contains a `SKILL.md` and optional supporting files. Current bundled skills include:

| Skill              | Purpose                                              |
|--------------------|------------------------------------------------------|
| `sa`               | Knowledge about SA itself                            |
| `clawhub`          | Search, install, and update skills from ClawHub      |
| `skill-creator`    | Scaffold new custom skills                           |
| `weather`          | Weather lookups via wttr.in and Open-Meteo           |
| `apple-calendar`   | Manage macOS Calendar.app events                     |
| `apple-contacts`   | Query macOS Contacts.app                             |
| `apple-mail-search`| Search Apple Mail via SQLite                         |
| `apple-notes`      | Manage Apple Notes via the `memo` CLI                |
| `apple-reminders`  | Manage Apple Reminders via `remindctl`               |
| `1password`        | 1Password CLI integration                            |
| `homeassistant-skill` | Control Home Assistant devices                    |
| `pinchtab`         | Browser automation via Pinchtab HTTP API             |

### 2. User-Installed Skills

Live at `~/.sa/skills/<name>/SKILL.md` (or `$SA_HOME/skills/` if the environment variable is set). Users can create these manually or install them from ClawHub. User skills with the same name as a bundled skill effectively override it, since both are registered into the same `Map` keyed by name, and user skills are loaded after bundled skills.

### 3. ClawHub Skills

The [ClawHub](https://clawhub.ai) registry is a public skill marketplace. Skills are searched, downloaded, and installed into the user skills directory. See the "ClawHub Integration" section below.

## Skill Discovery

The `SkillRegistry` class (`src/engine/skills/registry.ts`) is the central registry for all discovered skills. At engine startup, `loadAll()` is called, which:

1. Clears the internal `Map<string, LoadedSkill>`.
2. Scans the **bundled skills directory** using `scanSkillDirectory()`. If the bundled directory does not exist on disk (e.g., in a compiled binary), it falls back to `parseEmbeddedSkills()` using the generated embedded skills module.
3. Scans the **user skills directory** (`~/.sa/skills/`) using `scanSkillDirectory()`.
4. Registers each skill as a `LoadedSkill` with `content: ""` and `active: false`.

`scanSkillDirectory()` iterates over subdirectories, checks for a `SKILL.md` file in each, reads and parses the frontmatter, and returns a `SkillMetadata[]` array. Any directory missing `SKILL.md` or missing required frontmatter fields is skipped.

### System Prompt Injection

The `formatSkillsDiscovery()` function (`src/engine/skills/prompt.ts`) generates an `<available_skills>` XML block from all discovered skill metadata. Each entry contains the skill's name and description:

```xml
<available_skills>
<skill>
<name>apple-calendar</name>
<description>Manage macOS Calendar.app events via apple-calendar-cli...</description>
</skill>
<skill>
<name>weather</name>
<description>Get current weather and forecasts via wttr.in...</description>
</skill>
</available_skills>
```

Skills are sorted alphabetically by name. The block is capped at `MAX_SKILLS_IN_PROMPT` (150) entries and `MAX_SKILLS_PROMPT_CHARS` (30,000 characters). If the catalog exceeds these limits, a binary search determines the largest prefix that fits, and a comment notes how many skills were omitted.

## Skill Activation

Skills use lazy loading. On discovery, only the `name`, `description`, and `filePath` are stored. The full Markdown body is not read until the agent explicitly calls the `read_skill` tool.

### The `read_skill` Tool

Defined in `src/engine/tools/read-skill.ts`. It is classified as a **safe** tool (auto-approved, no user confirmation needed).

```
read_skill(name: "apple-calendar")
```

When called:

1. Looks up the skill in the `SkillRegistry` by name.
2. If not found, returns an error message directing the agent to check `<available_skills>`.
3. If found, calls `registry.getContent(name)` which:
   - Reads the `SKILL.md` file (or retrieves from the embedded cache for binary builds).
   - Strips the frontmatter, returning only the body.
   - Replaces all `{baseDir}` occurrences with the skill's actual directory path.
4. Marks the skill as `active: true` in the registry.
5. Returns the full body content to the agent.

Active skills are tracked by the registry via `getActiveSkills()` and can be formatted into the prompt using `formatActiveSkills()`, which wraps each active skill's content under a `## Skill: <name>` heading.

## The SKILLS_DIRECTIVE

The engine's `runtime.ts` injects a mandatory directive into every system prompt when skills are present:

```
## Skills (mandatory)
Before replying to each user message, scan the <available_skills> list below.
- If exactly one skill clearly applies: call read_skill to load it, then follow its instructions.
- If multiple could apply: choose the most specific one, then read and follow it.
- If none clearly apply: do not read any skill.
Never read more than one skill up front; only read additional skills if the first one directs you to.
```

This directive ensures the agent always considers its skill library before responding. The "most specific match" heuristic prevents the agent from loading overly broad skills when a narrow one exists. The "never read more than one" constraint keeps token usage under control -- additional skills are only loaded if the first skill's instructions explicitly call for it.

## ClawHub Integration

[ClawHub](https://clawhub.ai) is SA's skill marketplace. The integration consists of an HTTP client, an installer, and a self-contained bundled skill with scripts.

### ClawHubClient

`src/engine/clawhub/client.ts` provides the HTTP client for the ClawHub REST API at `https://api.clawhub.ai`. Key methods:

| Method          | Endpoint                           | Description                           |
|-----------------|------------------------------------|---------------------------------------|
| `search(query)` | `GET /skills/search?q=...`         | Vector-embedding search over skills   |
| `getSkill(slug)`| `GET /skills/:slug`                | Full metadata for a single skill      |
| `listPopular()` | `GET /skills/popular`              | Browse popular/highlighted skills     |
| `download(slug)`| `GET /skills/:slug/download[/:ver]`| Download skill as a zip archive       |

### SkillInstaller

`src/engine/clawhub/installer.ts` manages the local installation of ClawHub skills. Key behaviors:

- **Install**: Downloads the zip, extracts to `~/.sa/skills/<name>/`, validates that `SKILL.md` exists, and updates the local registry.
- **Uninstall**: Removes the skill directory and its registry entry.
- **Name conflict detection**: If a skill with the same name but a different slug already exists, installation is rejected with an error.
- **Update (overwrite)**: If the same slug is already installed, the new version overwrites it.

### Local Registry (`.registry.json`)

The file `~/.sa/skills/.registry.json` tracks which skills were installed from ClawHub. Each entry records:

```json
{
  "slug": "steipete/apple-notes",
  "name": "apple-notes",
  "version": "1.2.0",
  "installedAt": "2026-02-20T10:30:00.000Z"
}
```

This registry is used by the update script to compare installed versions against the latest available on ClawHub.

### Bundled Skill

ClawHub is a self-contained bundled skill (`src/engine/skills/bundled/clawhub/`) with three scripts that the agent runs via `exec`:

| Script | Danger | Description |
|--------|--------|-------------|
| `scripts/search.ts` | safe | Search the registry by keyword |
| `scripts/install.ts` | moderate | Install a skill by slug; reloads the engine skill registry via `skill.reload` tRPC endpoint |
| `scripts/update.ts` | moderate | Check installed skills for updates; reloads registry after changes |

The install and update scripts call the engine's `skill.reload` tRPC procedure after modifying the skills directory, ensuring newly installed or updated skills are immediately discoverable.

Typical workflow:

1. User asks to find a skill: agent reads the `clawhub` skill, then runs the search script.
2. User picks a result: agent runs the install script with the slug.
3. The skill registry is reloaded and the new skill appears in `<available_skills>` on the next turn.

## Creating Custom Skills

To create a skill manually:

1. Create a directory under `~/.sa/skills/` with a kebab-case name:

   ```
   mkdir -p ~/.sa/skills/my-skill/
   ```

2. Create a `SKILL.md` file in that directory:

   ```markdown
   ---
   name: my-skill
   description: Short description of what this skill does. Use when: X. NOT for: Y.
   ---
   # My Skill

   Instructions for the agent go here. Write in second person.
   Be specific about which tools to use and how.
   Include example commands and expected output.
   ```

3. The skill will be discovered on the next engine restart (or when `SkillRegistry.loadAll()` is called, e.g., after a `clawhub_install`).

For scaffolding assistance, the bundled `skill-creator` skill can guide the agent through the process interactively.

### Optional Supporting Files

Skills can include companion directories alongside `SKILL.md`:

- `scripts/` -- Shell scripts or automation referenced by the skill instructions.
- `references/` -- Example files, templates, or external documentation.
- `assets/` -- Images, configs, or other static files.

Reference these from the skill body using the `{baseDir}` variable:

```markdown
See `{baseDir}/references/api-docs.md` for the full API reference.
```

## Embedded Skills (Binary Builds)

When SA is compiled into a single binary (via `bun build`), the bundled skills directory is not available on disk. To handle this, the build process generates an embedded skills module.

### `scripts/embed-skills.ts`

This build script:

1. Reads every `SKILL.md` from `src/engine/skills/bundled/*/`.
2. Sorts them alphabetically by directory name.
3. Generates `src/engine/skills/embedded-skills.generated.ts`, which exports a `Record<string, string>` mapping directory names to full `SKILL.md` content (frontmatter included).

The generated file looks like:

```typescript
// Auto-generated by scripts/embed-skills.ts -- do not edit
export const EMBEDDED_SKILLS: Record<string, string> = {
  "apple-calendar": "---\nname: apple-calendar\n...",
  "weather": "---\nname: weather\n...",
};
```

### Runtime Fallback

In `SkillRegistry.loadAll()`, the registry checks whether the bundled skills directory exists on disk:

```typescript
const bundled = existsSync(BUNDLED_SKILLS_DIR)
  ? await scanSkillDirectory(BUNDLED_SKILLS_DIR)
  : parseEmbeddedSkills(EMBEDDED_SKILLS);
```

`parseEmbeddedSkills()` parses the frontmatter from each embedded string, stores the body in an in-memory cache (`embeddedContentCache`), and returns `SkillMetadata[]` with `filePath` set to `"embedded:<dirName>"`. When `loadSkillContent()` is later called with an `embedded:` path, it reads from the cache instead of the filesystem.

## TypeScript Types

The skills subsystem uses two core interfaces defined in `src/engine/skills/types.ts`:

```typescript
/** Skill metadata from SKILL.md frontmatter */
interface SkillMetadata {
  name: string;        // Kebab-case skill name
  description: string; // Short description from frontmatter
  filePath: string;    // Path to SKILL.md (or "embedded:<name>" for binary builds)
}

/** A loaded skill with full content available */
interface LoadedSkill extends SkillMetadata {
  content: string;     // Full Markdown body (empty string until loaded)
  active: boolean;     // Whether currently activated
}
```

## Module Exports

The skills subsystem is exported from `src/engine/skills/index.ts`:

```typescript
export { SkillRegistry } from "./registry.js";
export { scanSkillDirectory, loadSkillContent } from "./loader.js";
export { formatSkillsDiscovery, formatActiveSkills } from "./prompt.js";
export type { SkillMetadata, LoadedSkill } from "./types.js";
```

## Summary of the Request Flow

1. **Engine startup**: `SkillRegistry.loadAll()` scans bundled and user skill directories, populating the registry with metadata only.
2. **System prompt assembly**: `formatSkillsDiscovery()` generates the `<available_skills>` XML block. The `SKILLS_DIRECTIVE` is prepended, instructing the agent how to use skills.
3. **User message arrives**: The agent scans `<available_skills>`, identifies the best match based on the user's request and each skill's description.
4. **Skill loading**: The agent calls `read_skill(name: "...")`. The registry reads the SKILL.md body (from disk or embedded cache), interpolates `{baseDir}`, marks the skill active, and returns the content.
5. **Agent follows instructions**: The skill body is now in the agent's context. The agent executes the task according to the skill's guidance, using existing tools as directed.
6. **ClawHub expansion**: If no installed skill matches, the agent can read the `clawhub` skill, run its search/install scripts via `exec`, and use the newly installed skill immediately after the registry reloads.
