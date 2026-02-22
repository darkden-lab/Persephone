import type { BufferedMessage } from '../platform/message-buffer.js';
import { decodeAudioToPcm, isSupportedAudioType } from './decoder.js';
import { transcribeAudio } from './transcriber.js';

export interface DiscordAttachment {
  url: string;
  contentType: string | null;
  duration: number | null | undefined;
  waveform: string | null | undefined;
}

export function isVoiceAttachment(attachment: DiscordAttachment): boolean {
  // Voice messages have an audio/ogg content type and a waveform field
  const isOgg = attachment.contentType?.startsWith('audio/ogg') ?? false;
  const hasWaveform = attachment.waveform != null;
  return isOgg && hasWaveform;
}

export function isAudioAttachment(attachment: DiscordAttachment): boolean {
  // Regular audio file (not a native voice message with waveform)
  if (attachment.waveform != null) return false;
  return isSupportedAudioType(attachment.contentType);
}

export async function processVoiceMessage(
  audioUrl: string,
  targetMessage: BufferedMessage,
): Promise<void> {
  return processAudioAttachment(audioUrl, 'audio/ogg', targetMessage);
}

export async function processAudioAttachment(
  audioUrl: string,
  contentType: string,
  targetMessage: BufferedMessage,
): Promise<void> {
  try {
    // 1. Download the audio (30s timeout to prevent hanging on slow CDN)
    const response = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      targetMessage.transcription = '[download failed]';
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioData = new Uint8Array(arrayBuffer);

    // 2. Decode to PCM using the appropriate decoder
    let pcm: Float32Array;
    try {
      pcm = await decodeAudioToPcm(audioData, contentType);
    } catch {
      targetMessage.transcription = '[transcription error: decode failed]';
      return;
    }

    // 3. Transcribe with Whisper
    const text = await transcribeAudio(pcm);
    targetMessage.transcription = text;
  } catch (error) {
    targetMessage.transcription = `[transcription error: ${error instanceof Error ? error.message : String(error)}]`;
  }
}
