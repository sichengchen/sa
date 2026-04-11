# Skills System

Esperta Aria uses markdown skills to extend agent behavior at the prompt layer. Skills are not tools; they are reusable instruction bundles that the runtime can discover, load, activate, and embed.

## Sources

Aria discovers skills from:

1. bundled runtime skills in `packages/runtime/src/skills/bundled/`
2. user-installed skills in `~/.aria/skills/`
3. embedded bundled-skill content generated at build time

User-installed skills override bundled skills when names collide.

## Build and Embedding

The build now treats the package-owned runtime skill tree as canonical.

- `scripts/copy-docs.ts` mirrors `docs/` into the bundled Aria skill docs tree
- `scripts/embed-skills.ts` reads `packages/runtime/src/skills/bundled/*/`
- embedded output is written to `packages/runtime/src/skills/embedded-skills.generated.ts`

## Runtime Model

`SkillRegistry` is package-owned under `packages/runtime/src/skills/`.

Discovery flow:

1. load bundled skills from disk if present
2. fall back to embedded bundled skills in binary-style environments
3. load user skills from `~/.aria/skills/`
4. expose metadata in the available-skills catalog

Activation remains lazy. Skill bodies are loaded only when the agent or operator flow explicitly reads them.

## Skill Format

Each skill directory contains a `SKILL.md` with frontmatter plus optional supporting files such as:

- `references/`
- `templates/`
- `scripts/`
- `assets/`

`{baseDir}` interpolation still resolves to the skill directory at load time.

## Runtime Surfaces

- `read_skill` loads and activates skills
- `skill_manage` creates and patches user-writable skills
- prompt assembly injects the available skill catalog and active-skill context

## Current Bundled Themes

Bundled skills cover:

- Aria product and repo knowledge
- coding-agent delegation
- marketplace / skill-install workflows
- OS and application integrations
- browser and automation integrations

## Migration Note

Bundled skills are package-owned under `packages/runtime/src/skills/`.
