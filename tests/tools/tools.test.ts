import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSetChannel } from '../../src/tools/set-channel.js';
import { registerSendMessage } from '../../src/tools/send-message.js';
import { registerSendNotification } from '../../src/tools/send-notification.js';
import { registerSendFile } from '../../src/tools/send-file.js';
import { registerCheckMessages } from '../../src/tools/check-messages.js';
import { registerAskQuestion } from '../../src/tools/ask-question.js';
import { registerWaitForMessage } from '../../src/tools/wait-for-message.js';

describe('Tool Registration', () => {
  let server: McpServer;
  let mockClient: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    mockClient = {
      platform: 'discord',
      maxMessageLength: 2000,
      maxFileSize: 25 * 1024 * 1024,
      setChannel: vi.fn(),
      validateChannelId: vi.fn(() => true),
      sendMessage: vi.fn(),
      sendNotification: vi.fn(),
      sendFile: vi.fn(),
      askQuestion: vi.fn(),
      waitForMessage: vi.fn(),
      getActiveChannelName: vi.fn(() => 'test-channel'),
      buffer: {
        getAll: vi.fn(() => []),
        getNewSinceLastRead: vi.fn(() => []),
      },
    };
  });

  it('registers all 7 tools without errors', () => {
    expect(() => {
      registerSetChannel(server, mockClient);
      registerSendMessage(server, mockClient);
      registerSendNotification(server, mockClient);
      registerSendFile(server, mockClient);
      registerCheckMessages(server, mockClient);
      registerAskQuestion(server, mockClient);
      registerWaitForMessage(server, mockClient);
    }).not.toThrow();
  });
});
