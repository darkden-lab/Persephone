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
