import { formatChatTime } from "@/lib/format-chat-time";

/**
 * Browser-reported clock for AI requests so reply-time matches what the user sees
 * (same locale rules as message bubbles via {@link formatChatTime}).
 */
export type ClientClockContext = {
  /** `Date.now()` from the browser when the request was built. */
  nowEpochMs: number;
  /** IANA zone from `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
  timeZone: string;
  /** Human-readable local time string aligned with the chat UI clock. */
  localLabel: string;
};

const MAX_LABEL = 240;
const MAX_TZ_LEN = 80;
/** Allow generous device clock skew vs server. */
const MAX_SKEW_MS = 36 * 60 * 60 * 1000;

function readNested(body: Record<string, unknown>): Record<string, unknown> {
  const cc = body.clientClock;
  if (cc && typeof cc === "object" && !Array.isArray(cc)) {
    return cc as Record<string, unknown>;
  }
  return body;
}

/**
 * Validates and returns client clock from JSON body, or an error message.
 * Expects `{ clientClock: { nowEpochMs, timeZone, localLabel } }` (recommended).
 */
export function parseClientClockFromRequestBody(body: unknown):
  | { ok: true; clock: ClientClockContext }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "clientClock object is required" };
  }
  const root = body as Record<string, unknown>;
  const o = readNested(root);

  const nowEpochMs = Number(o.nowEpochMs);
  if (!Number.isFinite(nowEpochMs)) {
    return { ok: false, error: "clientClock.nowEpochMs must be a finite number" };
  }

  const timeZone = String(o.timeZone ?? "").trim();
  if (timeZone.length < 2 || timeZone.length > MAX_TZ_LEN) {
    return { ok: false, error: "clientClock.timeZone must be a non-empty IANA zone string" };
  }
  if (!/^[A-Za-z0-9_/+-]+$/.test(timeZone)) {
    return { ok: false, error: "clientClock.timeZone has invalid characters" };
  }

  const localLabel = String(o.localLabel ?? "").trim();
  if (localLabel.length < 1 || localLabel.length > MAX_LABEL) {
    return { ok: false, error: "clientClock.localLabel must be a short non-empty string" };
  }

  const serverNow = Date.now();
  if (Math.abs(nowEpochMs - serverNow) > MAX_SKEW_MS) {
    return { ok: false, error: "clientClock.nowEpochMs is too far from server time" };
  }

  return {
    ok: true,
    clock: { nowEpochMs, timeZone, localLabel },
  };
}

/** Build payload on the client immediately before fetch (same instant as `nowEpochMs`). */
export function buildAiClientClockPayload(): ClientClockContext {
  const nowEpochMs = Date.now();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const d = new Date(nowEpochMs);
  const calendarLine = d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeAsInBubble = formatChatTime(nowEpochMs);
  const localLabel = `${calendarLine}, ${timeAsInBubble}`.slice(0, MAX_LABEL);
  return { nowEpochMs, timeZone, localLabel };
}
