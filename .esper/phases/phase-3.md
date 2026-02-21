---
phase: phase-3
title: "Connectors+, Tools & Media"
status: active
---

# Phase 3: Connectors+, Tools & Media

## Goal
Expand SA's connectivity and capability surface: add a webhook connector for programmatic integrations, configurable tool-approval permissions for IM connectors, session awareness in TUI, a richer set of built-in tools (web_fetch, web_search, advanced exec), Nvidia as a built-in provider, and audio transcription for IM voice messages. This phase makes SA more useful as a daily-driver agent by removing friction (smarter permissions), adding reach (webhooks, web tools), and handling more modalities (voice).

## In Scope
- **Webhook connector**: Inbound HTTP endpoint on the Engine for external integrations (CI, GitHub, IFTTT, etc.)
- **Configurable tool approval for IM connectors**: Per-connector setting (always ask / ask once per tool type / never ask), plus "accept all <tool> for this session" option in approval UI
- **Nvidia built-in provider**: Add Nvidia NIM (integrate.api.nvidia.com) as an OpenAI-compatible built-in provider
- **TUI session viewer & switcher**: List all Engine sessions (TUI, Telegram, Discord) and switch between them in the TUI
- **web_fetch tool**: Fetch URL content, convert HTML to markdown, return text
- **web_search tool**: Search the web via Brave Search API and/or Perplexity API, return structured results
- **Advanced exec tool**: Replace the current bash tool with a richer exec tool supporting command, workdir, env overrides, yieldMs (auto-background), background mode, timeout, pty (full interactive pseudo-terminal)
- **Reaction tool**: IM emoji tap-back reaction (send emoji reactions to messages in Telegram/Discord)
- **Audio transcription for IM connectors**: Receive voice messages from Telegram and Discord, transcribe via local Whisper (if available) or cloud fallback, feed transcript to agent

## Out of Scope (deferred)
- Web UI frontend
- Native macOS / iOS / watchOS apps
- MCP server support
- New IM connectors (WhatsApp, Slack, etc.)
- New bundled skills beyond what's needed for the new tools
- TUI microphone input (audio is IM-only this phase)
- Text-to-speech / voice output

## Acceptance Criteria
- [ ] Webhook connector accepts HTTP POST, creates/resumes sessions, streams responses
- [ ] IM connectors have configurable tool-approval mode (always/once-per-type/never) in config
- [ ] Approval UI in Telegram and Discord shows "Accept all <tool> this session" option
- [ ] Nvidia NIM appears as a built-in provider in wizard and config CLI
- [ ] TUI `/sessions` command lists all active Engine sessions with connector type
- [ ] TUI supports switching to view/interact with any session
- [ ] web_fetch tool fetches a URL and returns markdown content
- [ ] web_search tool queries Brave and/or Perplexity and returns structured results
- [ ] exec tool supports all parameters: command, workdir, env, yieldMs, background, timeout, pty
- [ ] reaction tool sends emoji reactions on Telegram and Discord
- [ ] Telegram voice messages are transcribed and processed by the agent
- [ ] Discord voice messages are transcribed and processed by the agent
- [ ] Audio transcription uses local Whisper if available, falls back to cloud API

## Phase Notes
Phase 2 shipped a solid Engine + Connector architecture with tRPC, device-flow auth, and three connectors (TUI, Telegram, Discord). The tool approval system currently treats all tools equally — Phase 3 adds granular permission control. The bash tool is functional but minimal (command, cwd, timeout) — the new exec tool is a superset. The TUI is single-session; Phase 3 adds cross-session visibility since the Engine already tracks all sessions via SessionManager.

## Shipped Plans
- #042 — Configurable tool approval for IM connectors: Add per-connector toolApproval setting (always/never/ask) with session-level overrides. Files: types.ts, defaults.ts, procedures.ts, types.ts, transport.ts, transport.ts, App.tsx, ConnectorSettings.tsx
- #043 — Advanced exec tool to replace bash: Create exec tool with workdir, env, background, yieldMs, timeout plus exec_status/exec_kill companion tools. Files: exec.ts, exec-background.ts, index.ts
- #044 — Add Nvidia NIM as a built-in provider: Add "nvidia" provider type hitting integrate.api.nvidia.com/v1. Files: fetch-models.ts, ModelSetup.tsx, ProviderManager.tsx
- #045 — web_fetch built-in tool: Fetch URLs and convert HTML to markdown via node-html-markdown. Files: web-fetch.ts, index.ts
- #046 — web_search built-in tool: Search web via Brave or Perplexity API with auto-backend selection. Files: web-search.ts, index.ts
