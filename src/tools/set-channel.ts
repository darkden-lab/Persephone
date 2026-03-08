import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { MessagingClient } from '../platform/messaging-client.js';

export function registerSetChannel(server: McpServer, client: MessagingClient): void {
  server.registerTool('set_channel', {
    description: 'Set the active Discord channel for this session. Must be called before any other tool.',
    inputSchema: {
      channel_id: z.string().describe('The Discord channel ID to connect to'),
    },
  }, async ({ channel_id }) => {
    try {
      if (!client.validateChannelId(channel_id)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Invalid channel ID format' }) }],
          isError: true,
        };
      }

      const result = await client.setChannel(channel_id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            channel_name: result.channel_name,
            ...(result.context_name && { context_name: result.context_name }),
          }),
        }],
      };
    } catch {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Failed to set channel' }) }],
        isError: true,
      };
    }
  });
}
