import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted — cannot reference outer variables
// Use vi.hoisted() to create the mock function
const { mockPipeline } = vi.hoisted(() => ({
  mockPipeline: vi.fn(),
}));

vi.mock('@huggingface/transformers', () => ({
  pipeline: mockPipeline,
}));

import {
  transcribeAudio,
  isTranscriberReady,
  _resetForTesting,
  _getInitFailed,
} from '../../src/audio/transcriber.js';

describe('transcriber', () => {
  beforeEach(() => {
    _resetForTesting();
    mockPipeline.mockReset();
  });

  it('creates singleton pipeline on first call', async () => {
    const mockAsr = vi.fn().mockResolvedValue({ text: 'hello world' });
    mockPipeline.mockResolvedValue(mockAsr);

    const result = await transcribeAudio(new Float32Array(100));
    expect(result).toBe('hello world');
    expect(mockPipeline).toHaveBeenCalledTimes(1);

    // Second call should reuse the pipeline
    await transcribeAudio(new Float32Array(100));
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('reports transcriber as ready after successful init', async () => {
    expect(isTranscriberReady()).toBe(false);
    const mockAsr = vi.fn().mockResolvedValue({ text: 'test' });
    mockPipeline.mockResolvedValue(mockAsr);

    await transcribeAudio(new Float32Array(100));
    expect(isTranscriberReady()).toBe(true);
  });

  it('sets initFailed and does not retry on pipeline creation failure', async () => {
    mockPipeline.mockRejectedValue(new Error('download failed'));

    const result1 = await transcribeAudio(new Float32Array(100));
    expect(result1).toBe('[transcription unavailable: model not downloaded]');
    expect(_getInitFailed()).toBe(true);

    // Second call should not retry
    const result2 = await transcribeAudio(new Float32Array(100));
    expect(result2).toBe('[transcription unavailable: model not downloaded]');
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('returns trimmed text', async () => {
    const mockAsr = vi.fn().mockResolvedValue({ text: '  hello  ' });
    mockPipeline.mockResolvedValue(mockAsr);

    const result = await transcribeAudio(new Float32Array(100));
    expect(result).toBe('hello');
  });

  it('returns [empty transcription] for blank result', async () => {
    const mockAsr = vi.fn().mockResolvedValue({ text: '   ' });
    mockPipeline.mockResolvedValue(mockAsr);

    const result = await transcribeAudio(new Float32Array(100));
    expect(result).toBe('[empty transcription]');
  });
});
