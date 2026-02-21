# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

- `npm run build` -- Compile TypeScript to `dist/`
- `npm run dev` -- Watch mode compilation
- `npm test` -- Run tests with vitest
- `npm run test:watch` -- Watch mode tests
- `npx vitest run tests/path/file.test.ts` -- Run a single test file

## Architecture

Persephone is a Claude Code plugin (MCP server) connecting Claude Code to Discord.

**MCP Server** (`src/server.ts`): stdio transport entry point. Starts the Discord bot and registers all tools.

**Discord Client** (`src/discord/client.ts`): Wraps discord.js. Manages the active channel, sends messages/embeds/files, and buffers incoming messages.

**Message Buffer** (`src/discord/message-buffer.ts`): Circular buffer (capacity 100) storing incoming Discord messages. Tracks a "last read" position for polling via `check_messages`.

**Tools** (`src/tools/`): Each file exports a `register*` function that registers one MCP tool on the server. All tools require `set_channel` to be called first (except `set_channel` itself). Interactive tools (`ask_question`, `wait_for_message`) block until the user responds or timeout is reached.

**Pending Signal** (`src/discord/pending-signal.ts`): File-based IPC. Writes a temp file (`persephone-pending.json` in OS tmpdir) when Discord messages arrive; cleared when messages are read. Enables the Stop hook to detect unread messages.

**Hooks** (`hooks/`): Claude Code Stop hook (`check-discord.mjs`) that blocks Claude from stopping when there are unread Discord messages, prompting it to check and respond automatically.

**Skill** (`skills/connect/SKILL.md`): Guides Claude through the channel connection flow and Discord listening loop.

## Configuration

- **Global**: `DISCORD_BOT_TOKEN` env variable (set in `~/.claude.json` or system env)
- **Session**: Channel ID set via the `set_channel` tool at runtime

## Key Constraints

- Discord message limit: 2000 chars (auto-split in client.ts)
- Message buffer: circular, 100 messages max, clears on channel change
- MCP transport: stdio only (runs as Claude Code subprocess)
- All tools return JSON strings in MCP `text` content blocks
- `send_file` enforces 25 MB max file size and requires regular files (no directories/symlinks)
- `set_channel` validates that the channel ID is a numeric Discord snowflake
- `MessageBuffer.getAll(0)` and `getNewSinceLastRead(0)` return empty arrays (limit=0 is handled)
- `ask_question` supports max 5 button options per row (Discord component limit)
- `ask_question` and `wait_for_message` default to 120 second timeout

## Testing

Tests are organized by module:
- `tests/discord/message-buffer.test.ts` -- Core buffer functionality (6 tests)
- `tests/discord/message-buffer-edge-cases.test.ts` -- Edge cases: empty buffer, limit=0, overflow, special chars (15 tests)
- `tests/discord/split-message.test.ts` -- Message splitting logic for 2000 char limit (8 tests)
- `tests/tools/tools.test.ts` -- Tool registration integration test (1 test)
