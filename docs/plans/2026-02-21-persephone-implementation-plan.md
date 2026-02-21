# Persephone Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full Claude Code plugin that enables bidirectional communication between Claude Code and Discord via MCP tools.

**Architecture:** A Claude Code plugin (`.claude-plugin/`) containing an MCP stdio server built with `@modelcontextprotocol/sdk` and `discord.js`. The server starts a Discord bot on launch, exposes 5 tools for channel management and messaging, and buffers incoming Discord messages for polling.

**Tech Stack:** TypeScript, Node.js, discord.js, @modelcontextprotocol/sdk (v2 `registerTool` API), zod/v4

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Step 1: Initialize package.json**

```json
{
  "name": "persephone",
  "version": "0.1.0",
  "description": "Claude Code plugin for Discord integration",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["claude-code", "mcp", "discord", "plugin"],
  "license": "MIT"
}
```

**Step 2: Install dependencies**

Run: `npm install discord.js @modelcontextprotocol/sdk zod`
Run: `npm install -D typescript vitest @types/node`

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.env
*.tsbuildinfo
```

**Step 5: Verify build setup**

Run: `npx tsc --noEmit`
Expected: No errors (no source files yet, clean exit)

**Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore package-lock.json
git commit -m "chore: scaffold project with TypeScript, discord.js, MCP SDK"
```

---

### Task 2: Plugin Manifest and MCP Config

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.mcp.json`

**Step 1: Create plugin manifest**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "persephone",
  "description": "Connect Claude Code with Discord for bidirectional messaging, notifications, and file sharing",
  "version": "0.1.0",
  "author": {
    "name": "darkden-lab"
  },
  "keywords": ["discord", "messaging", "notifications"]
}
```

**Step 2: Create MCP server config**

Create `.mcp.json`:

```json
{
  "mcpServers": {
    "persephone": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/server.js"],
      "env": {
        "DISCORD_BOT_TOKEN": "${DISCORD_BOT_TOKEN}"
      }
    }
  }
}
```

**Step 3: Commit**

```bash
git add .claude-plugin/plugin.json .mcp.json
git commit -m "chore: add Claude Code plugin manifest and MCP config"
```

---

### Task 3: Message Buffer

**Files:**
- Create: `src/discord/message-buffer.ts`
- Create: `tests/discord/message-buffer.test.ts`

**Step 1: Write the failing tests**

Create `tests/discord/message-buffer.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MessageBuffer, type BufferedMessage } from '../../src/discord/message-buffer.js';

describe('MessageBuffer', () => {
  let buffer: MessageBuffer;

  beforeEach(() => {
    buffer = new MessageBuffer(5); // small capacity for testing
  });

  it('stores and retrieves messages', () => {
    buffer.push({ author: 'user1', content: 'hello', timestamp: '2026-01-01T00:00:00Z', attachments: [] });
    const msgs = buffer.getAll();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('hello');
  });

  it('respects capacity (circular behavior)', () => {
    for (let i = 0; i < 7; i++) {
      buffer.push({ author: 'user1', content: `msg-${i}`, timestamp: `2026-01-01T00:00:0${i}Z`, attachments: [] });
    }
    const msgs = buffer.getAll();
    expect(msgs).toHaveLength(5);
    expect(msgs[0].content).toBe('msg-2'); // oldest kept
    expect(msgs[4].content).toBe('msg-6'); // newest
  });

  it('getNewSinceLastRead returns only unread messages', () => {
    buffer.push({ author: 'user1', content: 'first', timestamp: '2026-01-01T00:00:00Z', attachments: [] });
    buffer.push({ author: 'user1', content: 'second', timestamp: '2026-01-01T00:00:01Z', attachments: [] });

    const firstRead = buffer.getNewSinceLastRead();
    expect(firstRead).toHaveLength(2);

    buffer.push({ author: 'user1', content: 'third', timestamp: '2026-01-01T00:00:02Z', attachments: [] });

    const secondRead = buffer.getNewSinceLastRead();
    expect(secondRead).toHaveLength(1);
    expect(secondRead[0].content).toBe('third');
  });

  it('getNewSinceLastRead returns empty when no new messages', () => {
    buffer.push({ author: 'user1', content: 'hello', timestamp: '2026-01-01T00:00:00Z', attachments: [] });
    buffer.getNewSinceLastRead();
    expect(buffer.getNewSinceLastRead()).toHaveLength(0);
  });

  it('clear removes all messages and resets read position', () => {
    buffer.push({ author: 'user1', content: 'hello', timestamp: '2026-01-01T00:00:00Z', attachments: [] });
    buffer.clear();
    expect(buffer.getAll()).toHaveLength(0);
    expect(buffer.getNewSinceLastRead()).toHaveLength(0);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      buffer.push({ author: 'user1', content: `msg-${i}`, timestamp: `2026-01-01T00:00:0${i}Z`, attachments: [] });
    }
    const msgs = buffer.getAll(3);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].content).toBe('msg-2'); // most recent 3
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/discord/message-buffer.test.ts`
Expected: FAIL — module not found

