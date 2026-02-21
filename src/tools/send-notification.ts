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
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(error) }) }],
        isError: true,
      };
    }
  });
}
