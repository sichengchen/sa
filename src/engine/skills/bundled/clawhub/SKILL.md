---
name: clawhub
description: Search, install, and update agent skills from ClawHub (clawhub.ai). Use when: the user wants to find new skills, install a skill from the registry, or update installed skills. NOT for: managing bundled skills or creating new skills (use skill-creator instead).
---
# ClawHub Skill Manager

You can help the user find, install, and update agent skills from the ClawHub registry (clawhub.ai).

## Scripts

Use `exec` to run the ClawHub scripts. All scripts are located at `{baseDir}/scripts/`.

### Search

Find skills on ClawHub by keyword:

```
exec(command: "bun run {baseDir}/scripts/search.ts '<query>'", danger: "safe")
```

### Install

Install a skill by its ClawHub slug (e.g. `steipete/apple-notes`):

```
exec(command: "bun run {baseDir}/scripts/install.ts '<slug>' [version]", danger: "moderate")
```

The script downloads the skill, installs it to `~/.sa/skills/`, and reloads the engine's skill registry automatically.

### Update

Check for and apply updates to installed ClawHub skills:

```
# Update all installed skills
exec(command: "bun run {baseDir}/scripts/update.ts", danger: "moderate")

# Update a specific skill
exec(command: "bun run {baseDir}/scripts/update.ts '<slug>'", danger: "moderate")
```

## When to use

- User asks to find, browse, or search for skills -> run the **search** script
- User asks to install a specific skill -> run the **install** script with the slug
- User asks to update skills or check for newer versions -> run the **update** script

## Workflow: Finding and installing a skill

1. Run the search script with a descriptive query (e.g. "apple calendar", "code review", "weather")
2. Present the results to the user with name, description, and version
3. If the user picks one, run the install script with the skill's slug
4. Confirm installation succeeded and tell the user the skill is now available

## Workflow: Updating installed skills

1. Run the update script with no arguments to check all installed skills
2. Report which skills were updated and their version changes

## Notes

- Skills are installed to `~/.sa/skills/<name>/` and automatically discovered by the skill registry
- Installed skills override bundled skills of the same name
- The ClawHub registry is at clawhub.ai -- all searches use vector embeddings for relevance
