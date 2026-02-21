import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { DiscordClient } from '../discord/client.js';

export function registerWaitForMessage(server: McpServer, discord: DiscordClient): void {
  server.registerTool('wait_for_message', {
    description: 'Wait for a new message from a user in the active Discord channel. Blocks until a message is received or timeout is reached.',
    inputSchema: {
      timeout: z.number().optional()
        .describe('Timeout in seconds to wait for a message (default: 120)'),
    },
  }, async ({ timeout }) => {
    try {
      const message = await discord.waitForMessage(timeout);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            received: true,
            author: message.author,
            content: message.content,
            timestamp: message.timestamp,
            attachments: message.attachments,
          }),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ received: false, error: String(error) }) }],
        isError: true,
      };
    }
  });
}
