# Persephone

A Claude Code plugin that connects Claude Code with Discord for bidirectional communication.

## Features

- **send_message** -- Send text to Discord (plain, codeblock, or markdown)
- **send_notification** -- Rich embed notifications (success/error/warning/info)
- **send_file** -- Send file attachments
- **check_messages** -- Poll for new messages from Discord users
- **ask_question** -- Interactive buttons for decisions (2-5 options)
- **wait_for_message** -- Block until a Discord message arrives
- **set_channel** -- Configure the active channel per session

### Skills

- `/persephone:connect <channel_id>` -- Connect to a Discord channel
- `/persephone:listen` -- Start a persistent listening loop (Discord becomes your CLI)

### Auto-Detection Hooks

Persephone includes Claude Code hooks that detect Discord messages automatically:

- **Stop hook**: When Claude finishes responding, checks for pending Discord messages. If found, blocks Claude from stopping and prompts it to read them.
- **UserPromptSubmit hook**: When you type anything in the CLI, checks for pending Discord messages and injects them as context.

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

### 5. Start Listening (Optional)

To enter a persistent listening mode where Discord messages are treated like CLI input:

> /persephone:listen

This starts a loop where Claude waits for Discord messages indefinitely. You can leave the session open, go do other things, and send ideas to Claude via Discord whenever you want. Say "exit" or "salir" in Discord to stop the loop.

## How Listening Works

```
You (Discord)              Claude Code                 Discord Channel
    |                          |                            |
    |--- "read src/app.ts" --> |                            |
    |                          |-- [reads file] ----------> |
    |                          |-- send_message(content) -> |
    |                          |                            |
    |                          |<-- wait_for_message -------|
    |                          |        (waiting...)        |
    |                          |                            |
    |--- "fix the bug" ------> |                            |
    |                          |-- [fixes bug] -----------> |
    |                          |-- send_message(done) ----> |
    |                          |                            |
    |--- "salir" ------------> |                            |
    |                          |-- notification(bye) -----> |
    |                          |   (loop ends)              |
```

## Limitations

- File uploads are limited to 25 MB (Discord standard bot limit)
- Message buffer holds a maximum of 100 messages in memory
- Messages exceeding 2000 characters are auto-split at newline boundaries
- The bot requires **Message Content Intent** enabled in Discord Developer Portal
- Listening mode requires the Claude Code session to remain open
- Auto-detection hooks only catch messages during or between Claude's turns, not while completely idle without the listening loop

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
      pending-signal.ts         # File-based IPC for hook auto-detection
    tools/
      set-channel.ts            # Tool: set_channel
      send-message.ts           # Tool: send_message
      send-notification.ts      # Tool: send_notification
      send-file.ts              # Tool: send_file
      check-messages.ts         # Tool: check_messages
      ask-question.ts           # Tool: ask_question
      wait-for-message.ts       # Tool: wait_for_message
  hooks/
    hooks.json                  # Hook configuration for the plugin
    check-discord.mjs           # Stop hook: blocks when Discord messages pending
    inject-discord-context.mjs  # UserPromptSubmit hook: injects Discord context
  skills/
    connect/SKILL.md            # Skill: /persephone:connect
    listen/SKILL.md             # Skill: /persephone:listen
  tests/                        # Vitest test suites
```

## License

MIT
