import { SCORE_CODE } from "../../score-code.generated";

// /metodologie/cod/<file>: one of the score's source files as plain text (owner, 9 November 2026: the code is shown on
// /metodologie, not linked to the repository). The page loads it when its section opens, so readers who never open
// it don't download ~45 KB of code; constants.json names it as its `source`.
export const dynamic = "force-static";
export const dynamicParams = false;

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function generateStaticParams() {
  return SCORE_CODE.map((f) => ({ file: fileName(f.path) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  const code = SCORE_CODE.find((f) => fileName(f.path) === file);
  if (!code) return new Response("Fișierul nu există.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(code.source, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
