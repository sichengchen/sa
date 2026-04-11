---
name: skill-creator
description: Create new agent skills. Use when: the user wants to build, scaffold, or define a new skill. NOT for: installing existing skills (use clawhub) or editing already-created skills.
---
# Skill Creator

You are helping the user create a new agent skill following the Agent Skills specification (agentskills.io).

## Steps

### 1. Understand the skill

Ask the user what the skill should do. Gather:
- **Purpose**: What task does this skill help with?
- **Tools**: Which existing tools will the skill teach you to use? (e.g., Bash, Read, Write)
- **Trigger**: When should the skill be activated? (What kind of user request?)

### 2. Generate a name

Create a kebab-case name from the description. Rules:
- Lowercase, hyphens only (e.g., `code-review`, `git-commit-helper`)
- 2-4 words, descriptive but concise
- No special characters, no underscores
- Confirm the name with the user before proceeding

### 3. Write the SKILL.md

Create the skill directory and SKILL.md file:

```
~/.aria/skills/<skill-name>/SKILL.md
```

The SKILL.md must have:

```markdown
---
name: <skill-name>
description: <one-line description of what the skill does>
---
# <Skill Title>

<Instructions for the agent on how to perform this skill.
Be specific about which tools to use, what steps to follow,
and what output to produce.>
```

Guidelines for writing instructions:
- Write in second person ("You are...", "Your task is...")
- Be specific about which tools to use and how
- Include examples of expected input/output where helpful
- Keep instructions focused — one skill, one purpose
- Do not duplicate tool descriptions — reference them by name

### 4. Optional directories

If the skill needs supporting files, create them:
- `scripts/` — shell scripts or automation the skill references
- `references/` — example files, templates, or documentation
- `assets/` — images, configs, or other static files

Most skills only need the SKILL.md file.

### 5. Validate

After creating the skill, verify:
- The SKILL.md file exists and has valid frontmatter (name + description)
- The name is kebab-case with no special characters
- The description is a single line under 100 characters
- The skill does not conflict with an existing installed skill name

Read the created SKILL.md to confirm it parses correctly.

### 6. Confirm

Tell the user:
- Where the skill was installed
- How to use it (it will appear in the available skills list)
- That they can edit the SKILL.md at any time to refine the instructions
