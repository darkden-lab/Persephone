import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { DiscordClient } from '../discord/client.js';
import { clearPending } from '../discord/pending-signal.js';

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

      if (messages.length > 0) {
        clearPending();
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            channel_name: channel.name,
            message_count: messages.length,
            messages,
          }),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(error) }) }],
        isError: true,
      };
    }
  });
}
