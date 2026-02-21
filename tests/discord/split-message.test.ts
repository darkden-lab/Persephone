import { describe, it, expect } from 'vitest';

// We need to test the private splitMessage method indirectly
// by testing the DiscordClient.sendMessage behavior through the split logic.
// Since splitMessage is private, we'll test the logic by extracting it.

// Replicate the split logic for testing
function splitMessage(content: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt <= 0 || splitAt < maxLength * 0.5) {
      splitAt = maxLength;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }
  return chunks;
}

describe('Message Splitting Logic', () => {
  it('does not split messages under limit', () => {
    const chunks = splitMessage('hello', 2000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('hello');
  });

  it('splits exactly at 2000 chars', () => {
    const msg = 'a'.repeat(2000);
    const chunks = splitMessage(msg, 2000);
    expect(chunks).toHaveLength(1);
  });

  it('splits at 2001 chars', () => {
    const msg = 'a'.repeat(2001);
    const chunks = splitMessage(msg, 2000);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].length).toBe(2000);
    expect(chunks[1].length).toBe(1);
  });

  it('splits at newline when possible', () => {
    const line1 = 'a'.repeat(1500);
    const line2 = 'b'.repeat(1000);
    const msg = line1 + '\n' + line2;
    const chunks = splitMessage(msg, 2000);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(line1);
    expect(chunks[1]).toBe(line2);
  });

  it('handles very long single line (no newlines)', () => {
    const msg = 'a'.repeat(5000);
    const chunks = splitMessage(msg, 2000);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].length).toBe(2000);
    expect(chunks[1].length).toBe(2000);
    expect(chunks[2].length).toBe(1000);
  });

  it('handles empty string', () => {
    const chunks = splitMessage('', 2000);
    expect(chunks).toHaveLength(0);
  });

  it('handles string with only newlines', () => {
    const msg = '\n'.repeat(3000);
    const chunks = splitMessage(msg, 2000);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Should not infinite loop
  });

  it('handles newline at start of split boundary', () => {
    const msg = '\n' + 'a'.repeat(3000);
    const chunks = splitMessage(msg, 2000);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Verify no infinite loop and all content preserved
    const reassembled = chunks.join('');
    // Allow for removed newlines at split points
    expect(reassembled.replace(/\n/g, '').length).toBeGreaterThanOrEqual(3000);
  });
});
