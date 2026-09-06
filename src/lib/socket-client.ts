"use client";

import { io, type Socket } from "socket.io-client";
import {
  envPublicSocketIoPath,
  envPublicSocketReconnectDelayMaxMs,
  envPublicSocketReconnectDelayMs,
  envPublicSocketTimeoutMs,
  envPublicSocketUrl,
} from "@/lib/env-public";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === "undefined") {
    throw new Error("Socket is only available in the browser");
  }
  if (!socket) {
    const explicit = envPublicSocketUrl();
    const url = explicit || window.location.origin;
    socket = io(url, {
      path: envPublicSocketIoPath(),
      withCredentials: true,
      autoConnect: false,
      /** Polling first survives strict proxies and some tunnel setups; upgrades to WebSocket when possible. */
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: envPublicSocketReconnectDelayMs(),
      reconnectionDelayMax: envPublicSocketReconnectDelayMaxMs(),
      timeout: envPublicSocketTimeoutMs(),
    });
  }
  return socket;
}
