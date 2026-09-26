import { NextResponse } from "next/server";
import { WorkspaceError } from "./investigation-workspace";

export function workspaceOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new WorkspaceError("Cererea nu provine din aplicație.", 403);
}
export async function workspaceBody(req: Request): Promise<Record<string, unknown>> {
  workspaceOrigin(req);
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new WorkspaceError("Trimite date JSON.", 415);
  if (Number(req.headers.get("content-length")) > 65536) throw new WorkspaceError("Textul trimis este prea lung.", 413);
  const text = await req.text();
  if (Buffer.byteLength(text) > 65536) throw new WorkspaceError("Textul trimis este prea lung.", 413);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new WorkspaceError("Datele trimise nu sunt valide."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceError("Datele trimise nu sunt valide.");
  return value as Record<string, unknown>;
}
export async function workspaceResponse(work: () => Promise<unknown>) {
  try { return NextResponse.json(await work(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) {
    const conflict = (error as { code?: string }).code === "40001" || (error as { code?: string }).code === "40P01";
    return NextResponse.json({ error: error instanceof WorkspaceError ? error.message : conflict ? "Dosarul a fost modificat între timp. Reîncarcă și încearcă din nou." : "Nu am putut salva modificarea. Încearcă din nou." },
      { status: error instanceof WorkspaceError ? error.status : conflict ? 409 : 500 });
  }
}
