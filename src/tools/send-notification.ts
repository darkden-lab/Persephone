import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { MessagingClient } from '../platform/messaging-client.js';

export function registerSendNotification(server: McpServer, client: MessagingClient): void {
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
      const result = await client.sendNotification({ title, description, type, fields });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to send notification' }) }],
        isError: true,
      };
    }
  });
}
