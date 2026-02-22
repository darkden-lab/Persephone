import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDecode, mockFree } = vi.hoisted(() => ({
  mockDecode: vi.fn(),
  mockFree: vi.fn(),
}));

vi.mock('ogg-opus-decoder', () => ({
  OggOpusDecoder: class MockOggOpusDecoder {
    ready = Promise.resolve();
    decode = mockDecode;
    free = mockFree;
  },
}));

import { decodeOggOpusToPcm } from '../../src/audio/decoder.js';

describe('decoder', () => {
  beforeEach(() => {
    mockDecode.mockReset();
    mockFree.mockReset();
  });

  it('decodes mono audio and returns Float32Array', async () => {
    const monoData = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    mockDecode.mockResolvedValue({
      channelData: [monoData],
      sampleRate: 16000,
    });

    const result = await decodeOggOpusToPcm(new Uint8Array(10));
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(4);
  });

  it('mixes stereo to mono', async () => {
    const left = new Float32Array([1.0, 0.0]);
    const right = new Float32Array([0.0, 1.0]);
    mockDecode.mockResolvedValue({
      channelData: [left, right],
      sampleRate: 16000,
    });

    const result = await decodeOggOpusToPcm(new Uint8Array(10));
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(2);
    // Average of [1,0] and [0,1] = [0.5, 0.5]
    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(0.5);
  });

  it('resamples from 48kHz to 16kHz', async () => {
    // 480 samples at 48kHz = 10ms -> should become 160 samples at 16kHz
    const samples48k = new Float32Array(480);
    for (let i = 0; i < 480; i++) samples48k[i] = Math.sin(i * 0.1);
    mockDecode.mockResolvedValue({
      channelData: [samples48k],
      sampleRate: 48000,
    });

    const result = await decodeOggOpusToPcm(new Uint8Array(10));
    expect(result.length).toBe(160);
  });

  it('calls free() even on decode error', async () => {
    mockDecode.mockRejectedValue(new Error('corrupt'));

    await expect(decodeOggOpusToPcm(new Uint8Array(10))).rejects.toThrow('corrupt');
    expect(mockFree).toHaveBeenCalledTimes(1);
  });

  it('calls free() on success', async () => {
    mockDecode.mockResolvedValue({
      channelData: [new Float32Array(10)],
      sampleRate: 16000,
    });

    await decodeOggOpusToPcm(new Uint8Array(10));
    expect(mockFree).toHaveBeenCalledTimes(1);
  });
});
