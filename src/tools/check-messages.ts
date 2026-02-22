import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { MessagingClient } from '../platform/messaging-client.js';

export function registerCheckMessages(server: McpServer, client: MessagingClient): void {
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
      const channelName = client.getActiveChannelName();
      const messages = since_last_check
        ? client.buffer.getNewSinceLastRead(limit)
        : client.buffer.getAll(limit);

      // Enrich voice/audio messages with transcription in content
      const enriched = messages.map((msg) => {
        if (!msg.transcription) return msg;
        const durationSec = msg.voiceDurationMs != null
          ? (msg.voiceDurationMs / 1000).toFixed(1)
          : '?';
        return {
          ...msg,
          content: msg.voiceDurationMs != null
            ? `[Voice message (${durationSec}s)]: ${msg.transcription}`
            : `[Audio transcription]: ${msg.transcription}`,
        };
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            channel_name: channelName,
            message_count: enriched.length,
            messages: enriched,
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
