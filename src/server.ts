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
