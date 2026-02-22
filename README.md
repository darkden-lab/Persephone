# Persephone

A Claude Code plugin that connects Claude Code with **Discord** or **Telegram** for bidirectional communication, notifications, file sharing, and voice message transcription.

## Features

### MCP Tools

| Tool | Description |
|------|-------------|
| `set_channel` | Connect to a Discord channel or Telegram chat |
| `send_message` | Send text messages (plain, codeblock, or markdown) |
| `send_notification` | Rich embed notifications (success/error/warning/info) |
| `send_file` | Send file attachments (up to 25 MB Discord / 50 MB Telegram) |
| `check_messages` | Poll for new messages from users |
| `ask_question` | Interactive buttons for decisions (2-5 options) |
| `wait_for_message` | Block until a message arrives or timeout |

### Skills

- `/persephone:connect <channel_id>` -- Connect to a channel and start interacting
- `/persephone:listen` -- Persistent listening loop (chat becomes your CLI)

### Voice & Audio Transcription

Persephone automatically transcribes voice messages and audio files using **Whisper** (OpenAI's speech recognition model, running locally via ONNX):

- Discord voice messages (OGG Opus)
- Audio file attachments: MP3, WAV, OGG
- Configurable language via `WHISPER_LANGUAGE` env variable
- Model: `whisper-small` with per-module quantization (~150 MB download on first use)

## Installation

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- Node.js 20+
- A Discord bot or Telegram bot (see setup below)

### Install from GitHub

```bash
claude mcp add persephone \
  -s user \
  -e DISCORD_BOT_TOKEN=your_discord_token_here \
  -- npx -y github:darkden-lab/Persephone
```

This installs Persephone as an MCP server globally (`-s user`) with your Discord bot token.

**For Telegram instead:**

```bash
claude mcp add persephone \
  -s user \
  -e TELEGRAM_BOT_TOKEN=your_telegram_token_here \
  -e PERSEPHONE_PLATFORM=telegram \
  -- npx -y github:darkden-lab/Persephone
```

### Install as Local Plugin

If you want to develop or modify Persephone:

```bash
git clone https://github.com/darkden-lab/Persephone.git
cd Persephone
npm install
npm run build
```

Then add it as a local MCP server:

```bash
claude mcp add persephone \
  -s user \
  -e DISCORD_BOT_TOKEN=your_token_here \
  -- node /absolute/path/to/Persephone/dist/server.js
```

### Verify Installation

Restart Claude Code and check that the MCP server is running:

```bash
claude mcp list
```

You should see `persephone` listed with its tools.

## Platform Setup

### Discord

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application, then go to **Bot** tab and create a bot
3. Copy the **bot token**
4. Enable **Message Content Intent** under Bot > Privileged Gateway Intents
5. Go to **OAuth2 > URL Generator**, select `bot` scope with permissions:
   - Send Messages
   - Read Messages/View Channels
   - Read Message History
   - Attach Files
6. Use the generated URL to invite the bot to your server
7. Right-click the target channel in Discord > **Copy Channel ID** (enable Developer Mode in Discord settings if you don't see this option)

### Telegram

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts to create a bot
3. Copy the **bot token** BotFather gives you
4. Add the bot to a group, or message it directly
5. To get the **chat ID**:
   - For direct messages: send any message to the bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` and look for `chat.id`
   - For groups: the chat ID is negative (e.g., `-1001234567890`)

## Usage

### Connect to a Channel

In Claude Code:

```
/persephone:connect 1234567890123456789
```

### Start Listening

Enter a persistent loop where chat messages are processed like CLI input:

```
/persephone:listen
```

Say **"exit"**, **"salir"**, or **"stop"** in the chat to end the loop.

### How Listening Works

```
You (Chat)                 Claude Code                 Channel
    |                          |                          |
    |--- "read src/app.ts" --> |                          |
    |                          |-- [reads file] --------> |
    |                          |-- send_message(code) --> |
    |                          |                          |
    |                          |<-- wait_for_message -----|
    |                          |        (waiting...)      |
    |                          |                          |
    |--- "fix the bug" ------> |                          |
    |                          |-- [fixes bug] ---------> |
    |                          |-- send_message(done) --> |
    |                          |                          |
    |--- "salir" ------------> |                          |
    |                          |-- notification(bye) ---> |
    |                          |   (loop ends)            |
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_BOT_TOKEN` | _(required for Discord)_ | Discord bot token |
| `TELEGRAM_BOT_TOKEN` | _(required for Telegram)_ | Telegram bot token |
| `PERSEPHONE_PLATFORM` | `discord` | Platform to use: `discord` or `telegram` |
| `WHISPER_LANGUAGE` | `spanish` | Language for voice transcription (e.g., `english`, `french`, `german`) |

### Supported Whisper Languages

Whisper supports 99 languages. Common values for `WHISPER_LANGUAGE`: `english`, `spanish`, `french`, `german`, `italian`, `portuguese`, `dutch`, `russian`, `chinese`, `japanese`, `korean`, `arabic`, `hindi`.

> **Note:** `@huggingface/transformers` (the JS runtime) does not support automatic language detection. You must set `WHISPER_LANGUAGE` explicitly. Without it, transcription defaults to the configured language.

## Limitations

- **Message limits:** Discord 2000 chars, Telegram 4096 chars (auto-split)
- **File size:** Discord 25 MB, Telegram 50 MB
- **Message buffer:** 100 messages max in memory, clears on channel change
- **Audio transcription:** Max 5 minutes per audio file; Whisper model (~150 MB) downloads on first voice message
- **MCP transport:** stdio only (runs as a Claude Code subprocess)
- **Discord** requires **Message Content Intent** enabled in the Developer Portal
- **Listening mode** requires the Claude Code session to remain open

## Development

```bash
git clone https://github.com/darkden-lab/Persephone.git
cd Persephone
npm install
npm run build        # Compile TypeScript
npm test             # Run tests (86 tests across 10 suites)
npm run dev          # Watch mode compilation
```

### Running a Single Test

```bash
npx vitest run tests/audio/transcriber.test.ts
```

## Project Structure

```
Persephone/
  .claude-plugin/plugin.json    # Claude Code plugin manifest
  src/
    server.ts                   # MCP server entry point (platform factory)
    platform/
      messaging-client.ts       # Platform-agnostic interface
      message-buffer.ts         # Circular buffer for incoming messages
      discord/client.ts         # Discord.js implementation
      telegram/client.ts        # Telegraf implementation
    audio/
      transcriber.ts            # Whisper ASR singleton (whisper-small)
      decoder.ts                # Audio decoders: OGG Opus, MP3, WAV
      voice-message-handler.ts  # Download -> decode -> transcribe pipeline
    tools/                      # 7 MCP tool registrations
  skills/
    connect/SKILL.md            # /persephone:connect
    listen/SKILL.md             # /persephone:listen
  tests/                        # Vitest test suites (10 files, 86 tests)
  SECURITY.md                   # Security policy and vulnerability disclosure
```

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and security policy.

## License

Apache 2.0 -- See [LICENSE](LICENSE) for details.
