---
id: 007
title: TUI interface with Ink
status: pending
type: feature
priority: 5
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---

# TUI interface with Ink

## Context
The TUI is the primary local interface for SA. Built with Ink (React for the terminal), it provides a chat view, text input, and model switching. It should be minimalist — no chrome, just the conversation.

## Approach
1. Create the main `App` component that orchestrates the TUI:
   - `<ChatView>` — scrollable message list (user messages, assistant responses, tool outputs)
   - `<Input>` — text input at the bottom with submit handling
   - `<StatusBar>` — minimal bar showing active model name and memory status
2. Wire up the Agent:
   - On user submit → call `agent.chat(message)`
   - Stream assistant response tokens into the ChatView in real-time
   - Display tool calls and their results inline
3. Model switching:
   - Keyboard shortcut or `/model` command to open a model picker
   - List available models from router, highlight active, select to switch
4. Implement key bindings:
   - `Enter` — send message
   - `Ctrl+C` — exit
   - `Ctrl+M` — switch model
5. Handle long messages — wrap text, truncate tool output with expand toggle
6. Entry point: `src/index.ts` renders `<App>` via Ink's `render()`

## Files to change
- `src/tui/App.tsx` (create — main TUI component)
- `src/tui/ChatView.tsx` (create — message display)
- `src/tui/Input.tsx` (create — text input component)
- `src/tui/StatusBar.tsx` (create — model/status indicator)
- `src/tui/ModelPicker.tsx` (create — model switching UI)
- `src/tui/index.ts` (create — barrel export)
- `src/index.ts` (modify — wire up TUI as default entry point)

## Verification
- Run: `bun run dev` (manual verification)
- Expected: TUI renders, user can type and send messages, responses stream in, model switching works
- Edge cases: very long messages, rapid input, terminal resize, Ctrl+C during streaming