**Step 3: Implement MessageBuffer**

Create `src/discord/message-buffer.ts`:

```typescript
export interface BufferedMessage {
  author: string;
  content: string;
  timestamp: string;
  attachments: string[];
}

export class MessageBuffer {
  private messages: BufferedMessage[] = [];
  private lastReadIndex = 0;

  constructor(private capacity = 100) {}

  push(message: BufferedMessage): void {
    this.messages.push(message);
    if (this.messages.length > this.capacity) {
      const overflow = this.messages.length - this.capacity;
      this.messages.splice(0, overflow);
      this.lastReadIndex = Math.max(0, this.lastReadIndex - overflow);
    }
  }

  getAll(limit?: number): BufferedMessage[] {
    if (limit && limit < this.messages.length) {
      return this.messages.slice(-limit);
    }
    return [...this.messages];
  }

  getNewSinceLastRead(limit?: number): BufferedMessage[] {
    const newMessages = this.messages.slice(this.lastReadIndex);
    this.lastReadIndex = this.messages.length;
    if (limit && limit < newMessages.length) {
      return newMessages.slice(-limit);
    }
    return newMessages;
  }

  clear(): void {
    this.messages = [];
    this.lastReadIndex = 0;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/discord/message-buffer.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/discord/message-buffer.ts tests/discord/message-buffer.test.ts
git commit -m "feat: add circular message buffer with read tracking"
```

---

### Task 4: Discord Client Wrapper

**Files:**
- Create: `src/discord/client.ts`

**Step 1: Implement DiscordClient**

Create `src/discord/client.ts`:

```typescript
import {
  Client,
  Events,
  GatewayIntentBits,
  TextChannel,
  EmbedBuilder,
  AttachmentBuilder,
  type Message,
} from 'discord.js';
import { MessageBuffer, type BufferedMessage } from './message-buffer.js';

export class DiscordClient {
  private client: Client;
  private activeChannel: TextChannel | null = null;
  readonly buffer: MessageBuffer;
  private ready = false;

  constructor(token: string) {
    this.buffer = new MessageBuffer(100);
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.client.on(Events.MessageCreate, (message: Message) => {
      if (message.author.bot) return;
      if (!this.activeChannel || message.channel.id !== this.activeChannel.id) return;

      this.buffer.push({
        author: message.author.displayName ?? message.author.username,
        content: message.content,
        timestamp: message.createdAt.toISOString(),
        attachments: message.attachments.map((a) => a.url),
      });
    });

    this.client.once(Events.ClientReady, () => {
      this.ready = true;
    });

    this.client.login(token);
  }

  isReady(): boolean {
    return this.ready;
  }

  async setChannel(channelId: string): Promise<{ channel_name: string; guild_name: string }> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Channel ${channelId} not found or is not a text channel`);
    }
    this.activeChannel = channel;
    this.buffer.clear();
    return {
      channel_name: channel.name,
      guild_name: channel.guild.name,
    };
  }

  getActiveChannel(): TextChannel {
    if (!this.activeChannel) {
      throw new Error('No active channel. Call set_channel first.');
    }
    return this.activeChannel;
  }

  async sendMessage(content: string): Promise<{ message_id: string; timestamp: string }> {
    const channel = this.getActiveChannel();
    // Auto-split messages exceeding 2000 chars
    if (content.length <= 2000) {
      const msg = await channel.send(content);
      return { message_id: msg.id, timestamp: msg.createdAt.toISOString() };
    }
    const chunks = this.splitMessage(content, 2000);
    let lastMsg: Message | null = null;
    for (const chunk of chunks) {
      lastMsg = await channel.send(chunk);
    }
    return { message_id: lastMsg!.id, timestamp: lastMsg!.createdAt.toISOString() };
  }

  async sendEmbed(embed: EmbedBuilder): Promise<{ message_id: string }> {
    const channel = this.getActiveChannel();
    const msg = await channel.send({ embeds: [embed] });
    return { message_id: msg.id };
  }

  async sendFile(
    filePath: string,
    message?: string,
  ): Promise<{ message_id: string; file_url: string }> {
    const channel = this.getActiveChannel();
    const attachment = new AttachmentBuilder(filePath);
    const msg = await channel.send({
      content: message ?? '',
      files: [attachment],
    });
    const fileUrl = msg.attachments.first()?.url ?? '';
    return { message_id: msg.id, file_url: fileUrl };
  }

  private splitMessage(content: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = content;
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }
      // Try to split at a newline
      let splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt === -1 || splitAt < maxLength * 0.5) {
        splitAt = maxLength;
      }
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
    }
    return chunks;
  }
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/discord/client.ts
git commit -m "feat: add Discord client wrapper with channel management and messaging"
```

---

### Task 5: MCP Tools — set_channel

**Files:**
- Create: `src/tools/set-channel.ts`

**Step 1: Implement set_channel tool**

Create `src/tools/set-channel.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { DiscordClient } from '../discord/client.js';

