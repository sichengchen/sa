---
name: clawhub
description: Search, install, and update agent skills from ClawHub (clawhub.ai). Use when: the user wants to find new skills, install a skill from the registry, or update installed skills. NOT for: managing bundled skills or creating new skills (use skill-creator instead).
---
# ClawHub Skill Manager

You can help the user find, install, and update agent skills from the ClawHub registry (clawhub.ai) using the `clawhub` CLI.

## Commands

Use `exec` to run ClawHub CLI commands. The `--workdir` flag must point to the Aria home directory so skills are installed into `~/.aria/skills/`.

### Search

Find skills on ClawHub by keyword:

```
exec(command: "clawhub search '<query>'", danger: "safe")
```

### Install

Install a skill by its ClawHub slug (e.g. `steipete/apple-notes`):

```
exec(command: "clawhub install '<slug>' --workdir ~/.aria --no-input", danger: "moderate")
```

To install a specific version:

```
exec(command: "clawhub install '<slug>' --version <version> --workdir ~/.aria --no-input", danger: "moderate")
```

### Update

Check for and apply updates to installed ClawHub skills:

```
# Update all installed skills
exec(command: "clawhub update --all --workdir ~/.aria --no-input", danger: "moderate")

# Update a specific skill
exec(command: "clawhub update '<slug>' --workdir ~/.aria --no-input", danger: "moderate")
```

### List installed

Show locally installed ClawHub skills:

```
exec(command: "clawhub list --workdir ~/.aria", danger: "safe")
```

## When to use

- User asks to find, browse, or search for skills -> run **search**
- User asks to install a specific skill -> run **install** with the slug
- User asks to update skills or check for newer versions -> run **update**
- User asks what ClawHub skills are installed -> run **list**

## Workflow: Finding and installing a skill

1. Run `clawhub search` with a descriptive query (e.g. "apple calendar", "code review", "weather")
2. Present the results to the user with name, description, and version
3. If the user picks one, run `clawhub install` with the skill's slug
4. Confirm installation succeeded and tell the user the skill is now available

## Workflow: Updating installed skills

1. Run `clawhub update --all` to check all installed skills
2. Report which skills were updated and their version changes

## Notes

- Skills are installed to `~/.aria/skills/<name>/` and automatically discovered by the skill registry
- Installed skills override bundled skills of the same name
- The ClawHub registry is at clawhub.ai — all searches use vector embeddings for relevance
- The `clawhub` CLI must be installed (`npm i -g clawhub` or `pnpm add -g clawhub`)
