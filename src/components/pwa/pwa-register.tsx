"use client";

import { useEffect } from "react";
import { ensureChatServiceWorker } from "@/lib/message-notifications-client";

/** Registers `/sw.js` early so precaching and offline navigation work, not only when enabling push. */
export function PwaRegister() {
  useEffect(() => {
    void ensureChatServiceWorker();
  }, []);
  return null;
}
