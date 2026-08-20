import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nothing is gained by telling every visitor which framework and version this
  // runs on, and it is the first thing an automated scan reads.
  poweredByHeader: false,

  reactStrictMode: true,

  // Runtime logs on Vercel Hobby are kept for an hour, so the useful ones need
  // to be worth reading when they are. The rest of the security headers are set
  // per-request in src/proxy.ts, alongside the CSP nonce they belong with.
  logging: { fetches: { fullUrl: false } },
};

export default nextConfig;
