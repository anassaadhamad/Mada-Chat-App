/**
 * Client-only voice note FX: decode → OfflineAudioContext graph → WAV (PCM).
 * Keeps processing off the server and gives instant preview after recording.
 */

export type VoiceEffectId = "none" | "chipmunk" | "deep" | "robot";

function interleaveChannels(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const len = channels[0]!.length;
  const out = new Float32Array(len * channels.length);
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < channels.length; c++) {
      out[i * channels.length + c] = channels[c]![i]!;
    }
  }
  return out;
}

function floatTo16BitPCM(float32: Float32Array): DataView {
  const buf = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]!));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return view;
}

/** 16-bit PCM WAV blob (browser-native playback + WaveSurfer). */
export function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const ch: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    ch.push(buffer.getChannelData(c));
  }
  const interleaved = interleaveChannels(ch);
  const pcm = floatTo16BitPCM(interleaved);
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.byteLength;
  const headerSize = 44;
  const out = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(out);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)!);
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  new Uint8Array(out, headerSize).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  return new Blob([out], { type: "audio/wav" });
}

function makeDistortionCurve(amount: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = 2 * amount;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function applyEffectGraph(
  ctx: OfflineAudioContext,
  buffer: AudioBuffer,
  effect: VoiceEffectId
): AudioNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = 1;

  if (effect === "chipmunk") {
    src.detune.value = 650;
    src.connect(ctx.destination);
    return src;
  }
  if (effect === "deep") {
    src.detune.value = -550;
    src.connect(ctx.destination);
    return src;
  }
  if (effect === "robot") {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 280;
    hp.Q.value = 0.7;

    const shaper = ctx.createWaveShaper();
    shaper.curve = new Float32Array(makeDistortionCurve(18));
    shaper.oversample = "4x";

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1100;
    bp.Q.value = 0.85;

    const gain = ctx.createGain();
    gain.gain.value = 1.65;

    src.connect(hp);
    hp.connect(shaper);
    shaper.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    return src;
  }

  src.connect(ctx.destination);
  return src;
}

async function renderBufferWithEffect(buffer: AudioBuffer, effect: VoiceEffectId): Promise<AudioBuffer> {
  if (effect === "none") {
    return buffer;
  }
  const ctx = new OfflineAudioContext({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });
  const src = applyEffectGraph(ctx, buffer, effect) as AudioBufferSourceNode;
  src.start(0);
  return ctx.startRendering();
}

/**
 * Returns the same `file` when `effect` is `"none"`, otherwise a new WAV `File`.
 */
export async function renderVoiceFileWithEffect(file: File, effect: VoiceEffectId): Promise<File> {
  if (effect === "none") {
    return file;
  }
  const ac = new AudioContext();
  let decoded: AudioBuffer;
  try {
    const buf = await file.arrayBuffer();
    decoded = await ac.decodeAudioData(buf.slice(0));
  } finally {
    await ac.close().catch(() => {});
  }

  const rendered = await renderBufferWithEffect(decoded, effect);
  const wav = encodeAudioBufferToWav(rendered);
  const base = file.name.replace(/\.[^/.]+$/, "") || "voice";
  return new File([wav], `${base}-${effect}.wav`, { type: "audio/wav" });
}
