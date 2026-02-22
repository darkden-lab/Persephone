import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { MessagingClient } from './platform/messaging-client.js';
import { registerSetChannel } from './tools/set-channel.js';
import { registerSendMessage } from './tools/send-message.js';
import { registerSendNotification } from './tools/send-notification.js';
import { registerSendFile } from './tools/send-file.js';
import { registerCheckMessages } from './tools/check-messages.js';
import { registerAskQuestion } from './tools/ask-question.js';
import { registerWaitForMessage } from './tools/wait-for-message.js';

const platform = (process.env.PERSEPHONE_PLATFORM ?? 'discord').toLowerCase();

let client: MessagingClient;

if (platform === 'telegram') {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    process.exit(1);
  }
  const { TelegramClient } = await import('./platform/telegram/client.js');
  client = new TelegramClient(token);
} else {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    process.exit(1);
  }
  const { DiscordClient } = await import('./platform/discord/client.js');
  client = new DiscordClient(token);
}

const server = new McpServer({
  name: 'persephone',
  version: '0.3.0',
});

registerSetChannel(server, client);
registerSendMessage(server, client);
registerSendNotification(server, client);
registerSendFile(server, client);
registerCheckMessages(server, client);
registerAskQuestion(server, client);
registerWaitForMessage(server, client);

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch {
  await client.destroy();
  process.exit(1);
}

async function shutdown() {
  await client.destroy();
  await server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
