# Setup

## Prerequisites

- [Bun](https://bun.sh)
- Git
- provider API keys for any live-model testing

## Install

```bash
git clone <repo-url> aria
cd aria
bun install
```

## Local Run

```bash
bun run dev
```

Use `ARIA_HOME=/tmp/aria-dev` when you want an isolated runtime home.

## Main Commands

```bash
vp run repo:check
vp run repo:test
vp run repo:build
```

## Repo Shape

The repo is package-first:

- `packages/runtime`
- `packages/handoff`
- `packages/relay`
- `packages/connectors`
- `packages/cli`

Import through the package aliases rather than deep relative paths.