export function registerSetChannel(server: McpServer, discord: DiscordClient): void {
  server.registerTool('set_channel', {
    description: 'Set the active Discord channel for this session. Must be called before any other tool.',
    inputSchema: {
      channel_id: z.string().describe('The Discord channel ID to connect to'),
    },
  }, async ({ channel_id }) => {
    try {
      const result = await discord.setChannel(channel_id);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            channel_name: result.channel_name,
            guild_name: result.guild_name,
          }),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(error) }) }],
        isError: true,
      };
    }
  });
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/set-channel.ts
git commit -m "feat: add set_channel MCP tool"
```

---

### Task 6: MCP Tools — send_message

**Files:**
- Create: `src/tools/send-message.ts`

**Step 1: Implement send_message tool**

Create `src/tools/send-message.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { DiscordClient } from '../discord/client.js';

export function registerSendMessage(server: McpServer, discord: DiscordClient): void {
  server.registerTool('send_message', {
    description: 'Send a text message to the active Discord channel.',
    inputSchema: {
      content: z.string().describe('The message content to send'),
      format: z.enum(['text', 'codeblock', 'markdown']).optional()
        .describe('Message format. "codeblock" wraps in triple backticks, "markdown" sends as-is.'),
    },
  }, async ({ content, format }) => {
    try {
      let formatted = content;
      if (format === 'codeblock') {
        formatted = '```\n' + content + '\n```';
      }
      // "text" and "markdown" send as-is (Discord renders markdown natively)
      const result = await discord.sendMessage(formatted);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: String(error) }) }],
        isError: true,
      };
    }
  });
}
```

**Step 2: Commit**

```bash
git add src/tools/send-message.ts
git commit -m "feat: add send_message MCP tool with format support"
```

---

### Task 7: MCP Tools — send_notification

**Files:**
- Create: `src/tools/send-notification.ts`

**Step 1: Implement send_notification tool**

Create `src/tools/send-notification.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { EmbedBuilder } from 'discord.js';
import type { DiscordClient } from '../discord/client.js';

const COLORS = {
  success: 0x22c55e,
  error: 0xef4444,
  warning: 0xeab308,
  info: 0x3b82f6,
} as const;

export function registerSendNotification(server: McpServer, discord: DiscordClient): void {
  server.registerTool('send_notification', {
    description: 'Send a rich embed notification to the active Discord channel.',
    inputSchema: {
      title: z.string().describe('Notification title'),
      description: z.string().describe('Notification body text'),
      type: z.enum(['success', 'error', 'warning', 'info']).describe('Notification type (determines color)'),
      fields: z.array(z.object({
        name: z.string(),
        value: z.string(),
      })).optional().describe('Optional fields to include in the embed'),
    },
  }, async ({ title, description, type, fields }) => {
    try {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(COLORS[type])
        .setTimestamp();

      if (fields) {
        for (const field of fields) {
          embed.addFields({ name: field.name, value: field.value, inline: true });
        }
      }

      const result = await discord.sendEmbed(embed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: String(error) }) }],
        isError: true,
      };
    }
  });
}
```

**Step 2: Commit**

```bash
git add src/tools/send-notification.ts
git commit -m "feat: add send_notification MCP tool with rich embeds"
```

---

### Task 8: MCP Tools — send_file

**Files:**
- Create: `src/tools/send-file.ts`

**Step 1: Implement send_file tool**

Create `src/tools/send-file.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { existsSync } from 'node:fs';
import type { DiscordClient } from '../discord/client.js';

