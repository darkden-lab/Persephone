# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

- `npm run build` -- Compile TypeScript to `dist/`
- `npm run dev` -- Watch mode compilation
- `npm run lint` -- Run ESLint on `src/`
- `npm test` -- Run tests with vitest
- `npm run test:watch` -- Watch mode tests
- `npx vitest run tests/path/file.test.ts` -- Run a single test file

## Architecture

Persephone is a Claude Code plugin (MCP server) connecting Claude Code to Discord or Telegram. ESM (`"type": "module"`), TypeScript strict mode, Node16 module resolution.

### Request Flow

```
Claude Code ─(stdio)─> McpServer (server.ts) ─> Tool (src/tools/*.ts) ─> MessagingClient ─> Discord/Telegram API
                                                                              │
                                                                        MessageBuffer ◄── incoming messages
```

**MCP Server** (`src/server.ts`): Entry point. Detects platform via `PERSEPHONE_PLATFORM` env (default: `discord`), dynamically imports the appropriate client, and registers all 7 tools.

**MessagingClient Interface** (`src/platform/messaging-client.ts`): Platform-agnostic contract implemented by both clients. All tools code against this interface, never against Discord/Telegram directly.

**Platform Clients** (`src/platform/discord/client.ts`, `src/platform/telegram/client.ts`): Implement `MessagingClient`. Each manages its connection, active channel, message buffering, auto-splitting, and interactive components (buttons/inline keyboards). The Discord client uses AbortController for `waitForMessage()` cancellation; Telegram mirrors this pattern.

**Message Buffer** (`src/platform/message-buffer.ts`): Circular buffer (capacity 100) with read-position tracking. Shared between incoming message handlers and `check_messages`/`wait_for_message` tools.

**Tools** (`src/tools/`): Each file exports a `register*` function called from `server.ts`. Pattern for adding a new tool:
1. Create `src/tools/my-tool.ts` exporting `registerMyTool(server, client)`
2. Use `server.registerTool('tool_name', { description, inputSchema }, handler)`
3. Import and call from `server.ts`
4. Return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`
5. Catch errors with generic messages (VUL-009): never expose `String(error)` to the user

**Audio Pipeline** (`src/audio/`): Download → decode (OGG Opus/MP3/WAV) → resample to 16kHz mono → Whisper ASR. The transcriber (`transcriber.ts`) is a lazy singleton wrapping `onnx-community/whisper-small` with fp16 encoder + q4 decoder quantization. Voice messages update `BufferedMessage.transcription` in-place asynchronously.

**Skills** (`skills/`): `connect/SKILL.md` and `listen/SKILL.md` guide Claude through connection and persistent listening flows. Both are platform-agnostic.

## Configuration

- **Platform**: `PERSEPHONE_PLATFORM` (`discord` | `telegram`, default: `discord`)
- **Discord**: `DISCORD_BOT_TOKEN` env variable
- **Telegram**: `TELEGRAM_BOT_TOKEN` env variable
- **Whisper Language**: `WHISPER_LANGUAGE` env variable (default: `spanish`). transformers.js lacks auto-detection, so language must be explicit.

## Key Constraints

- Message limits: Discord 2000 chars, Telegram 4096 chars (auto-split in clients)
- File size limits: Discord 25 MB, Telegram 50 MB (enforced via `client.maxFileSize`)
- `send_file` requires absolute paths, regular files only (no directories/symlinks)
- Channel ID format: Discord `/^\d+$/`, Telegram `/^-?\d+$/` (negative for groups)
- `ask_question`: max 5 button options, default 120s timeout (bounds: 1-3600s)
- `send_message` content capped at 50,000 chars (VUL-006)
- Audio downloads timeout at 30s (VUL-005); WAV sampleRate bounded 8kHz-384kHz (VUL-002)
- Telegram `sendMessage()` escapes Markdown special chars for plain text format; markdown/codeblock formats pass through raw
- All tool error responses use generic messages — never leak internal error details

## Testing

Tests use vitest and are in `tests/` mirroring `src/` structure. Audio pipeline has the most coverage (53 tests across 6 files). Platform clients and individual tools have minimal test coverage — only tool registration is tested (`tests/tools/tools.test.ts`).

## Lint Rules

- `@typescript-eslint/no-unused-vars`: error (prefix unused args with `_`)
- `@typescript-eslint/no-explicit-any`: warn
- ESLint ignores `dist/`, `node_modules/`, `tests/`
