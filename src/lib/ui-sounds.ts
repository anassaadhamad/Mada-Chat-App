/**
 * UI sounds — re-exports the centralized manager for a stable import path (`@/lib/ui-sounds`).
 */
export {
  ensureUiSoundsUnlocked,
  isUiSoundsMuted,
  setUiSoundsMuted,
  UI_SOUND_CLIPS,
  playUiSound,
  type UiSoundClipId,
  playMessageSend,
  playMessageReceive,
  playSpoilerReveal,
  playReplySound,
  playVoiceRecordStartSound,
  playVoiceRecordStopSound,
  startIncomingCallRing,
  stopIncomingCallRing,
  uiSoundManager,
} from "./ui-sound-manager";
