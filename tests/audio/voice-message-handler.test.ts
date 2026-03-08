import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/audio/decoder.js', () => ({
  decodeAudioToPcm: vi.fn(),
  isSupportedAudioType: vi.fn(),
}));
vi.mock('../../src/audio/transcriber.js', () => ({
  transcribeAudio: vi.fn(),
}));

import {
  isVoiceAttachment,
  isAudioAttachment,
  processVoiceMessage,
  processAudioAttachment,
  type DiscordAttachment,
} from '../../src/audio/voice-message-handler.js';
import { decodeAudioToPcm, isSupportedAudioType } from '../../src/audio/decoder.js';
import { transcribeAudio } from '../../src/audio/transcriber.js';
import type { BufferedMessage } from '../../src/discord/message-buffer.js';

const mockDecode = vi.mocked(decodeAudioToPcm);
const mockTranscribe = vi.mocked(transcribeAudio);
const mockIsSupportedAudioType = vi.mocked(isSupportedAudioType);

describe('isVoiceAttachment', () => {
  it('identifies voice messages correctly', () => {
    const att: DiscordAttachment = {
      url: 'https://cdn.discordapp.com/attachments/voice.ogg',
      contentType: 'audio/ogg',
      duration: 5.0,
      waveform: 'base64data',
    };
    expect(isVoiceAttachment(att)).toBe(true);
  });

  it('rejects non-audio attachments', () => {
    const att: DiscordAttachment = {
      url: 'https://cdn.discordapp.com/attachments/image.png',
      contentType: 'image/png',
      duration: null,
      waveform: null,
    };
    expect(isVoiceAttachment(att)).toBe(false);
  });

  it('rejects audio without waveform', () => {
    const att: DiscordAttachment = {
      url: 'https://cdn.discordapp.com/attachments/file.ogg',
      contentType: 'audio/ogg',
      duration: 5.0,
      waveform: null,
    };
    expect(isVoiceAttachment(att)).toBe(false);
  });

  it('rejects null content type', () => {
    const att: DiscordAttachment = {
      url: 'https://example.com/file',
      contentType: null,
      duration: null,
      waveform: 'data',
    };
    expect(isVoiceAttachment(att)).toBe(false);
  });
});

describe('isAudioAttachment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('identifies MP3 files', () => {
    mockIsSupportedAudioType.mockReturnValue(true);
    const att: DiscordAttachment = {
      url: 'https://cdn.example.com/song.mp3',
      contentType: 'audio/mpeg',
      duration: null,
      waveform: null,
    };
    expect(isAudioAttachment(att)).toBe(true);
  });

  it('identifies WAV files', () => {
    mockIsSupportedAudioType.mockReturnValue(true);
    const att: DiscordAttachment = {
      url: 'https://cdn.example.com/audio.wav',
      contentType: 'audio/wav',
      duration: null,
      waveform: null,
    };
    expect(isAudioAttachment(att)).toBe(true);
  });

  it('rejects voice messages (have waveform)', () => {
    mockIsSupportedAudioType.mockReturnValue(true);
    const att: DiscordAttachment = {
      url: 'https://cdn.example.com/voice.ogg',
      contentType: 'audio/ogg',
      duration: 5.0,
      waveform: 'base64data',
    };
    expect(isAudioAttachment(att)).toBe(false);
  });

  it('rejects non-audio files', () => {
    mockIsSupportedAudioType.mockReturnValue(false);
    const att: DiscordAttachment = {
      url: 'https://cdn.example.com/photo.png',
      contentType: 'image/png',
      duration: null,
      waveform: null,
    };
    expect(isAudioAttachment(att)).toBe(false);
  });
});

describe('processVoiceMessage', () => {
  let targetMessage: BufferedMessage;

  beforeEach(() => {
    vi.resetAllMocks();
    targetMessage = {
      author: 'testuser',
      content: '',
      timestamp: '2026-01-01T00:00:00Z',
      attachments: ['https://cdn.example.com/voice.ogg'],
      transcription: '[transcribing...]',
    };

    // Default: mock fetch to return audio data
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    }) as unknown as typeof fetch;
  });

  it('updates transcription on success', async () => {
    mockDecode.mockResolvedValue(new Float32Array(100));
    mockTranscribe.mockResolvedValue('hello world');

    await processVoiceMessage('https://cdn.example.com/voice.ogg', targetMessage);
    expect(targetMessage.transcription).toBe('hello world');
    // Verify it delegates with audio/ogg content type
    expect(mockDecode).toHaveBeenCalledWith(expect.any(Uint8Array), 'audio/ogg');
  });

  it('handles download failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    await processVoiceMessage('https://cdn.example.com/voice.ogg', targetMessage);
    expect(targetMessage.transcription).toBe('[download failed]');
  });

  it('handles decode failure', async () => {
    mockDecode.mockRejectedValue(new Error('corrupt audio'));

    await processVoiceMessage('https://cdn.example.com/voice.ogg', targetMessage);
    expect(targetMessage.transcription).toBe('[transcription error: decode failed]');
  });

  it('handles transcription failure', async () => {
    mockDecode.mockResolvedValue(new Float32Array(100));
    mockTranscribe.mockRejectedValue(new Error('whisper crash'));

    await processVoiceMessage('https://cdn.example.com/voice.ogg', targetMessage);
    expect(targetMessage.transcription).toBe('[transcription error: whisper crash]');
  });

  it('handles fetch throwing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch;

    await processVoiceMessage('https://cdn.example.com/voice.ogg', targetMessage);
    expect(targetMessage.transcription).toBe('[transcription error: network error]');
  });
});

describe('processAudioAttachment', () => {
  let targetMessage: BufferedMessage;

  beforeEach(() => {
    vi.resetAllMocks();
    targetMessage = {
      author: 'testuser',
      content: 'check out this song',
      timestamp: '2026-01-01T00:00:00Z',
      attachments: ['https://cdn.example.com/song.mp3'],
      transcription: '[transcribing...]',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(200)),
    }) as unknown as typeof fetch;
  });

  it('transcribes MP3 file successfully', async () => {
    mockDecode.mockResolvedValue(new Float32Array(100));
    mockTranscribe.mockResolvedValue('the quick brown fox');

    await processAudioAttachment('https://cdn.example.com/song.mp3', 'audio/mpeg', targetMessage);
    expect(targetMessage.transcription).toBe('the quick brown fox');
    expect(mockDecode).toHaveBeenCalledWith(expect.any(Uint8Array), 'audio/mpeg');
  });

  it('transcribes WAV file successfully', async () => {
    mockDecode.mockResolvedValue(new Float32Array(100));
    mockTranscribe.mockResolvedValue('hello from wav');

    await processAudioAttachment('https://cdn.example.com/audio.wav', 'audio/wav', targetMessage);
    expect(targetMessage.transcription).toBe('hello from wav');
    expect(mockDecode).toHaveBeenCalledWith(expect.any(Uint8Array), 'audio/wav');
  });

  it('handles download failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    await processAudioAttachment('https://cdn.example.com/song.mp3', 'audio/mpeg', targetMessage);
    expect(targetMessage.transcription).toBe('[download failed]');
  });

  it('handles decode failure', async () => {
    mockDecode.mockRejectedValue(new Error('bad format'));

    await processAudioAttachment('https://cdn.example.com/song.mp3', 'audio/mpeg', targetMessage);
    expect(targetMessage.transcription).toBe('[transcription error: decode failed]');
  });
});
