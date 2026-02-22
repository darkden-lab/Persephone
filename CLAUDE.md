# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

- `npm run build` -- Compile TypeScript to `dist/`
- `npm run dev` -- Watch mode compilation
- `npm test` -- Run tests with vitest
- `npm run test:watch` -- Watch mode tests
- `npx vitest run tests/path/file.test.ts` -- Run a single test file

## Architecture

Persephone is a Claude Code plugin (MCP server) connecting Claude Code to Discord or Telegram.

**MCP Server** (`src/server.ts`): stdio transport entry point. Detects platform via `PERSEPHONE_PLATFORM` env (default: `discord`), creates the appropriate client, and registers all tools.

**MessagingClient Interface** (`src/platform/messaging-client.ts`): Platform-agnostic interface implemented by both Discord and Telegram clients. Defines `sendMessage`, `sendNotification`, `sendFile`, `askQuestion`, `waitForMessage`, etc.

**Discord Client** (`src/platform/discord/client.ts`): Wraps discord.js. Implements `MessagingClient`. Manages the active channel, sends messages/embeds/files, handles inline buttons, and buffers incoming messages. Auto-splits messages at 2000 chars.

**Telegram Client** (`src/platform/telegram/client.ts`): Wraps Telegraf. Implements `MessagingClient`. Manages the active chat, sends messages with Markdown, handles inline keyboard callbacks, and buffers incoming messages. Auto-splits messages at 4096 chars.

**Message Buffer** (`src/platform/message-buffer.ts`): Circular buffer (capacity 100) storing incoming messages. Tracks a "last read" position for polling via `check_messages`.

**Tools** (`src/tools/`): Each file exports a `register*` function that registers one MCP tool on the server. All tools accept `MessagingClient` (platform-agnostic). All tools require `set_channel` to be called first (except `set_channel` itself). Interactive tools (`ask_question`, `wait_for_message`) block until the user responds or timeout is reached.

**Audio Transcription** (`src/audio/`): Audio processing pipeline supporting OGG Opus, MP3, and WAV formats. `transcriber.ts` wraps Whisper (onnx-community/whisper-base via @huggingface/transformers) as a lazy singleton. `decoder.ts` provides format-specific decoders and a `decodeAudioToPcm` dispatcher. `voice-message-handler.ts` orchestrates download→decode→transcribe and updates `BufferedMessage.transcription` in-place.

**Skills** (`skills/`): `connect/SKILL.md` guides channel connection flow. `listen/SKILL.md` guides the persistent listening loop. Both are platform-agnostic.

## Configuration

- **Platform**: `PERSEPHONE_PLATFORM` env variable (`discord` or `telegram`, default: `discord`)
- **Discord**: `DISCORD_BOT_TOKEN` env variable
- **Telegram**: `TELEGRAM_BOT_TOKEN` env variable
- **Whisper Language**: `WHISPER_LANGUAGE` env variable (default: `spanish`). transformers.js lacks auto-detection, so language must be explicit.
- **Session**: Channel/chat ID set via the `set_channel` tool at runtime

## Key Constraints

- Message limits: Discord 2000 chars, Telegram 4096 chars (auto-split in clients)
- File size limits: Discord 25 MB, Telegram 50 MB (enforced in `send_file` tool via `client.maxFileSize`)
- Message buffer: circular, 100 messages max, clears on channel change
- MCP transport: stdio only (runs as Claude Code subprocess)
- All tools return JSON strings in MCP `text` content blocks
- `send_file` requires absolute paths, regular files (no directories/symlinks)
- Channel ID validation: Discord `/^\d+$/`, Telegram `/^-?\d+$/` (negative for groups)
- `MessageBuffer.getAll(0)` and `getNewSinceLastRead(0)` return empty arrays (limit=0 is handled)
- `ask_question` supports max 5 button options (Discord row limit, Telegram inline keyboard)
- `ask_question` and `wait_for_message` default to 120 second timeout
- Voice messages detected via `MessageFlags.IsVoiceMessage` (Discord) or `voice` message type (Telegram)
- Audio file attachments (MP3, WAV, OGG) auto-transcribed when detected
- Supported audio MIME types: `audio/ogg`, `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`, `audio/wave`
- `BufferedMessage` has optional `transcription` and `voiceDurationMs` fields
- Whisper model (~39MB) downloads on first audio message; cached in `~/.cache/huggingface/`
- `wait_for_message` polls up to 10s for transcription to complete before returning

## Testing

Tests are organized by module:
- `tests/discord/message-buffer.test.ts` -- Core buffer functionality (6 tests)
- `tests/discord/message-buffer-edge-cases.test.ts` -- Edge cases: empty buffer, limit=0, overflow, special chars, voice fields (18 tests)
- `tests/discord/split-message.test.ts` -- Message splitting logic for 2000 char limit (8 tests)
- `tests/audio/transcriber.test.ts` -- Whisper pipeline singleton, initFailed, trimming (5 tests)
- `tests/audio/decoder.test.ts` -- OGG decode, stereo-to-mono, resampling, free() cleanup (5 tests)
- `tests/audio/decoder-mp3.test.ts` -- MP3 decode, stereo mix, resample, free() cleanup (6 tests)
- `tests/audio/decoder-wav.test.ts` -- WAV synthetic bytes: 16-bit mono/stereo, 8-bit, float32, invalid headers (8 tests)
- `tests/audio/decoder-dispatcher.test.ts` -- MIME type routing, isSupportedAudioType, unsupported types (12 tests)
- `tests/audio/voice-message-handler.test.ts` -- isVoiceAttachment, isAudioAttachment, processVoiceMessage, processAudioAttachment (17 tests)
- `tests/tools/tools.test.ts` -- Tool registration integration test (1 test)
