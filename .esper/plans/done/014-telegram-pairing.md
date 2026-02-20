---
id: 14
title: Telegram pairing — restrict bot to one authorized user
status: done
type: feature
priority: 1
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
shipped_at: 2026-02-20
---
# Telegram Pairing — Restrict Bot to One Authorized User

## Context

The Telegram transport (`src/telegram/transport.ts`) already has `allowedChatId` filtering infrastructure: when `allowedChatId` is set in `TelegramTransportOptions`, any message from a different `chat.id` is silently dropped. However, it is **never populated** — `index.ts` creates `TelegramTransport` without passing `allowedChatId`, so the bot currently responds to anyone who finds it.

`SecretsFile` (in `src/config/types.ts`) stores `botToken` but has no field for a paired chat ID.

The onboarding wizard (`src/wizard/TelegramSetup.tsx`) collects the bot token but has no pairing step.

The plan is:
1. Generate a one-time pairing code during onboarding and show it to the user.
2. The user sends `/pair <code>` to the bot from Telegram.
3. The bot captures and persists their `chat.id` + `user.id` into `~/.sa/secrets.enc`.
4. From that point on, the bot ignores all senders except the paired chat.

## Approach

### 1. Extend `SecretsFile` type (`src/config/types.ts`)
Add `pairedChatId?: number` to `SecretsFile`.

### 2. Extend `saveSecrets` / `loadSecrets` (`src/config/secrets.ts`)
The new field round-trips automatically because encryption covers the whole JSON blob — no code changes needed beyond the type.

### 3. Generate a pairing code in the wizard (`src/wizard/TelegramSetup.tsx` or `Wizard.tsx`)
- After the user enters a valid bot token, generate a random 6-character alphanumeric pairing code (e.g. `A3X9KQ`) and store it in `WizardData`.
- Show the user: *"To authorize yourself, send this to your bot: `/pair A3X9KQ`"*

### 4. Extend `WizardData` interface (`src/wizard/Confirm.tsx`)
Add `pairingCode: string` to `WizardData`.

### 5. Update `Wizard.tsx` to generate and pass the code
In the `TelegramSetup` → `Confirm` transition, generate the pairing code once and store in state.

### 6. Update `TelegramSetup.tsx` to display the pairing code
After a valid token is entered, show the pairing instruction with the generated code. The wizard can advance only after the user acknowledges (pressing Enter/Next).

### 7. Add `/pair <code>` handler in `TelegramTransport` (`src/telegram/transport.ts`)
- Register a command handler for `/pair`.
- Extract the code argument and compare to the expected pairing code (passed via `TelegramTransportOptions`).
- On match: record `ctx.message.chat.id`, call a callback/save function, reply "✅ Paired! I will only respond to you from now on.", and activate filtering.
- On mismatch: reply "❌ Invalid pairing code."
- The `/pair` command must work even before a chat is paired (i.e. it is exempt from the `allowedChatId` check).

### 8. Extend `TelegramTransportOptions` (`src/telegram/transport.ts`)
Add:
```typescript
pairingCode?: string;           // expected code; if set, /pair command is active
onPaired?: (chatId: number) => Promise<void>;  // callback to persist
```

### 9. Wire it all together in `index.ts`
- Load `secrets.pairedChatId` and pass it as `allowedChatId` to `TelegramTransport`.
- Pass `pairingCode` from `RuntimeConfig` or a temporary in-memory value (see note below).
- Implement `onPaired` callback: call `config.saveSecrets({ ...secrets, pairedChatId: chatId })`.

> **Note on pairing code storage**: The code is ephemeral — generated once at wizard time and does not need to be persisted. However, to support re-pairing (e.g. user gets a new phone), expose a way to re-generate a code at runtime. For phase-1, persisting the pairing code in `secrets.enc` as `pairingCode?: string` is simplest — it is overwritten on each re-pair attempt via a future CLI flag or TUI option.

Add `pairingCode?: string` to `SecretsFile` so the wizard can write it and `index.ts` can read it.

### 10. Update `Wizard.tsx` — save pairing code to secrets
In `handleComplete`, include `pairingCode` in the `saveSecrets` call.

### 11. Tests (`src/telegram/telegram.test.ts`)
- `/pair` with correct code → chat ID set, replies with success
- `/pair` with wrong code → replies with error, chat ID unchanged
- Message from non-paired chat → dropped (no agent call)
- Message from paired chat → forwarded to agent

## Files to Change

- `src/config/types.ts` (modify — add `pairedChatId?: number` and `pairingCode?: string` to `SecretsFile`)
- `src/telegram/transport.ts` (modify — add `pairingCode` + `onPaired` options, add `/pair` handler, exempt `/pair` from allowedChatId guard)
- `src/wizard/TelegramSetup.tsx` (modify — display generated pairing code and instructions after token entry)
- `src/wizard/Confirm.tsx` (modify — add `pairingCode: string` to `WizardData`)
- `src/wizard/Wizard.tsx` (modify — generate pairing code, pass to TelegramSetup, include in `saveSecrets`)
- `src/index.ts` (modify — load `pairedChatId` and `pairingCode` from secrets, pass to `TelegramTransport`, implement `onPaired` callback)
- `src/telegram/telegram.test.ts` (modify — add pairing tests)

## Verification

- Run: `bun test`
- Expected: all existing tests pass; new telegram pairing tests pass
- Manual smoke test:
  1. Run the wizard — verify pairing code is displayed in the TelegramSetup step
  2. Start the agent — send `/pair WRONG` to the bot → get error reply
  3. Send `/pair <correct code>` → get success reply
  4. Send a regular message → agent responds
  5. From a second Telegram account, send a message → bot is silent
  6. Restart the agent — paired chat ID is loaded from secrets, filtering is active immediately

- Edge cases:
  - Bot started without `pairedChatId` in secrets and without `pairingCode` → no filtering at all (backwards compat for dev)
  - `/pair` called after already paired → re-pairs to the new sender (allows phone migration)
  - `onPaired` callback failure (disk full etc.) → log error, still activate in-memory for the session

## Progress
- Milestones: 6 commits
- Modified: src/config/types.ts, src/telegram/transport.ts, src/telegram/index.ts, src/wizard/steps/TelegramSetup.tsx, src/wizard/steps/Confirm.tsx, src/wizard/Wizard.tsx, src/index.ts, tests/telegram.test.ts
- Verification: not yet run — run /esper:finish to verify and archive
