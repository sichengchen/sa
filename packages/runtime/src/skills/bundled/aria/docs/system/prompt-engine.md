# Prompt Engine

The prompt engine is a dedicated subsystem. Prompt assembly is not performed through scattered inline string construction.

## Responsibilities

The prompt engine assembles model input from structured sources:

1. Runtime identity and policy
2. User profile
3. Project context
4. Session state
5. Relevant memory layers
6. Tool affordances
7. Active skills
8. Connector, automation, or task overlays

## Context Inputs

### Identity and Policy

Identity, operator-facing behavior, safety policy, tool narration rules, and capability constraints are injected as structured prompt components.

### Project Context

Project context files are loaded intentionally, in this precedence order:

1. `.aria.md`
2. `AGENTS.md`
3. `CLAUDE.md`

Project context is attached with source metadata and is eligible for summarization and caching. The runtime may also inspect additional directory-local context files when tool calls move into subtrees.

### Memory Layers

Aria maintains explicit memory layers:

| Layer | Purpose |
| --- | --- |
| Profile memory | Stable user preferences and identity facts |
| Project memory | Durable project-specific context, decisions, conventions |
| Operational memory | Runtime facts such as approvals, capabilities, current execution constraints |
| Journal memory | Chronological summaries of prior work and outcomes |
| Semantic retrieval | Indexed snippets retrieved by meaning and text relevance |

Each layer has distinct retention, summarization, and policy rules.

## Compression

The prompt engine performs rolling context compression:

- transcript summarization
- selective replay of recent high-value turns
- tool output compaction
- durable run summaries
- memory extraction from completed work

Compression preserves continuity while avoiding full transcript replay.

## Prompt Caching

Prompt caching is provider-aware. The runtime may reuse stable prompt prefixes that include identity, policy, tool catalogs, and stable project context while varying the volatile suffix for recent session state.

## Output Contract

The prompt engine returns a structured assembly result that includes:

- ordered prompt sections
- source references
- cacheability metadata
- compression decisions
- excluded context reasons

Every run should be explainable in terms of this assembly result.
