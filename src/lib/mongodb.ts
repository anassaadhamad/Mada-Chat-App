import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongo = globalThis as typeof globalThis & { __mongoCache?: MongooseCache };

function getCache(): MongooseCache {
  if (!globalForMongo.__mongoCache) {
    globalForMongo.__mongoCache = { conn: null, promise: null };
  }
  return globalForMongo.__mongoCache;
}

function mongoUri(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (raw) return raw;
  const legacy = process.env.MONGODB_URI?.trim();
  return legacy || undefined;
}

/**
 * Read DATABASE_URL at connect time (not at module load). Custom server: `server/load-env.ts`
 * runs before Socket.io. Next.js loads `.env` for Node runtimes; do not call `loadEnvConfig`
 * here — this module can be analyzed for Edge (e.g. middleware → auth).
 */
export async function connectDB(): Promise<typeof mongoose> {
  const uri = mongoUri();
  if (!uri) {
    throw new Error("DATABASE_URL is not set (or set MONGODB_URI)");
  }

  const cache = getCache();

  if (cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri);
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
