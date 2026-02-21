import { describe, it, expect, beforeEach } from 'vitest';
import { MessageBuffer, type BufferedMessage } from '../../src/discord/message-buffer.js';

describe('MessageBuffer', () => {
  let buffer: MessageBuffer;

  beforeEach(() => {
    buffer = new MessageBuffer(5); // small capacity for testing
  });

  it('stores and retrieves messages', () => {
    buffer.push({ author: 'user1', content: 'hello', timestamp: '2026-01-01T00:00:00Z', attachments: [] });
    const msgs = buffer.getAll();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('hello');
  });

  it('respects capacity (circular behavior)', () => {
    for (let i = 0; i < 7; i++) {
      buffer.push({ author: 'user1', content: `msg-${i}`, timestamp: `2026-01-01T00:00:0${i}Z`, attachments: [] });
    }
    const msgs = buffer.getAll();
    expect(msgs).toHaveLength(5);
    expect(msgs[0].content).toBe('msg-2'); // oldest kept
    expect(msgs[4].content).toBe('msg-6'); // newest
  });

  it('getNewSinceLastRead returns only unread messages', () => {
    buffer.push({ author: 'user1', content: 'first', timestamp: '2026-01-01T00:00:00Z', attachments: [] });
    buffer.push({ author: 'user1', content: 'second', timestamp: '2026-01-01T00:00:01Z', attachments: [] });

    const firstRead = buffer.getNewSinceLastRead();
    expect(firstRead).toHaveLength(2);

    buffer.push({ author: 'user1', content: 'third', timestamp: '2026-01-01T00:00:02Z', attachments: [] });

    const secondRead = buffer.getNewSinceLastRead();
    expect(secondRead).toHaveLength(1);
    expect(secondRead[0].content).toBe('third');
  });

  it('getNewSinceLastRead returns empty when no new messages', () => {
    buffer.push({ author: 'user1', content: 'hello', timestamp: '2026-01-01T00:00:00Z', attachments: [] });
    buffer.getNewSinceLastRead();
    expect(buffer.getNewSinceLastRead()).toHaveLength(0);
  });

  it('clear removes all messages and resets read position', () => {
    buffer.push({ author: 'user1', content: 'hello', timestamp: '2026-01-01T00:00:00Z', attachments: [] });
    buffer.clear();
    expect(buffer.getAll()).toHaveLength(0);
    expect(buffer.getNewSinceLastRead()).toHaveLength(0);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      buffer.push({ author: 'user1', content: `msg-${i}`, timestamp: `2026-01-01T00:00:0${i}Z`, attachments: [] });
    }
    const msgs = buffer.getAll(3);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].content).toBe('msg-2'); // most recent 3
  });
});
