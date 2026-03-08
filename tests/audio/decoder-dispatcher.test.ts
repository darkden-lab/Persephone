import { describe, it, expect, vi } from 'vitest';

// Mock both decoders
vi.mock('ogg-opus-decoder', () => ({
  OggOpusDecoder: class MockOggOpusDecoder {
    ready = Promise.resolve();
    decode = vi.fn().mockResolvedValue({
      channelData: [new Float32Array([0.1, 0.2])],
      sampleRate: 16000,
    });
    free = vi.fn();
  },
}));
vi.mock('mpg123-decoder', () => ({
  MPEGDecoder: class MockMPEGDecoder {
    ready = Promise.resolve();
    decode = vi.fn().mockResolvedValue({
      channelData: [new Float32Array([0.3, 0.4])],
      sampleRate: 16000,
    });
    free = vi.fn();
  },
}));

import { decodeAudioToPcm, isSupportedAudioType } from '../../src/audio/decoder.js';

describe('isSupportedAudioType', () => {
  it('returns true for supported MIME types', () => {
    expect(isSupportedAudioType('audio/ogg')).toBe(true);
    expect(isSupportedAudioType('audio/mpeg')).toBe(true);
    expect(isSupportedAudioType('audio/mp3')).toBe(true);
    expect(isSupportedAudioType('audio/wav')).toBe(true);
    expect(isSupportedAudioType('audio/x-wav')).toBe(true);
    expect(isSupportedAudioType('audio/wave')).toBe(true);
  });

  it('returns true for MIME types with parameters', () => {
    expect(isSupportedAudioType('audio/ogg; codecs=opus')).toBe(true);
    expect(isSupportedAudioType('audio/wav; charset=utf-8')).toBe(true);
  });

  it('returns false for unsupported types', () => {
    expect(isSupportedAudioType('audio/flac')).toBe(false);
    expect(isSupportedAudioType('audio/aac')).toBe(false);
    expect(isSupportedAudioType('image/png')).toBe(false);
    expect(isSupportedAudioType('text/plain')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSupportedAudioType(null)).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isSupportedAudioType('Audio/OGG')).toBe(true);
    expect(isSupportedAudioType('AUDIO/MPEG')).toBe(true);
  });
});

describe('decodeAudioToPcm', () => {
  it('routes audio/ogg to OGG decoder', async () => {
    const result = await decodeAudioToPcm(new Uint8Array(10), 'audio/ogg');
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('routes audio/mpeg to MP3 decoder', async () => {
    const result = await decodeAudioToPcm(new Uint8Array(10), 'audio/mpeg');
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('routes audio/mp3 to MP3 decoder', async () => {
    const result = await decodeAudioToPcm(new Uint8Array(10), 'audio/mp3');
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('routes audio/wav to WAV decoder', async () => {
    // WAV needs valid headers, so this test only verifies the dispatcher
    // calls the right function (which will throw for invalid data)
    await expect(decodeAudioToPcm(new Uint8Array(10), 'audio/wav')).rejects.toThrow();
  });

  it('strips MIME parameters before routing', async () => {
    const result = await decodeAudioToPcm(new Uint8Array(10), 'audio/ogg; codecs=opus');
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('throws for unsupported audio types', async () => {
    await expect(decodeAudioToPcm(new Uint8Array(10), 'audio/flac')).rejects.toThrow('Unsupported audio type: audio/flac');
  });

  it('throws for non-audio types', async () => {
    await expect(decodeAudioToPcm(new Uint8Array(10), 'image/png')).rejects.toThrow('Unsupported audio type: image/png');
  });
});
