import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { DiscordClient } from '../discord/client.js';

export function registerSetChannel(server: McpServer, discord: DiscordClient): void {
  server.registerTool('set_channel', {
    description: 'Set the active Discord channel for this session. Must be called before any other tool.',
    inputSchema: {
      channel_id: z.string().regex(/^\d+$/, 'Channel ID must be a numeric Discord snowflake').describe('The Discord channel ID to connect to'),
    },
  }, async ({ channel_id }) => {
    try {
      const result = await discord.setChannel(channel_id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            channel_name: result.channel_name,
            guild_name: result.guild_name,
          }),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: String(error) }) }],
        isError: true,
      };
    }
  });
}
