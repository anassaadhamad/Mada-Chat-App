/**
 * Central UI sound clips (MP3 under `public/sounds/`, served as `/sounds/…`).
 * Mute: `localStorage` key `mada-sounds-muted` === `"1"`.
 * Autoplay: `ensureUiSoundsUnlocked()` primes decode on first pointer/key (see `chat-shell`).
 */

const STORAGE_MUTE_KEY = "mada-sounds-muted";

/** One-shot clips: rewind + play from a singleton per id. */
type UiClipDef = { path: string; volume?: number };

export const UI_SOUND_CLIPS = {
  messageSend: { path: "/sounds/message-send.mp3" },
  messageReceive: { path: "/sounds/message-receive.mp3" },
  spoilerReveal: { path: "/sounds/reveal-pop.mp3", volume: 0.42 },
  reply: { path: "/sounds/reply.mp3", volume: 0.45 },
  recordStart: { path: "/sounds/record-start.mp3", volume: 0.48 },
  recordStop: { path: "/sounds/record-stop.mp3", volume: 0.48 },
} as const satisfies Record<string, UiClipDef>;

export type UiSoundClipId = keyof typeof UI_SOUND_CLIPS;

const INCOMING_CALL_URL = "/sounds/incoming-call.mp3";

let unlockBound = false;
const clipElements = new Map<UiSoundClipId, HTMLAudioElement>();
let incomingCallAudio: HTMLAudioElement | null = null;

let lastReceiveKey = "";
let lastReceiveAt = 0;

export function isUiSoundsMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setUiSoundsMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (muted) window.localStorage.setItem(STORAGE_MUTE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_MUTE_KEY);
  } catch {
    /* ignore */
  }
}

function muted(): boolean {
  return isUiSoundsMuted();
}

function getClip(id: UiSoundClipId): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  let a = clipElements.get(id);
  if (!a) {
    const def: UiClipDef = UI_SOUND_CLIPS[id];
    a = new Audio(def.path);
    a.preload = "auto";
    if (typeof def.volume === "number") {
      a.volume = def.volume;
    }
    clipElements.set(id, a);
  }
  return a;
}

/** Prime decode graph after first user gesture (mobile autoplay policy). */
export function ensureUiSoundsUnlocked(): void {
  if (typeof window === "undefined") return;
  if (unlockBound) return;
  unlockBound = true;

  const touch = () => {
    try {
      for (const id of Object.keys(UI_SOUND_CLIPS) as UiSoundClipId[]) {
        getClip(id)?.load();
      }
    } catch {
      /* ignore */
    }
  };

  window.addEventListener("pointerdown", touch, { passive: true, once: true });
  window.addEventListener("keydown", touch, { passive: true, once: true });
}

/**
 * Play a registered one-shot UI clip. Safe to call from click handlers (autoplay).
 * No-op when muted or when `Audio` is unavailable.
 */
export function playUiSound(id: UiSoundClipId): void {
  if (muted()) return;
  const a = getClip(id);
  if (!a) return;
  try {
    a.pause();
    a.currentTime = 0;
    void a.play().catch(() => {
      /* blocked until user has interacted */
    });
  } catch {
    /* ignore */
  }
}

export function playMessageSend(): void {
  playUiSound("messageSend");
}

/** Avoid double-chirp on duplicate socket deliveries for the same id. */
export function playMessageReceive(dedupeKey: string): void {
  if (muted()) return;
  const now = Date.now();
  if (dedupeKey && dedupeKey === lastReceiveKey && now - lastReceiveAt < 900) return;
  lastReceiveKey = dedupeKey;
  lastReceiveAt = now;
  playUiSound("messageReceive");
}

export function playSpoilerReveal(): void {
  playUiSound("spoilerReveal");
}

export function playReplySound(): void {
  playUiSound("reply");
}

export function playVoiceRecordStartSound(): void {
  playUiSound("recordStart");
}

export function playVoiceRecordStopSound(): void {
  playUiSound("recordStop");
}

export function startIncomingCallRing(): void {
  if (muted()) return;
  stopIncomingCallRing();
  try {
    clipElements.get("messageReceive")?.pause();
  } catch {
    /* ignore */
  }
  if (typeof Audio === "undefined") return;
  try {
    const a = new Audio(INCOMING_CALL_URL);
    a.loop = true;
    a.volume = 0.9;
    incomingCallAudio = a;
    void a.play().catch(() => {
      incomingCallAudio = null;
    });
  } catch {
    incomingCallAudio = null;
  }
}

export function stopIncomingCallRing(): void {
  const a = incomingCallAudio;
  incomingCallAudio = null;
  if (!a) return;
  try {
    a.pause();
    a.src = "";
    a.load();
  } catch {
    /* ignore */
  }
}

/** Namespaced API for UI audio: `uiSoundManager.play("reply")`, unlock, mute, and call ring. */
export const uiSoundManager = {
  play: playUiSound,
  playMessageSend,
  playMessageReceive,
  playSpoilerReveal,
  playReplySound,
  playVoiceRecordStartSound,
  playVoiceRecordStopSound,
  startIncomingCallRing,
  stopIncomingCallRing,
  ensureUnlocked: ensureUiSoundsUnlocked,
  isMuted: isUiSoundsMuted,
  setMuted: setUiSoundsMuted,
  clips: UI_SOUND_CLIPS,
} as const;
