import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { MessagingClient } from '../platform/messaging-client.js';

export function registerWaitForMessage(server: McpServer, client: MessagingClient): void {
  server.registerTool('wait_for_message', {
    description: 'Wait for a new message from a user in the active Discord channel. Blocks until a message is received or timeout is reached.',
    inputSchema: {
      timeout: z.number().min(1).max(3600).optional()
        .describe('Timeout in seconds to wait for a message (default: 120)'),
    },
  }, async ({ timeout }) => {
    try {
      const message = await client.waitForMessage(timeout);

      // If it's a voice/audio message still transcribing, poll up to 10s
      if (message.transcription === '[transcribing...]') {
        const deadline = Date.now() + 10_000;
        while (message.transcription === '[transcribing...]' && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      // Build enriched content for voice/audio messages
      let content = message.content;
      if (message.transcription) {
        if (message.voiceDurationMs != null) {
          const durationSec = (message.voiceDurationMs / 1000).toFixed(1);
          content = `[Voice message (${durationSec}s)]: ${message.transcription}`;
        } else {
          content = `[Audio transcription]: ${message.transcription}`;
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            received: true,
            author: message.author,
            content,
            timestamp: message.timestamp,
            attachments: message.attachments,
            ...(message.transcription && { transcription: message.transcription }),
            ...(message.voiceDurationMs != null && { voiceDurationMs: message.voiceDurationMs }),
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
