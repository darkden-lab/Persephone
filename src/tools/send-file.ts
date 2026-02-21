import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { existsSync, statSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import type { DiscordClient } from '../discord/client.js';

// Discord's file size limit (25 MB for standard bots)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export function registerSendFile(server: McpServer, discord: DiscordClient): void {
  server.registerTool('send_file', {
    description: 'Send a file attachment to the active Discord channel.',
    inputSchema: {
      file_path: z.string().describe('Absolute path to the file to send'),
      message: z.string().optional().describe('Optional message to accompany the file'),
    },
  }, async ({ file_path, message }) => {
    try {
      // Resolve to absolute path and normalize
      const resolvedPath = resolve(file_path);

      if (!isAbsolute(resolvedPath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'File path must be absolute' }) }],
          isError: true,
        };
      }

      if (!existsSync(resolvedPath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `File not found: ${resolvedPath}` }) }],
          isError: true,
        };
      }

      // Verify it's a regular file, not a directory or symlink to sensitive location
      const stats = statSync(resolvedPath);
      if (!stats.isFile()) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Path is not a regular file' }) }],
          isError: true,
        };
      }

      // Check file size before attempting upload
      if (stats.size > MAX_FILE_SIZE) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `File exceeds Discord's 25 MB limit (${(stats.size / 1024 / 1024).toFixed(1)} MB)` }) }],
          isError: true,
        };
      }

      const result = await discord.sendFile(resolvedPath, message);
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
