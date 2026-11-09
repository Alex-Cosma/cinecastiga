import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codeLines } from "./code-lines";
import { GET, generateStaticParams } from "./cod/[file]/route";
import { SCORE_CODE } from "./score-code.generated";

const root = join(__dirname, "../../../..");

describe("the score's code on /metodologie (owner, 9 November 2026)", () => {
  it("is the code that runs: regenerate with `pnpm --filter web methodology-code` after changing it", () => {
    expect(SCORE_CODE.map((f) => f.path)).toEqual(["packages/db/src/profile-flags.ts", "apps/ingestion/src/flags/score.ts"]);
    for (const file of SCORE_CODE) expect(file.source, file.path).toBe(readFileSync(join(root, file.path), "utf8"));
  });

  it("serves each file as text at /metodologie/cod/<name>, and nothing else", async () => {
    expect(generateStaticParams()).toEqual([{ file: "profile-flags.ts" }, { file: "score.ts" }]);
    const read = (file: string) => GET(new Request(`http://x/metodologie/cod/${file}`), { params: Promise.resolve({ file }) });
    const score = await read("score.ts");
    expect(score.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await score.text()).toBe(SCORE_CODE[1]!.source);
    expect((await read("package.json")).status).toBe(404);
  });

  it("keeps every character and every line of the file", () => {
    for (const file of SCORE_CODE) {
      const lines = codeLines(file.source);
      const text = file.source.replace(/\n$/, "");
      expect(lines.map((line) => line.map((p) => p.text).join("")).join("\n")).toBe(text);
      expect(lines).toHaveLength(text.split("\n").length);
    }
  });

  it("colours comments, strings, numbers and keywords, across lines too", () => {
    const lines = codeLines("// note\nconst a = 'x // y' + 12;\n/* two\nlines */ `sql\nfrom t`");
    const kinds = lines.map((line) => line.filter((p) => p.kind).map((p) => `${p.kind}:${p.text}`));
    expect(kinds).toEqual([
      ["comment:// note"],
      ["keyword:const", "string:'x // y'", "number:12"],
      ["comment:/* two"],
      ["comment:lines */", "string:`sql"],
      ["string:from t`"],
    ]);
  });
});
