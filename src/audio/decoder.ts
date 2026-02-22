import { OggOpusDecoder } from 'ogg-opus-decoder';
import { MPEGDecoder } from 'mpg123-decoder';

const TARGET_SAMPLE_RATE = 16000;

const SUPPORTED_MIME_TYPES = new Set([
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
]);

export function isSupportedAudioType(contentType: string | null): boolean {
  if (!contentType) return false;
  // Strip parameters (e.g. "audio/ogg; codecs=opus" -> "audio/ogg")
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return SUPPORTED_MIME_TYPES.has(mime);
}

// Max 5 minutes at 16kHz target = 4,800,000 samples
const MAX_OUTPUT_SAMPLES = 16000 * 300;

function resample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate < 8000 || inputRate > 384000) {
    throw new Error(`Invalid sample rate: ${inputRate}`);
  }
  if (inputRate === outputRate) return input;

  const ratio = inputRate / outputRate;
  const outputLength = Math.round(input.length / ratio);
  if (outputLength > MAX_OUTPUT_SAMPLES) {
    throw new Error('Audio too long (exceeds 5 minute limit)');
  }
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const lower = Math.floor(srcIndex);
    const upper = Math.min(lower + 1, input.length - 1);
    const frac = srcIndex - lower;
    output[i] = input[lower] * (1 - frac) + input[upper] * frac;
  }
  return output;
}

function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return channelData[0];

  const length = channelData[0].length;
  const mono = new Float32Array(length);
  const numChannels = channelData.length;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      sum += channelData[ch][i];
    }
    mono[i] = sum / numChannels;
  }
  return mono;
}

export async function decodeOggOpusToPcm(oggData: Uint8Array): Promise<Float32Array> {
  const decoder = new OggOpusDecoder();

  try {
    await decoder.ready;
    const result = await decoder.decode(oggData);
    const mono = mixToMono(result.channelData);
    const inputRate = result.sampleRate ?? 48000;
    return resample(mono, inputRate, TARGET_SAMPLE_RATE);
  } finally {
    decoder.free();
  }
}

export async function decodeMp3ToPcm(mp3Data: Uint8Array): Promise<Float32Array> {
  const decoder = new MPEGDecoder();

  try {
    await decoder.ready;
    const result = await decoder.decode(mp3Data);
    const mono = mixToMono(result.channelData);
    const inputRate = result.sampleRate ?? 44100;
    return resample(mono, inputRate, TARGET_SAMPLE_RATE);
  } finally {
    decoder.free();
  }
}

export async function decodeWavToPcm(wavData: Uint8Array): Promise<Float32Array> {
  const view = new DataView(wavData.buffer, wavData.byteOffset, wavData.byteLength);

  // Validate RIFF header
  if (wavData.length < 44) throw new Error('WAV file too short');
  const riff = String.fromCharCode(wavData[0], wavData[1], wavData[2], wavData[3]);
  const wave = String.fromCharCode(wavData[8], wavData[9], wavData[10], wavData[11]);
  if (riff !== 'RIFF' || wave !== 'WAVE') throw new Error('Invalid WAV header');

  // Find fmt chunk
  let offset = 12;
  let fmtFound = false;
  let audioFormat = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;

  while (offset < wavData.length - 8) {
    const chunkId = String.fromCharCode(wavData[offset], wavData[offset + 1], wavData[offset + 2], wavData[offset + 3]);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      audioFormat = view.getUint16(offset + 8, true);
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
      fmtFound = true;
    }

    if (chunkId === 'data') {
      if (!fmtFound) throw new Error('WAV: data chunk before fmt chunk');

      const dataStart = offset + 8;
      const dataEnd = Math.min(dataStart + chunkSize, wavData.length);
      const rawBytes = wavData.subarray(dataStart, dataEnd);

      let samples: Float32Array;

      if (audioFormat === 1 && bitsPerSample === 16) {
        // PCM 16-bit signed
        const sampleCount = Math.floor(rawBytes.length / 2);
        samples = new Float32Array(sampleCount);
        const rawView = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
        for (let i = 0; i < sampleCount; i++) {
          samples[i] = rawView.getInt16(i * 2, true) / 32768;
        }
      } else if (audioFormat === 1 && bitsPerSample === 8) {
        // PCM 8-bit unsigned
        samples = new Float32Array(rawBytes.length);
        for (let i = 0; i < rawBytes.length; i++) {
          samples[i] = (rawBytes[i] - 128) / 128;
        }
      } else if (audioFormat === 3 && bitsPerSample === 32) {
        // IEEE float 32-bit
        const sampleCount = Math.floor(rawBytes.length / 4);
        samples = new Float32Array(sampleCount);
        const rawView = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
        for (let i = 0; i < sampleCount; i++) {
          samples[i] = rawView.getFloat32(i * 4, true);
        }
      } else {
        throw new Error(`Unsupported WAV format: audioFormat=${audioFormat}, bitsPerSample=${bitsPerSample}`);
      }

      // Deinterleave and mix to mono
      if (numChannels > 1) {
        const frameSamples = Math.floor(samples.length / numChannels);
        const channels: Float32Array[] = [];
        for (let ch = 0; ch < numChannels; ch++) {
          channels.push(new Float32Array(frameSamples));
        }
        for (let i = 0; i < frameSamples; i++) {
          for (let ch = 0; ch < numChannels; ch++) {
            channels[ch][i] = samples[i * numChannels + ch];
          }
        }
        const mono = mixToMono(channels);
        return resample(mono, sampleRate, TARGET_SAMPLE_RATE);
      }

      return resample(samples, sampleRate, TARGET_SAMPLE_RATE);
    }

    const advance = 8 + chunkSize + (chunkSize % 2 !== 0 ? 1 : 0);
    if (advance === 0) throw new Error('WAV: zero-size chunk');
    offset += advance;
  }

  throw new Error('WAV: no data chunk found');
}

export async function decodeAudioToPcm(data: Uint8Array, contentType: string): Promise<Float32Array> {
  const mime = contentType.split(';')[0].trim().toLowerCase();

  switch (mime) {
    case 'audio/ogg':
      return decodeOggOpusToPcm(data);
    case 'audio/mpeg':
    case 'audio/mp3':
      return decodeMp3ToPcm(data);
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
      return decodeWavToPcm(data);
    default:
      throw new Error(`Unsupported audio type: ${mime}`);
  }
}
