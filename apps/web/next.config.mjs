import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep local validation builds separate from a running preview.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // postgres.js + the workspace db package are server-only; keep them out of the
  // client/edge bundle so `postgres` runs as a plain Node dependency.
  serverExternalPackages: ["postgres", "@seap/db"],
  // Self-contained server bundle for the production image (infra/prod). The
  // tracing root is the monorepo root so workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.join(here, "../../"),
  experimental: {
    // Next's default scroll-to-top on navigation starts from the first node a
    // route segment renders. In production that node is a segment <script> or
    // stylesheet that React hoists into <head>; the handler walks the head,
    // finds nothing visible and gives up, so pages with client components
    // (e.g. /semnale) opened at the previous page's scroll position. The
    // fragment-ref handler measures the segment's own content instead.
    appNewScrollHandler: true,
  },
};

export default nextConfig;
