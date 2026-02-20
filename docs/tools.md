# Built-in Tools

SA provides the agent with seven built-in tools. The agent decides when and how to use them based on the conversation.

## read

Read the contents of a file.

| Parameter   | Type   | Required | Description                              |
|-------------|--------|----------|------------------------------------------|
| `file_path` | string | Yes      | Absolute path to the file                |
| `offset`    | number | No       | Line number to start reading from (1-based) |
| `limit`     | number | No       | Maximum number of lines to return        |

Returns the file contents as text. If `offset` and `limit` are omitted, the entire file is returned.

## write

Write content to a file, creating it (and any parent directories) if it doesn't exist.

| Parameter   | Type   | Required | Description                |
|-------------|--------|----------|----------------------------|
| `file_path` | string | Yes      | Absolute path to write to  |
| `content`   | string | Yes      | Content to write            |

Overwrites the file if it already exists.

## edit

Perform an exact string replacement in a file. The `old_string` must appear exactly once — if it appears zero or more than once, the tool returns an error.

| Parameter    | Type   | Required | Description                          |
|--------------|--------|----------|--------------------------------------|
| `file_path`  | string | Yes      | Absolute path to the file            |
| `old_string` | string | Yes      | The exact string to find and replace |
| `new_string` | string | Yes      | The replacement string               |

## bash

Execute a shell command and return its stdout and stderr.

| Parameter | Type   | Required | Description                                    |
|-----------|--------|----------|------------------------------------------------|
| `command` | string | Yes      | Shell command to run (via `sh -c`)             |
| `cwd`     | string | No       | Working directory for the command              |
| `timeout` | number | No       | Timeout in milliseconds (default: 30000)       |

Returns stdout and stderr combined. If the command exits non-zero, `isError` is set and the exit code is included in the output.

## remember

Save a piece of information to long-term memory. Memory entries persist across sessions and are automatically included in the system prompt on the next startup.

| Parameter | Type   | Required | Description                                                   |
|-----------|--------|----------|---------------------------------------------------------------|
| `key`     | string | Yes      | Short descriptive key (e.g. `"user-preferences"`)             |
| `content` | string | Yes      | The content to remember                                        |

Memory is stored as individual files under `~/.sa/memory/` (or the configured `memory.directory`). Saving to an existing key overwrites the previous value.

## read_skill

Read and activate a skill's full instructions. Available when the Engine is running with skills loaded.

| Parameter | Type   | Required | Description                                     |
|-----------|--------|----------|-------------------------------------------------|
| `name`    | string | Yes      | The name of the skill (from the available skills list) |

Returns the skill's full Markdown content and marks it as active (injected into the agent's context). If the skill is not found, returns an error.

## clawhub_search

Search the ClawHub skill registry ([clawhub.ai](https://clawhub.ai)) for agent skills.

| Parameter | Type   | Required | Description                                     |
|-----------|--------|----------|-------------------------------------------------|
| `query`   | string | Yes      | Search query describing the kind of skill to find |

Returns a list of matching skills with name, slug, description, version, download count, and tags. Use this when the user wants to find, browse, or install a skill from the registry.
