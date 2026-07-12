/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // postgres.js + the workspace db package are server-only; keep them out of the
  // client/edge bundle so `postgres` runs as a plain Node dependency.
  serverExternalPackages: ["postgres", "@seap/db"],
};

export default nextConfig;
