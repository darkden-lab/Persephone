import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { existsSync, lstatSync } from 'node:fs';
import { isAbsolute, normalize, resolve } from 'node:path';
import type { MessagingClient } from '../platform/messaging-client.js';

export function registerSendFile(server: McpServer, client: MessagingClient): void {
  server.registerTool('send_file', {
    description: 'Send a file attachment to the active Discord channel.',
    inputSchema: {
      file_path: z.string().describe('Absolute path to the file to send'),
      message: z.string().optional().describe('Optional message to accompany the file'),
    },
  }, async ({ file_path, message }) => {
    try {
      if (!isAbsolute(file_path)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'File path must be absolute' }) }],
          isError: true,
        };
      }

      // Resolve to absolute path and reject if it differs from normalize()
      // (indicates traversal like /safe/../../../etc/passwd)
      const resolvedPath = resolve(file_path);
      const normalizedPath = normalize(file_path);
      if (resolvedPath !== normalizedPath) {
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

      const maxMB = client.maxFileSize / (1024 * 1024);
      if (lstats.size > client.maxFileSize) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `File exceeds ${maxMB} MB limit (${(lstats.size / 1024 / 1024).toFixed(1)} MB)` }) }],
          isError: true,
        };
      }

      const result = await client.sendFile(normalizedPath, message);
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
