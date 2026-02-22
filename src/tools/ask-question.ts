import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { MessagingClient } from '../platform/messaging-client.js';

export function registerAskQuestion(server: McpServer, client: MessagingClient): void {
  server.registerTool('ask_question', {
    description: 'Send an interactive question with clickable buttons to the active Discord channel. Waits for the user to click a button and returns their selection. Max 5 options.',
    inputSchema: {
      question: z.string().describe('The question to ask'),
      options: z.array(z.string())
        .min(2)
        .max(5)
        .describe('Button labels for the available choices (2-5 options)'),
      timeout: z.number().min(1).max(3600).optional()
        .describe('Timeout in seconds to wait for a response (default: 120)'),
    },
  }, async ({ question, options, timeout }) => {
    try {
      const result = await client.askQuestion(question, options, timeout);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to ask question' }) }],
        isError: true,
      };
    }
  });
}
