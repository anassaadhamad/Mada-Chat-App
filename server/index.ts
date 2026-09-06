import "./load-env";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { parse } from "url";
import next from "next";
import { envHttpServerHeadersTimeoutMs, envServerHost, envServerPort } from "../src/lib/env-server";
import { devLog, logError } from "../src/lib/server-logger";
import { attachSocketIO } from "./socket";

process.on("unhandledRejection", (reason, promise) => {
  logError("[server] unhandledRejection", reason, promise);
});

process.on("uncaughtException", (err) => {
  logError("[server] uncaughtException", err);
  process.exit(1);
});

const dev = process.env.NODE_ENV !== "production";
const hostname = envServerHost();
const port = envServerPort();

const app = next({
  dev,
  // Match Next 16 default dev bundler when using a programmatic server.
  turbopack: dev,
});

function sendInternalError(res: ServerResponse, err: unknown, url: string | undefined) {
  logError("[server] request error", url, err);
  res.statusCode = 500;
  res.end("Internal Server Error");
}

async function main(): Promise<void> {
  await app.prepare();
  const handle = app.getRequestHandler();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = req.url ?? "";
      const parsedUrl = parse(url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      sendInternalError(res, err, req.url);
    }
  });

  attachSocketIO(httpServer);

  // Node's default `requestTimeout` (5 min) aborts long bodies; disable for multi-GB uploads.
  httpServer.requestTimeout = 0;
  // Headers can be slow on poor networks before the body streams.
  httpServer.headersTimeout = envHttpServerHeadersTimeoutMs();

  await new Promise<void>((resolve) => {
    httpServer.listen(port, hostname, () => {
      devLog(`Mada server is running at http://${hostname}:${port} (Next.js ${dev ? "dev" : "prod"} + Socket.io)`);
      resolve();
    });
  });
}

void main().catch((err) => {
  logError("[server] failed to start", err);
  process.exit(1);
});
