import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config.mjs";

const here = new URL(".", import.meta.url).pathname;
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|mjs)$/.test(name) ? [path] : [];
  });
}

describe("next.config images (audit S3F2)", () => {
  it("turns the image optimizer off", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });

  it("has nothing that needs it: no next/image or next/og", () => {
    const files = ["app", "components", "lib"].flatMap((dir) => sources(join(here, dir)));
    const users = files.filter((file) => /from ["']next\/(?:image|og)["']/.test(readFileSync(file, "utf8")));
    expect(users).toEqual([]);
  });
});
