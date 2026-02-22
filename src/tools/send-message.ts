import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { MessagingClient } from '../platform/messaging-client.js';

export function registerSendMessage(server: McpServer, client: MessagingClient): void {
  server.registerTool('send_message', {
    description: 'Send a text message to the active Discord channel.',
    inputSchema: {
      content: z.string().max(50_000).describe('The message content to send'),
      format: z.enum(['text', 'codeblock', 'markdown']).optional()
        .describe('Message format. "codeblock" wraps in triple backticks, "markdown" sends as-is.'),
    },
  }, async ({ content, format }) => {
    try {
      let formatted = content;
      if (format === 'codeblock') {
        const escaped = content.replace(/```/g, '\\`\\`\\`');
        formatted = '```\n' + escaped + '\n```';
      }
      const result = await client.sendMessage(formatted);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to send message' }) }],
        isError: true,
      };
    }
  });
}
