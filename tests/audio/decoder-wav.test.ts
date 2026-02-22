import { describe, it, expect, vi } from 'vitest';

// Mock ogg-opus-decoder and mpg123-decoder to avoid import issues
vi.mock('ogg-opus-decoder', () => ({
  OggOpusDecoder: class MockOggOpusDecoder {
    ready = Promise.resolve();
    decode = vi.fn();
    free = vi.fn();
  },
}));
vi.mock('mpg123-decoder', () => ({
  MPEGDecoder: class MockMPEGDecoder {
    ready = Promise.resolve();
    decode = vi.fn();
    free = vi.fn();
  },
}));

import { decodeWavToPcm } from '../../src/audio/decoder.js';

function buildWav(opts: {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  samples: number[] | Float32Array;
}): Uint8Array {
  const { audioFormat, numChannels, sampleRate, bitsPerSample, samples } = opts;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = samples.length * bytesPerSample;
  const fmtChunkSize = 16;
  const totalSize = 12 + (8 + fmtChunkSize) + (8 + dataSize);
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // RIFF header
  bytes.set([0x52, 0x49, 0x46, 0x46]); // "RIFF"
  view.setUint32(4, totalSize - 8, true);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt chunk
  let offset = 12;
  bytes.set([0x66, 0x6D, 0x74, 0x20], offset); // "fmt "
  view.setUint32(offset + 4, fmtChunkSize, true);
  view.setUint16(offset + 8, audioFormat, true);
  view.setUint16(offset + 10, numChannels, true);
  view.setUint32(offset + 12, sampleRate, true);
  view.setUint32(offset + 16, sampleRate * numChannels * bytesPerSample, true); // byteRate
  view.setUint16(offset + 20, numChannels * bytesPerSample, true); // blockAlign
  view.setUint16(offset + 22, bitsPerSample, true);

  // data chunk
  offset += 8 + fmtChunkSize;
  bytes.set([0x64, 0x61, 0x74, 0x61], offset); // "data"
  view.setUint32(offset + 4, dataSize, true);
  offset += 8;

  if (audioFormat === 1 && bitsPerSample === 16) {
    for (let i = 0; i < samples.length; i++) {
      const val = typeof samples[i] === 'number' ? samples[i] : 0;
      view.setInt16(offset + i * 2, Math.round(val * 32767), true);
    }
  } else if (audioFormat === 1 && bitsPerSample === 8) {
    for (let i = 0; i < samples.length; i++) {
      const val = typeof samples[i] === 'number' ? samples[i] : 0;
      bytes[offset + i] = Math.round(val * 127 + 128);
    }
  } else if (audioFormat === 3 && bitsPerSample === 32) {
    for (let i = 0; i < samples.length; i++) {
      const val = typeof samples[i] === 'number' ? samples[i] : 0;
      view.setFloat32(offset + i * 4, val, true);
    }
  }

  return bytes;
}

describe('decodeWavToPcm', () => {
  it('decodes 16-bit mono PCM at 16kHz (no resample needed)', async () => {
    const wav = buildWav({
      audioFormat: 1,
      numChannels: 1,
      sampleRate: 16000,
      bitsPerSample: 16,
      samples: [0.5, -0.5, 0.25, -0.25],
    });

    const result = await decodeWavToPcm(wav);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(-0.5, 1);
  });

  it('decodes 16-bit stereo and mixes to mono', async () => {
    // Interleaved stereo: L=1.0,R=0.0, L=0.0,R=1.0
    const wav = buildWav({
      audioFormat: 1,
      numChannels: 2,
      sampleRate: 16000,
      bitsPerSample: 16,
      samples: [1.0, 0.0, 0.0, 1.0],
    });

    const result = await decodeWavToPcm(wav);
    expect(result.length).toBe(2); // 4 samples / 2 channels
    expect(result[0]).toBeCloseTo(0.5, 1);
    expect(result[1]).toBeCloseTo(0.5, 1);
  });

  it('decodes 8-bit unsigned PCM', async () => {
    const wav = buildWav({
      audioFormat: 1,
      numChannels: 1,
      sampleRate: 16000,
      bitsPerSample: 8,
      samples: [0.0, 0.5, -0.5],
    });

    const result = await decodeWavToPcm(wav);
    expect(result.length).toBe(3);
    // 8-bit: 0.0 -> 128 -> (128-128)/128 = 0.0
    expect(result[0]).toBeCloseTo(0.0, 1);
  });

  it('decodes IEEE float 32-bit', async () => {
    const wav = buildWav({
      audioFormat: 3,
      numChannels: 1,
      sampleRate: 16000,
      bitsPerSample: 32,
      samples: [0.5, -0.5, 0.25],
    });

    const result = await decodeWavToPcm(wav);
    expect(result.length).toBe(3);
    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(-0.5);
    expect(result[2]).toBeCloseTo(0.25);
  });

  it('resamples from 44100Hz to 16kHz', async () => {
    // 441 samples at 44100Hz -> ~160 at 16kHz
    const samples = Array.from({ length: 441 }, (_, i) => Math.sin(i * 0.1));
    const wav = buildWav({
      audioFormat: 1,
      numChannels: 1,
      sampleRate: 44100,
      bitsPerSample: 16,
      samples,
    });

    const result = await decodeWavToPcm(wav);
    expect(result.length).toBe(160);
  });

  it('throws on file too short', async () => {
    await expect(decodeWavToPcm(new Uint8Array(10))).rejects.toThrow('WAV file too short');
  });

  it('throws on invalid RIFF header', async () => {
    const bad = new Uint8Array(44);
    bad.set([0x00, 0x00, 0x00, 0x00]); // Not "RIFF"
    await expect(decodeWavToPcm(bad)).rejects.toThrow('Invalid WAV header');
  });

  it('throws on unsupported format', async () => {
    // audioFormat=2 (ADPCM) is unsupported
    const wav = buildWav({
      audioFormat: 2,
      numChannels: 1,
      sampleRate: 16000,
      bitsPerSample: 16,
      samples: [0.5],
    });

    await expect(decodeWavToPcm(wav)).rejects.toThrow('Unsupported WAV format');
  });
});
