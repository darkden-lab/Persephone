import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDecode, mockFree } = vi.hoisted(() => ({
  mockDecode: vi.fn(),
  mockFree: vi.fn(),
}));

vi.mock('mpg123-decoder', () => ({
  MPEGDecoder: class MockMPEGDecoder {
    ready = Promise.resolve();
    decode = mockDecode;
    free = mockFree;
  },
}));

// Also mock ogg-opus-decoder to avoid import issues
vi.mock('ogg-opus-decoder', () => ({
  OggOpusDecoder: class MockOggOpusDecoder {
    ready = Promise.resolve();
    decode = vi.fn();
    free = vi.fn();
  },
}));

import { decodeMp3ToPcm } from '../../src/audio/decoder.js';

describe('decodeMp3ToPcm', () => {
  beforeEach(() => {
    mockDecode.mockReset();
    mockFree.mockReset();
  });

  it('decodes mono MP3 and returns Float32Array', async () => {
    const monoData = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    mockDecode.mockResolvedValue({
      channelData: [monoData],
      sampleRate: 16000,
    });

    const result = await decodeMp3ToPcm(new Uint8Array(10));
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

    const result = await decodeMp3ToPcm(new Uint8Array(10));
    expect(result.length).toBe(2);
    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(0.5);
  });

  it('resamples from 44.1kHz to 16kHz', async () => {
    // 441 samples at 44100Hz = 10ms -> should become ~160 samples at 16kHz
    const samples44k = new Float32Array(441);
    for (let i = 0; i < 441; i++) samples44k[i] = Math.sin(i * 0.1);
    mockDecode.mockResolvedValue({
      channelData: [samples44k],
      sampleRate: 44100,
    });

    const result = await decodeMp3ToPcm(new Uint8Array(10));
    expect(result.length).toBe(160);
  });

  it('defaults to 44100 sample rate when not provided', async () => {
    const samples = new Float32Array(441);
    mockDecode.mockResolvedValue({
      channelData: [samples],
      sampleRate: undefined,
    });

    const result = await decodeMp3ToPcm(new Uint8Array(10));
    // 441 * (16000/44100) ≈ 160
    expect(result.length).toBe(160);
  });

  it('calls free() on success', async () => {
    mockDecode.mockResolvedValue({
      channelData: [new Float32Array(10)],
      sampleRate: 16000,
    });

    await decodeMp3ToPcm(new Uint8Array(10));
    expect(mockFree).toHaveBeenCalledTimes(1);
  });

  it('calls free() even on decode error', async () => {
    mockDecode.mockRejectedValue(new Error('corrupt mp3'));

    await expect(decodeMp3ToPcm(new Uint8Array(10))).rejects.toThrow('corrupt mp3');
    expect(mockFree).toHaveBeenCalledTimes(1);
  });
});