export function registerSendFile(server: McpServer, discord: DiscordClient): void {
  server.registerTool('send_file', {
    description: 'Send a file attachment to the active Discord channel.',
    inputSchema: {
      file_path: z.string().describe('Absolute path to the file to send'),
      message: z.string().optional().describe('Optional message to accompany the file'),
    },
  }, async ({ file_path, message }) => {
    try {
      if (!existsSync(file_path)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `File not found: ${file_path}` }) }],
          isError: true,
        };
      }
      const result = await discord.sendFile(file_path, message);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: String(error) }) }],
        isError: true,
      };
    }
  });
}
```

**Step 2: Commit**

```bash
git add src/tools/send-file.ts
git commit -m "feat: add send_file MCP tool"
```

---

### Task 9: MCP Tools — check_messages

**Files:**
- Create: `src/tools/check-messages.ts`

**Step 1: Implement check_messages tool**

Create `src/tools/check-messages.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { DiscordClient } from '../discord/client.js';

export function registerCheckMessages(server: McpServer, discord: DiscordClient): void {
  server.registerTool('check_messages', {
    description: 'Check for new messages in the active Discord channel. Returns messages from the buffer.',
    inputSchema: {
      since_last_check: z.boolean().optional().default(true)
        .describe('If true, returns only messages since the last check. Defaults to true.'),
      limit: z.number().optional()
        .describe('Maximum number of messages to return'),
    },
  }, async ({ since_last_check, limit }) => {
    try {
      const channel = discord.getActiveChannel();
      const messages = since_last_check
        ? discord.buffer.getNewSinceLastRead(limit)
        : discord.buffer.getAll(limit);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            channel_name: channel.name,
            message_count: messages.length,
            messages,
          }),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: String(error) }) }],
        isError: true,
      };
    }
  });
}
```

**Step 2: Commit**

```bash
git add src/tools/check-messages.ts
git commit -m "feat: add check_messages MCP tool with polling support"
```

---

### Task 10: MCP Server Entry Point

**Files:**
- Create: `src/server.ts`

**Step 1: Implement server.ts**

Create `src/server.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DiscordClient } from './discord/client.js';
import { registerSetChannel } from './tools/set-channel.js';
import { registerSendMessage } from './tools/send-message.js';
import { registerSendNotification } from './tools/send-notification.js';
import { registerSendFile } from './tools/send-file.js';
import { registerCheckMessages } from './tools/check-messages.js';

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('DISCORD_BOT_TOKEN environment variable is required');
  process.exit(1);
}

const discord = new DiscordClient(token);

const server = new McpServer({
  name: 'persephone',
  version: '0.1.0',
});

registerSetChannel(server, discord);
registerSendMessage(server, discord);
registerSendNotification(server, discord);
registerSendFile(server, discord);
registerCheckMessages(server, discord);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 2: Build the project**

Run: `npm run build`
Expected: Compiles to `dist/` with no errors

**Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add MCP server entry point wiring all tools"
```

---

### Task 11: Connect Skill

**Files:**
- Create: `skills/connect/SKILL.md`

**Step 1: Create the skill**

Create `skills/connect/SKILL.md`:

```markdown
---
description: Connect to a Discord channel for messaging, notifications, and file sharing
---

The user wants to connect Claude Code to a Discord channel. Extract the channel ID from their message and establish the connection.

## Instructions

1. Extract the channel ID from the user's message. It should be a numeric string (e.g., "1234567890123456789"). If they mention a channel name instead, ask them for the channel ID.

2. Call the `set_channel` tool with the channel ID:
   - If successful, confirm the connection showing the channel name and server name
   - If it fails, show the error and ask the user to verify the channel ID and bot permissions

3. After connecting, send a test notification to the channel using `send_notification`:
   - title: "Persephone Connected"
   - description: "Claude Code is now connected to this channel."
   - type: "info"

4. Inform the user that the connection is active and they can now:
   - Send messages from Claude to Discord
   - Receive messages sent in the Discord channel
   - Send notifications and files
```

**Step 2: Commit**

```bash
git add skills/connect/SKILL.md
git commit -m "feat: add /persephone:connect skill"
```

---

### Task 12: CLAUDE.md and README

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`

**Step 1: Create CLAUDE.md**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

