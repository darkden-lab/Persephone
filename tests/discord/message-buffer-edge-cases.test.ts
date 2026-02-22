import { describe, it, expect, beforeEach } from 'vitest';
import { MessageBuffer } from '../../src/discord/message-buffer.js';

describe('MessageBuffer - Edge Cases', () => {
  let buffer: MessageBuffer;

  beforeEach(() => {
    buffer = new MessageBuffer(5);
  });

  it('handles empty buffer getAll', () => {
    expect(buffer.getAll()).toHaveLength(0);
  });

  it('handles empty buffer getNewSinceLastRead', () => {
    expect(buffer.getNewSinceLastRead()).toHaveLength(0);
  });

  it('handles getAll with limit 0', () => {
    buffer.push({ author: 'u', content: 'a', timestamp: 't', attachments: [] });
    const msgs = buffer.getAll(0);
    expect(msgs).toHaveLength(0);
  });

  it('handles getNewSinceLastRead with limit 0', () => {
    buffer.push({ author: 'u', content: 'a', timestamp: 't', attachments: [] });
    const msgs = buffer.getNewSinceLastRead(0);
    expect(msgs).toHaveLength(0);
  });

  it('handles single element buffer', () => {
    buffer.push({ author: 'u', content: 'only', timestamp: 't', attachments: [] });
    expect(buffer.getAll()).toHaveLength(1);
    expect(buffer.getAll()[0].content).toBe('only');
  });

  it('handles buffer exactly at capacity', () => {
    for (let i = 0; i < 5; i++) {
      buffer.push({ author: 'u', content: `msg-${i}`, timestamp: 't', attachments: [] });
    }
    expect(buffer.getAll()).toHaveLength(5);
    expect(buffer.getAll()[0].content).toBe('msg-0');
    expect(buffer.getAll()[4].content).toBe('msg-4');
  });

  it('handles massive overflow', () => {
    for (let i = 0; i < 1000; i++) {
      buffer.push({ author: 'u', content: `msg-${i}`, timestamp: 't', attachments: [] });
    }
    const msgs = buffer.getAll();
    expect(msgs).toHaveLength(5);
    expect(msgs[0].content).toBe('msg-995');
    expect(msgs[4].content).toBe('msg-999');
  });

  it('handles messages with empty strings', () => {
    buffer.push({ author: '', content: '', timestamp: '', attachments: [] });
    const msgs = buffer.getAll();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('');
  });

  it('handles messages with special characters and emojis', () => {
    buffer.push({ author: 'u', content: '!@#$%^&*()_+{}|:"<>?', timestamp: 't', attachments: [] });
    buffer.push({ author: 'u', content: 'Hello World', timestamp: 't', attachments: [] });
    const msgs = buffer.getAll();
    expect(msgs[0].content).toBe('!@#$%^&*()_+{}|:"<>?');
  });

  it('handles messages with very long content', () => {
    const longContent = 'a'.repeat(10000);
    buffer.push({ author: 'u', content: longContent, timestamp: 't', attachments: [] });
    expect(buffer.getAll()[0].content.length).toBe(10000);
  });

  it('handles limit greater than buffer size', () => {
    buffer.push({ author: 'u', content: 'one', timestamp: 't', attachments: [] });
    const msgs = buffer.getAll(100);
    expect(msgs).toHaveLength(1);
  });

  it('handles rapid push/read interleaving', () => {
    buffer.push({ author: 'u', content: 'a', timestamp: 't', attachments: [] });
    expect(buffer.getNewSinceLastRead()).toHaveLength(1);

    buffer.push({ author: 'u', content: 'b', timestamp: 't', attachments: [] });
    buffer.push({ author: 'u', content: 'c', timestamp: 't', attachments: [] });
    expect(buffer.getNewSinceLastRead()).toHaveLength(2);

    expect(buffer.getNewSinceLastRead()).toHaveLength(0);

    buffer.push({ author: 'u', content: 'd', timestamp: 't', attachments: [] });
    expect(buffer.getNewSinceLastRead()).toHaveLength(1);
  });

  it('handles clear followed by push', () => {
    buffer.push({ author: 'u', content: 'before', timestamp: 't', attachments: [] });
    buffer.clear();
    buffer.push({ author: 'u', content: 'after', timestamp: 't', attachments: [] });
    expect(buffer.getAll()).toHaveLength(1);
    expect(buffer.getAll()[0].content).toBe('after');
  });

  it('handles getNewSinceLastRead after overflow drops unread messages', () => {
    // Push 3 messages, don't read
    for (let i = 0; i < 3; i++) {
      buffer.push({ author: 'u', content: `msg-${i}`, timestamp: 't', attachments: [] });
    }
    // Push 5 more, causing overflow (capacity 5)
    for (let i = 3; i < 8; i++) {
      buffer.push({ author: 'u', content: `msg-${i}`, timestamp: 't', attachments: [] });
    }
    // Some unread messages were lost to overflow
    const msgs = buffer.getNewSinceLastRead();
    // Should return whatever is available, not crash
    expect(msgs.length).toBeGreaterThanOrEqual(0);
    expect(msgs.length).toBeLessThanOrEqual(5);
  });

  it('handles multiple attachments', () => {
    buffer.push({
      author: 'u',
      content: 'files',
      timestamp: 't',
      attachments: ['url1', 'url2', 'url3'],
    });
    expect(buffer.getAll()[0].attachments).toHaveLength(3);
  });

  it('stores and retrieves voice message fields', () => {
    buffer.push({
      author: 'u',
      content: '',
      timestamp: 't',
      attachments: ['voice.ogg'],
      transcription: '[transcribing...]',
      voiceDurationMs: 5000,
    });
    const msg = buffer.getAll()[0];
    expect(msg.transcription).toBe('[transcribing...]');
    expect(msg.voiceDurationMs).toBe(5000);
  });

  it('allows in-place mutation of transcription field', () => {
    const msg = {
      author: 'u',
      content: '',
      timestamp: 't',
      attachments: [],
      transcription: '[transcribing...]',
    };
    buffer.push(msg);

    // Mutate the original reference (simulates background transcription update)
    msg.transcription = 'hello world';

    // The buffer should reflect the mutation since it stores references
    const retrieved = buffer.getAll()[0];
    expect(retrieved.transcription).toBe('hello world');
  });

  it('handles messages without optional voice fields', () => {
    buffer.push({
      author: 'u',
      content: 'normal message',
      timestamp: 't',
      attachments: [],
    });
    const msg = buffer.getAll()[0];
    expect(msg.transcription).toBeUndefined();
    expect(msg.voiceDurationMs).toBeUndefined();
  });
});
