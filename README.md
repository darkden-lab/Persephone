# Persephone

A Claude Code plugin that connects Claude Code with Discord for bidirectional communication.

## Features

- **send_message** -- Send text to Discord (plain, codeblock, or markdown)
- **send_notification** -- Rich embed notifications (success/error/warning/info)
- **send_file** -- Send file attachments
- **check_messages** -- Poll for new messages from Discord users
- **set_channel** -- Configure the active channel per session

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to Bot tab, create bot, copy the token
4. Enable **Message Content Intent** in the bot settings
5. Invite the bot to your server with `Send Messages`, `Read Messages`, and `Attach Files` permissions

### 2. Install the Plugin

```bash
claude plugin install persephone
```

Or for local development:

```bash
claude --plugin-dir /path/to/persephone
```

### 3. Configure the Bot Token

```bash
# Set the token globally
export DISCORD_BOT_TOKEN=your_token_here
```

### 4. Connect to a Channel

In Claude Code, say:

> Connect to Discord channel 1234567890123456789

Or use the skill:

> /persephone:connect 1234567890123456789

## Limitations

- File uploads are limited to 25 MB (Discord standard bot limit)
- Message buffer holds a maximum of 100 messages in memory
- Messages exceeding 2000 characters are auto-split at newline boundaries
- The bot requires **Message Content Intent** enabled in Discord Developer Portal

## Development

```bash
npm install
npm run build
npm test
```

## Project Structure

```
Persephone/
  .claude-plugin/plugin.json    # Claude Code plugin manifest
  .mcp.json                     # MCP server configuration
  src/
    server.ts                   # Entry point -- wires Discord client + MCP tools
    discord/
      client.ts                 # Discord.js wrapper with channel management
      message-buffer.ts         # Circular buffer for incoming messages
    tools/
      set-channel.ts            # Tool: set_channel
      send-message.ts           # Tool: send_message
      send-notification.ts      # Tool: send_notification
      send-file.ts              # Tool: send_file
      check-messages.ts         # Tool: check_messages
  skills/connect/SKILL.md       # Skill: /persephone:connect
  tests/                        # Vitest test suites
```
