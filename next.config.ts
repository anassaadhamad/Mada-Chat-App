import type { NextConfig } from "next";

const prod = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  compiler: {
    removeConsole: prod ? { exclude: ["error"] } : false,
  },
  // Allow HMR / dev resources from 127.0.0.1 and any ngrok tunnel domain
  allowedDevOrigins: ["127.0.0.1", "*.ngrok-free.app", "*.ngrok.io", "*.ngrok-free.dev"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
