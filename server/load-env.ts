import { loadEnvConfig } from "@next/env";

/** Run before other `server/*` imports so `process.env` matches Next.js (e.g. `.env`). */
loadEnvConfig(process.cwd());
