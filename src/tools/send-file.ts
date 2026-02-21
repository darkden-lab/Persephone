import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { existsSync, lstatSync } from 'node:fs';
import { isAbsolute, normalize } from 'node:path';
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
      // Require absolute path from the caller (no resolution of relative paths)
      if (!isAbsolute(file_path)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'File path must be absolute' }) }],
          isError: true,
        };
      }

      // Normalize but reject path traversal sequences
      const normalizedPath = normalize(file_path);
      if (normalizedPath !== file_path && normalizedPath.includes('..')) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Path traversal is not allowed' }) }],
          isError: true,
        };
      }

      if (!existsSync(normalizedPath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'File not found' }) }],
          isError: true,
        };
      }

      // Use lstatSync to detect symlinks (do not follow them)
      const lstats = lstatSync(normalizedPath);
      if (lstats.isSymbolicLink()) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Symlinks are not allowed' }) }],
          isError: true,
        };
      }

      if (!lstats.isFile()) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Path is not a regular file' }) }],
          isError: true,
        };
      }

      if (lstats.size > MAX_FILE_SIZE) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `File exceeds Discord's 25 MB limit (${(lstats.size / 1024 / 1024).toFixed(1)} MB)` }) }],
          isError: true,
        };
      }

      const result = await discord.sendFile(normalizedPath, message);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to send file' }) }],
        isError: true,
      };
    }
  });
}
