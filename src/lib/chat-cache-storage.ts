import type { StateStorage } from "zustand/middleware";

const STORAGE_PREFIX = "mada-chat-cache";

let scopedUserId: string | null = null;

/** Must be set before `persist.rehydrate()` / writes so cache is namespaced per account. */
export function setChatCachePersistScope(userId: string | null): void {
  scopedUserId = userId;
}

function storageKey(): string | null {
  if (!scopedUserId) return null;
  return `${STORAGE_PREFIX}:${scopedUserId}`;
}

export const chatCacheStorage: StateStorage = {
  getItem: (): string | null => {
    const k = storageKey();
    if (!k) return null;
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (_name: string, value: string): void => {
    const k = storageKey();
    if (!k) return;
    try {
      localStorage.setItem(k, value);
    } catch {
      /* quota or private mode — keep in-memory only */
    }
  },
  removeItem: (): void => {
    const k = storageKey();
    if (!k) return;
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
