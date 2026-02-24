# Skills System

## Overview

SA uses the **Agent Skills** specification ([agentskills.io](https://agentskills.io)) to extend the agent's capabilities through prompt-level instructions. Skills are Markdown files named `SKILL.md` with YAML frontmatter. They teach the agent how to perform specific tasks using existing tools -- they are not tools themselves.

When a user message arrives, the agent inspects an `<available_skills>` catalog injected into its system prompt, identifies the most relevant skill, loads its full content via the `read_skill` tool, and follows its instructions. This lazy-loading design keeps the system prompt compact while making a large library of domain knowledge available on demand.

---

## SKILL.md Format

Every skill is a single `SKILL.md` file inside a named directory. The file has YAML frontmatter and a Markdown body.

### Frontmatter Fields

| Field           | Required | Description                                                          |
|-----------------|----------|----------------------------------------------------------------------|
| `name`          | Yes      | Kebab-case identifier (e.g., `apple-calendar`)                       |
| `description`   | Yes      | Short summary: what the skill does, when to use it, what it is NOT for |
| `homepage`      | No       | URL to the skill's homepage or repository                            |
| `license`       | No       | SPDX license identifier                                             |
| `compatibility` | No       | Platform or version constraints (e.g., `macOS 14+`)                  |
| `metadata`      | No       | JSON blob with extra metadata (required binaries, install steps)     |

Skills missing `name` or `description` are silently skipped during discovery.

### Body

Everything after the closing `---` fence is the skill body -- prompt-level instruction text injected into the agent's context when activated. Write in second person. Be specific about which tools or CLI commands to use.

The body supports `{baseDir}` interpolation. At load time, `{baseDir}` is replaced with the absolute path to the skill's directory, allowing skills to reference companion files (scripts, reference docs, assets) without hardcoded paths.

---

## Skill Types

SA discovers skills from three sources, in priority order:

### 1. Bundled Skills

Ship with SA at `src/engine/skills/bundled/`. Each subdirectory contains a `SKILL.md` and optional supporting files.

| Skill                | Purpose                                        |
|----------------------|------------------------------------------------|
| `sa`                 | Knowledge about SA itself (spec index)         |
| `clawhub`            | Search, install, update skills from ClawHub    |
| `skill-creator`      | Scaffold new custom skills                     |
| `weather`            | Weather lookups via wttr.in and Open-Meteo     |
| `apple-calendar`     | Manage macOS Calendar.app events               |
| `apple-contacts`     | Query macOS Contacts.app                       |
| `apple-mail-search`  | Search Apple Mail via SQLite                   |
| `apple-notes`        | Manage Apple Notes via the `memo` CLI          |
| `apple-reminders`    | Manage Apple Reminders via `remindctl`          |
| `1password`          | 1Password CLI integration                      |
| `homeassistant-skill`| Control Home Assistant devices                 |
| `pinchtab`           | Browser automation via Pinchtab HTTP API       |

### 2. User-Installed Skills

Live at `~/.sa/skills/<name>/SKILL.md` (or `$SA_HOME/skills/`). Users can create them manually or install from ClawHub. User skills with the same name as a bundled skill override it (both are keyed by name; user skills load second).

### 3. ClawHub Skills

[ClawHub](https://clawhub.ai) is a public skill marketplace. Skills are installed into the user skills directory via the `clawhub` CLI.

---

## Discovery

`SkillRegistry.loadAll()` runs at engine startup:

1. Clear the internal `Map<string, LoadedSkill>`.
2. Scan the bundled skills directory with `scanSkillDirectory()`. If the directory does not exist on disk (compiled binary), fall back to `parseEmbeddedSkills()`.
3. Scan the user skills directory (`~/.sa/skills/`).
4. Register each skill as a `LoadedSkill` with `content: ""` and `active: false`.

### System Prompt Injection

`formatSkillsDiscovery()` generates an `<available_skills>` XML block from all discovered metadata:

```xml
<available_skills>
<skill>
<name>apple-calendar</name>
<description>Manage macOS Calendar.app events...</description>
</skill>
</available_skills>
```

Skills are sorted alphabetically. The block is capped at **150 entries** and **30,000 characters**. If the catalog exceeds these limits, a binary search determines the largest prefix that fits, and a comment notes how many were omitted.

---

## Activation

Skills use lazy loading. Only `name`, `description`, and `filePath` are stored on discovery. The full body is not read until the agent calls `read_skill`.

### read_skill Tool

When called with a skill name:

1. Look up the skill in `SkillRegistry` by name.
2. If not found, return an error directing the agent to check `<available_skills>`.
3. Call `registry.getContent(name)` -- reads `SKILL.md` (disk or embedded cache), strips frontmatter, replaces `{baseDir}` with the skill's directory path.
4. Mark the skill as `active: true`.
5. Return the body content.

When called with an optional `path` parameter, load a sub-file within the skill directory instead of the main `SKILL.md`.

Active skills are tracked via `getActiveSkills()` and can be formatted into the prompt with `formatActiveSkills()`.

---

## SKILLS_DIRECTIVE

The engine injects this mandatory directive into every system prompt when skills are present:

```
## Skills (mandatory)
Before replying to each user message, scan the <available_skills> list below.
- If exactly one skill clearly applies: call read_skill to load it, then follow its instructions.
- If multiple could apply: choose the most specific one, then read and follow it.
- If none clearly apply: do not read any skill.
Never read more than one skill up front; only read additional skills if the first one directs you to.
```

This ensures the agent considers its skill library before responding, prevents loading overly broad skills when a narrow one exists, and keeps token usage under control.

---

## ClawHub Integration

The ClawHub integration is a bundled skill that delegates to the `clawhub` CLI:

| Command                                   | Danger   | Description                          |
|-------------------------------------------|----------|--------------------------------------|
| `clawhub search '<query>'`                | safe     | Search the registry by keyword       |
| `clawhub install '<slug>' --workdir ~/.sa`| moderate | Install a skill by slug              |
| `clawhub update --all --workdir ~/.sa`    | moderate | Check installed skills for updates   |
| `clawhub list --workdir ~/.sa`            | safe     | List locally installed ClawHub skills|

After installation, the skill is discovered on the next registry reload.

---

## Creating Custom Skills

1. Create a directory: `mkdir -p ~/.sa/skills/my-skill/`
2. Create `SKILL.md` with frontmatter (`name`, `description`) and a body with agent instructions.
3. Optionally add `scripts/`, `references/`, or `assets/` directories alongside `SKILL.md`. Reference them from the body using `{baseDir}/scripts/foo.sh`.
4. The skill is discovered on the next engine restart or registry reload.

The bundled `skill-creator` skill can guide the agent through this process interactively.

---

## Embedded Skills (Binary Builds)

When SA is compiled into a single binary, bundled skills are not available on disk. The build process handles this:

1. `scripts/embed-skills.ts` reads every `.md` file from `src/engine/skills/bundled/*/`.
2. Generates `src/engine/skills/embedded-skills.generated.ts` exporting a `Record<string, Record<string, string>>` mapping directory names to `{ relative path -> content }`.
3. At runtime, `SkillRegistry.loadAll()` checks if the bundled directory exists. If not, it calls `parseEmbeddedSkills()` to parse frontmatter from the embedded strings and cache bodies in memory.
4. When `loadSkillContent()` is called with an `embedded:` path, it reads from the cache instead of the filesystem.
