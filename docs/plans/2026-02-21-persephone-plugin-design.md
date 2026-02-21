# Persephone - Claude Code Discord Plugin Design

**Date:** 2026-02-21
**Repository:** darkden-lab/Persephone
**Status:** Approved

## Overview

Persephone is a full Claude Code plugin that connects Claude Code with Discord. It enables bidirectional communication: Claude can send messages, notifications, files, and logs to a Discord channel, and users can respond from Discord.

## Architecture

### Plugin Structure

```
Persephone/
├── .claude-plugin/
│   └── plugin.json                 # Plugin manifest
├── src/
│   ├── server.ts                   # MCP server (stdio transport)
│   ├── discord/
│   │   ├── client.ts               # Discord.js client wrapper
│   │   └── message-buffer.ts       # Circular buffer for incoming messages
│   └── tools/
│       ├── set-channel.ts          # Tool: set_channel
│       ├── send-message.ts         # Tool: send_message
│       ├── send-notification.ts    # Tool: send_notification
│       ├── send-file.ts            # Tool: send_file
│       └── check-messages.ts       # Tool: check_messages
├── skills/
│   └── connect/
│       └── SKILL.md                # Skill: /persephone:connect
├── .mcp.json                       # MCP server configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Data Flow

```
User (Discord) ──> Discord API ──> Bot (message-buffer) ──> check_messages tool ──> Claude
Claude ──> send_message/send_notification/send_file tool ──> Bot (client) ──> Discord API ──> Discord Channel
```

### Configuration

| Level | Key | Storage | Purpose |
|-------|-----|---------|---------|
| Global | `DISCORD_BOT_TOKEN` | env variable in `.mcp.json` | Bot authentication |
| Session | `channel_id` | In-memory via `set_channel` tool | Target channel for communication |

## Tools API

### `set_channel`

Configures the active Discord channel for the session.

```typescript
// Parameters
{ channel_id: string }

// Returns
{ success: boolean, channel_name: string, guild_name: string }
```

Validates bot access to the channel. Clears the message buffer on channel change.

### `send_message`

Sends a text message to the active channel.

```typescript
// Parameters
{ content: string, format?: "text" | "codeblock" | "markdown" }

// Returns
{ message_id: string, timestamp: string }
```

Auto-splits messages exceeding Discord's 2000 character limit.

### `send_notification`

Sends a rich embed notification to the active channel.

```typescript
// Parameters
{
  title: string,
  description: string,
  type: "success" | "error" | "warning" | "info",
  fields?: Array<{ name: string, value: string }>
}

// Returns
{ message_id: string }
```

Color mapping: success=green, error=red, warning=yellow, info=blue.

### `send_file`

Sends a file attachment to the active channel.

```typescript
// Parameters
{ file_path: string, message?: string }

// Returns
{ message_id: string, file_url: string }
```

### `check_messages`

Reads new messages from the message buffer.

```typescript
// Parameters
{ since_last_check?: boolean, limit?: number }

// Returns
{
  messages: Array<{
    author: string,
    content: string,
    timestamp: string,
    attachments: string[]
  }>
}
```

Defaults to returning only messages received since the last check.

## Message Buffer

- Circular buffer in memory, capacity: 100 messages
- Tracks "last read" position for `since_last_check` mode
- Only stores messages from the active channel
- Ignores messages from the bot itself
- Clears on channel change via `set_channel`

## Skill: /persephone:connect

Guides Claude to establish a Discord connection at session start. When the user says "connect to Discord" or provides a channel ID, the skill instructs Claude to:

1. Call `set_channel` with the provided channel ID
2. Send a confirmation message to the channel
3. Inform the user that the connection is active

## Error Handling

- Tools return descriptive errors if `set_channel` hasn't been called
- Discord.js handles automatic reconnection on connection loss
- Messages exceeding 2000 chars are auto-split or sent as file attachments
- File send failures include the specific error (file not found, too large, etc.)

## Stack

- **Runtime:** Node.js + TypeScript
- **Discord:** discord.js
- **MCP:** @modelcontextprotocol/sdk (stdio transport)
- **Build:** tsc (compiled to dist/)
