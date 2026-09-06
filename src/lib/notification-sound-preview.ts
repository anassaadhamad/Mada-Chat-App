let audioCtx: AudioContext | null = null;

function ctxOrCreate(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/** Short synthetic preview for in-app notification sounds (no external assets). */
export function playNotificationSoundPreview(kind: "ding" | "pop" | "chime" | "none"): void {
  if (kind === "none") return;
  const ctx = ctxOrCreate();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const freq = kind === "ding" ? 880 : kind === "pop" ? 520 : 660;
  osc.type = kind === "chime" ? "triangle" : "sine";
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "chime" ? 0.35 : 0.18));
  osc.start(now);
  osc.stop(now + 0.4);
}
