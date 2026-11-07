import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePace } from "./pace";

const web = path.resolve(__dirname, "../..");
const motionCss = readFileSync(path.join(web, "components/motion/chart-motion.css"), "utf8");

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : cssFiles(full);
    return name.endsWith(".css") ? [full] : [];
  });
}

describe("chart pace", () => {
  it("is one number on :root, 1.5 since 7 November 2026 (1 is the motion of 6 November)", () => {
    const set = [...motionCss.matchAll(/--chart-pace:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(set).toEqual(["1.5"]);
    expect(parsePace(set[0]!)).toBe(1.5);
  });

  it("reads anything that is not a positive number as 1", () => {
    for (const raw of ["", " ", "abc", "0", "-1"]) expect(parsePace(raw)).toBe(1);
    expect(parsePace(" 0.7 ")).toBe(0.7);
  });

  it("scales the entrances: duration, delay and stagger", () => {
    expect(motionCss).toContain("calc(var(--cm-dur, var(--chart-in)) * var(--chart-pace))");
    expect(motionCss).toMatch(/animation-delay: calc\(\(var\(--cm-d, 0ms\) \+ min\([^;]+\)\) \* var\(--chart-pace\)\);/);
  });

  it("every chart transition or animation on the chart tokens is multiplied by the pace", () => {
    const misses: string[] = [];
    for (const file of [...cssFiles(path.join(web, "app")), ...cssFiles(path.join(web, "components"))]) {
      const css = readFileSync(file, "utf8");
      for (const decl of css.match(/(?:transition|animation)(?:-duration)?\s*:[^;{}]*/g) ?? []) {
        const bare = decl.replace(/calc\(var\(--(?:cm-dur, var\(--chart-in\)|chart-in|chart-tw|slow|med)\) \* var\(--chart-pace\)\)/g, "");
        if (/var\(--chart-(?:in|tw)\)/.test(bare)) misses.push(`${path.relative(web, file)}: ${decl.trim().slice(0, 90)}`);
      }
    }
    expect(misses).toEqual([]);
  });
});
