import { publicApiUrl } from "@/lib/env-public";

export type UpdateChatPinError = "wrong_pin" | "bad_request" | "network";

/**
 * Updates the Secret Space PIN used for locked chats (stored on the user account).
 * `chatId` is reserved for callers that open the flow from a conversation; the server
 * does not require it today.
 */
export async function updateChatPin(
  _chatId: string | null,
  oldPin: string,
  newPin: string
): Promise<{ ok: true } | { ok: false; error: UpdateChatPinError; detail?: string }> {
  try {
    const res = await fetch(publicApiUrl("/api/me/chat-vault/change"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPin, newPin }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401) {
      return { ok: false, error: "wrong_pin", detail: data.error };
    }
    if (!res.ok) {
      return { ok: false, error: "bad_request", detail: data.error };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}
