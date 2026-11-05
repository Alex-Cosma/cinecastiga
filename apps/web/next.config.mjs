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
  // The site uses no next/image or next/og. Left on, /_next/image?url=/api/documents/… made the server buffer up to
  // 50 MB of a SEAP file and parse it with sharp for any anonymous request (audit S3F2); unoptimized answers 404 there.
  images: { unoptimized: true },
  // The release images (infra/prod/Dockerfile.web, Dockerfile.documents) copy only the web app and the packages it
  // imports. Tests may import apps/ingestion sources, so `next build` type-checks the app without its test files;
  // vitest and the editor keep using tsconfig.json.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  // The beginner guide became the methodology's "Pe scurt" lane (owner, 5 November 2026); old links keep working.
  async redirects() {
    return [{ source: "/ghid", destination: "/metodologie", permanent: true }];
  },
  // Next 16.2's scroll-to-top on navigation started from the first node a route segment renders; in production that
  // node is a <script> or stylesheet React hoists into <head>, so pages with client components (e.g. /semnale) opened at
  // the previous page's scroll position, and experimental.appNewScrollHandler was set here. From 16.4 the fragment-ref
  // handler is Next's only one and the key no longer exists (docs/handover/20261011/product-and-code.md).
};

export default nextConfig;
