import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // postgres.js + the workspace db package are server-only; keep them out of the
  // client/edge bundle so `postgres` runs as a plain Node dependency.
  serverExternalPackages: ["postgres", "@seap/db"],
  // Self-contained server bundle for the production image (infra/prod). The
  // tracing root is the monorepo root so workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.join(here, "../../"),
};

export default nextConfig;
