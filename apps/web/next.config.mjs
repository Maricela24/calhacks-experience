// Foundation config (Person 1). Person 3 owns this file after the foundation commit; keep the /api rewrite.
import { existsSync } from "node:fs";
import path from "node:path";

// Load the root .env for server-side settings such as API_ORIGIN. Never overrides real env vars.
const envFile = path.resolve(import.meta.dirname, "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const apiOrigin = (process.env.API_ORIGIN ?? "http://127.0.0.1:4000").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages export TypeScript source; Next must compile them.
  transpilePackages: ["@afterhours/contracts"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/v1/:path*` }];
  },
};

export default nextConfig;
