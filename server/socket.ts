import type { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { envSocketIoCorsOriginsFallback, envSocketIoPath } from "../src/lib/env-server";
import { bindSocketIOServer } from "../src/lib/socket-io-bridge";
import { registerSocketHandlers } from "./register-socket-handlers";

/**
 * Attaches Socket.io to the same HTTP server as Next.js so the app and WebSocket
 * traffic share one origin (simplifies cookies and CORS).
 */
export function attachSocketIO(httpServer: HTTPServer): SocketIOServer {
  const rawOrigin =
    process.env.SOCKET_IO_CORS_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL ??
    envSocketIoCorsOriginsFallback();

  const allowedOrigins = rawOrigin.split(",").map((s) => s.trim()).filter(Boolean);

  const io = new SocketIOServer(httpServer, {
    path: envSocketIoPath(),
    // Let Socket.io handle its own Engine.IO path; keep defaults for Phase 3.
    cors: {
      origin: allowedOrigins.length === 0 ? true : allowedOrigins,
      credentials: true,
    },
  });

  bindSocketIOServer(io);
  registerSocketHandlers(io);

  return io;
}