- `npm run build` — Compile TypeScript to `dist/`
- `npm run dev` — Watch mode compilation
- `npm test` — Run tests with vitest
- `npm run test:watch` — Watch mode tests
- `npx vitest run tests/path/file.test.ts` — Run a single test file

## Architecture

Persephone is a Claude Code plugin (MCP server) connecting Claude Code to Discord.

**MCP Server** (`src/server.ts`): stdio transport entry point. Starts the Discord bot and registers all tools.

**Discord Client** (`src/discord/client.ts`): Wraps discord.js. Manages the active channel, sends messages/embeds/files, and buffers incoming messages.

**Message Buffer** (`src/discord/message-buffer.ts`): Circular buffer (capacity 100) storing incoming Discord messages. Tracks a "last read" position for polling via `check_messages`.

**Tools** (`src/tools/`): Each file exports a `register*` function that registers one MCP tool on the server. All tools require `set_channel` to be called first (except `set_channel` itself).

**Skill** (`skills/connect/SKILL.md`): Guides Claude through the channel connection flow.

## Configuration

- **Global**: `DISCORD_BOT_TOKEN` env variable (set in `~/.claude.json` or system env)
- **Session**: Channel ID set via the `set_channel` tool at runtime

## Key Constraints

- Discord message limit: 2000 chars (auto-split in client.ts)
- Message buffer: circular, 100 messages max, clears on channel change
- MCP transport: stdio only (runs as Claude Code subprocess)
- All tools return JSON strings in MCP `text` content blocks
```

**Step 2: Create README.md**

```markdown
# Persephone

A Claude Code plugin that connects Claude Code with Discord for bidirectional communication.

## Features

- **send_message** — Send text to Discord (plain, codeblock, or markdown)
- **send_notification** — Rich embed notifications (success/error/warning/info)
- **send_file** — Send file attachments
- **check_messages** — Poll for new messages from Discord users
- **set_channel** — Configure the active channel per session

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to Bot tab → create bot → copy the token
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

## Development

```bash
npm install
npm run build
npm test
```
```

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add CLAUDE.md and README.md"
```

---

### Task 13: Integration Test

**Files:**
- Create: `tests/tools/tools.test.ts`

**Step 1: Write integration tests for tool registration**

Create `tests/tools/tools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSetChannel } from '../../src/tools/set-channel.js';
import { registerSendMessage } from '../../src/tools/send-message.js';
import { registerSendNotification } from '../../src/tools/send-notification.js';
import { registerSendFile } from '../../src/tools/send-file.js';
import { registerCheckMessages } from '../../src/tools/check-messages.js';

describe('Tool Registration', () => {
  let server: McpServer;
  let mockDiscord: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    mockDiscord = {
      setChannel: vi.fn(),
      sendMessage: vi.fn(),
      sendEmbed: vi.fn(),
      sendFile: vi.fn(),
      getActiveChannel: vi.fn(() => ({ name: 'test-channel' })),
      buffer: {
        getAll: vi.fn(() => []),
        getNewSinceLastRead: vi.fn(() => []),
      },
    };
  });

  it('registers all 5 tools without errors', () => {
    expect(() => {
      registerSetChannel(server, mockDiscord);
      registerSendMessage(server, mockDiscord);
      registerSendNotification(server, mockDiscord);
      registerSendFile(server, mockDiscord);
      registerCheckMessages(server, mockDiscord);
    }).not.toThrow();
  });
});
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests PASS

**Step 3: Final build verification**

Run: `npm run build`
Expected: Clean build, `dist/` directory populated

**Step 4: Commit**

```bash
git add tests/tools/tools.test.ts
git commit -m "test: add tool registration integration tests"
```

---

## Summary

| Task | What it builds | Depends on |
|------|---------------|------------|
| 1 | Project scaffolding | — |
| 2 | Plugin manifest + MCP config | — |
| 3 | Message buffer (TDD) | 1 |
| 4 | Discord client wrapper | 3 |
| 5 | set_channel tool | 4 |
| 6 | send_message tool | 4 |
| 7 | send_notification tool | 4 |
| 8 | send_file tool | 4 |
| 9 | check_messages tool | 4 |
| 10 | MCP server entry point | 5-9 |
| 11 | Connect skill | — |
| 12 | CLAUDE.md + README | — |
| 13 | Integration tests | 5-9 |

Tasks 5-9 can be implemented in parallel. Tasks 11-12 can be done in parallel with 10.
