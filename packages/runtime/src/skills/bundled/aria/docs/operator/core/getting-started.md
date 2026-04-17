# Getting Started

## Install

```bash
bun install
```

## First Run

```bash
bun run dev:server
```

If `ARIA_HOME/config.json` does not exist, Aria opens onboarding first.
If you plan to use MiniMax, have `MINIMAX_API_KEY` ready for the provider setup step.
For the general SDK-style path, prefer the `MiniMax ... (Anthropic-compatible)` preset during onboarding or in `aria config`.
That preset exposes the official MiniMax text model list directly in the picker: `MiniMax-M2.7`, `MiniMax-M2.7-highspeed`, `MiniMax-M2.5`, `MiniMax-M2.5-highspeed`, `MiniMax-M2.1`, `MiniMax-M2.1-highspeed`, and `MiniMax-M2`.

## App Dev Loops

```bash
bun run dev:server
bun run dev:desktop
bun run dev:mobile
```

## First Commands To Learn

- `aria`
- `aria config`
- `aria engine status`
- `aria automation`
- `aria memory`
- `aria projects`
- `aria gateway`
