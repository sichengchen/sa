---
id: 050
title: Audio transcription for IM connectors
status: pending
type: feature
priority: 2
phase: phase-3
branch: feature/phase-3
created: 2026-02-21
---

# Audio transcription for IM connectors

## Context
Telegram and Discord both support voice messages, but SA currently only handles text messages (Telegram: `message:text` handler, Discord: `messageCreate` with text content). Phase 3 adds audio transcription so voice messages are automatically converted to text and processed by the agent.

## Approach

1. **Detect local Whisper installation** — on Engine startup, check for:
   - `whisper` CLI (OpenAI Whisper via pip)
   - `whisper-cpp` / `whisper.cpp` binary
   - Store availability in Engine runtime state

2. **Create transcription service** — `src/engine/audio/transcriber.ts`:
   - Interface: `transcribe(audioBuffer: Buffer, format: string): Promise<string>`
   - **Local strategy**: If Whisper is available, write temp file, run `whisper --model small --output_format txt`, read result, clean up
   - **Cloud fallback**: If no local Whisper, use OpenAI Whisper API (`POST https://api.openai.com/v1/audio/transcriptions`) — requires OPENAI_API_KEY
   - Strategy selection: prefer local, fallback to cloud, error if neither available

3. **Handle Telegram voice messages** — in `src/connectors/telegram/transport.ts`:
   - Add handler for `message:voice` and `message:audio` events
   - Download the voice file via `ctx.api.getFile()` + fetch
   - Send to Engine via a new tRPC mutation `chat.transcribeAndSend`
   - Engine transcribes and feeds the transcript as a regular user message

4. **Handle Discord voice messages** — in `src/connectors/discord/transport.ts`:
   - Discord voice messages are attachments with audio content type
   - Detect audio attachments in `messageCreate` handler
   - Download attachment, send to Engine for transcription

5. **Add tRPC procedure** — `chat.transcribeAndSend`:
   - Input: `{ sessionId, audio: base64, format: string }`
   - Transcribes audio, then processes as a normal chat message
   - Returns transcript alongside the streaming response

6. **Config** — add `audio: { enabled: boolean, preferLocal: boolean }` to RuntimeConfig.

## Files to change
- `src/engine/audio/transcriber.ts` (create — transcription service with local + cloud strategies)
- `src/engine/audio/index.ts` (create — exports)
- `src/engine/runtime.ts` (modify — initialize transcriber, detect Whisper)
- `src/engine/procedures.ts` (modify — add chat.transcribeAndSend)
- `src/connectors/telegram/transport.ts` (modify — handle voice/audio messages)
- `src/connectors/discord/transport.ts` (modify — handle audio attachments)
- `src/engine/config/types.ts` (modify — add audio config)
- `src/engine/config/defaults.ts` (modify — add audio defaults)

## Verification
- Run: `bun test`
- Expected: Voice messages are transcribed and processed; agent responds to transcript
- Edge cases: Large audio files (timeout/memory), unsupported audio formats, no Whisper + no OpenAI key (clear error), concurrent transcription requests, Telegram OGG format conversion
