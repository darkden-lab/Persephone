import { pipeline } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/whisper-small';

// Language for Whisper transcription. transformers.js does NOT implement
// auto-detection (defaults to English). Set WHISPER_LANGUAGE env to override.
const WHISPER_LANGUAGE = process.env.WHISPER_LANGUAGE || 'spanish';

// Use a minimal interface instead of the full union type to avoid TS2590
interface AsrPipeline {
  (input: Float32Array, options?: Record<string, unknown>): Promise<{ text: string }>;
}

let transcriber: AsrPipeline | null = null;
let initFailed = false;

async function getTranscriber(): Promise<AsrPipeline | null> {
  if (transcriber) return transcriber;
  if (initFailed) return null;

  try {
    // Whisper encoder is sensitive to quantization — keep at fp16 for accuracy,
    // use q4 for decoder to reduce model size (~150MB vs ~500MB fp32).
    transcriber = await (pipeline as any)('automatic-speech-recognition', MODEL_ID, {
      dtype: {
        encoder_model: 'fp16',
        decoder_model_merged: 'q4',
      },
    }) as AsrPipeline;
    return transcriber;
  } catch {
    initFailed = true;
    return null;
  }
}

export async function transcribeAudio(pcm: Float32Array): Promise<string> {
  const asr = await getTranscriber();
  if (!asr) {
    return '[transcription unavailable: model not downloaded]';
  }

  // Pass language explicitly because transformers.js lacks auto-detection
  // (defaults to English without it). task: 'transcribe' keeps original language.
  const result = await asr(pcm, { language: WHISPER_LANGUAGE, task: 'transcribe' });
  const text = (result as { text: string }).text?.trim() ?? '';
  return text || '[empty transcription]';
}

export function isTranscriberReady(): boolean {
  return transcriber !== null;
}

// Exported for testing only
export function _resetForTesting(): void {
  transcriber = null;
  initFailed = false;
}

export function _getInitFailed(): boolean {
  return initFailed;
}
