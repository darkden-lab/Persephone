import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSetChannel } from '../../src/tools/set-channel.js';
import { registerSendMessage } from '../../src/tools/send-message.js';
import { registerSendNotification } from '../../src/tools/send-notification.js';
import { registerSendFile } from '../../src/tools/send-file.js';
import { registerCheckMessages } from '../../src/tools/check-messages.js';

describe('Tool Registration', () => {
  let server: McpServer;
  let mockDiscord: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    mockDiscord = {
      setChannel: vi.fn(),
      sendMessage: vi.fn(),
      sendEmbed: vi.fn(),
      sendFile: vi.fn(),
      getActiveChannel: vi.fn(() => ({ name: 'test-channel' })),
      buffer: {
        getAll: vi.fn(() => []),
        getNewSinceLastRead: vi.fn(() => []),
      },
    };
  });

  it('registers all 5 tools without errors', () => {
    expect(() => {
      registerSetChannel(server, mockDiscord);
      registerSendMessage(server, mockDiscord);
      registerSendNotification(server, mockDiscord);
      registerSendFile(server, mockDiscord);
      registerCheckMessages(server, mockDiscord);
    }).not.toThrow();
  });
});
