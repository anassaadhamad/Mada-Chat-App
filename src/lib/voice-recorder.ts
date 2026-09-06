/** Browser voice capture: MIME + file extension aligned with `GET /api/files/[name]` types. */

export type VoiceRecordingFormat = {
  mimeType: string;
  fileExtension: string;
};

export function canRecordVoice(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
}

export function pickVoiceRecordingFormat(): VoiceRecordingFormat {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "", fileExtension: ".weba" };
  }
  const candidates: { mime: string; ext: string }[] = [
    { mime: "audio/webm;codecs=opus", ext: ".weba" },
    { mime: "audio/webm", ext: ".weba" },
    { mime: "audio/mp4", ext: ".m4a" },
    { mime: "audio/ogg;codecs=opus", ext: ".ogg" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) {
      return { mimeType: c.mime, fileExtension: c.ext };
    }
  }
  return { mimeType: "", fileExtension: ".weba" };
}

/** ~64 kbps Opus/AAC-style voice — small files, still clear speech (where the browser honors `audioBitsPerSecond`). */
const VOICE_BITS_PER_SECOND = 64000;

/** Options for `MediaRecorder` — prefer Opus in WebM for efficient storage. */
export function buildVoiceMediaRecorderOptions(): MediaRecorderOptions {
  const { mimeType } = pickVoiceRecordingFormat();
  const base: MediaRecorderOptions = {
    audioBitsPerSecond: VOICE_BITS_PER_SECOND,
  };
  if (mimeType) {
    return { ...base, mimeType };
  }
  return base;
}
