import { validateSpec, type AskSpec } from "./spec";

export interface RecipeInput { title: string; note: string | null; spec: AskSpec; expectedVersion?: number }
export function recipeInput(raw: unknown, revision = false): RecipeInput | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error:"Conținut invalid." };
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some(key => !["title", "note", "spec", "expectedVersion"].includes(key))) return { error:"Câmp necunoscut în rețetă." };
  if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 160) return { error:"Alege un titlu de cel mult 160 de caractere." };
  if (body.note != null && (typeof body.note !== "string" || body.note.length > 1000)) return { error:"Nota versiunii poate avea cel mult 1.000 de caractere." };
  if (JSON.stringify(body.spec ?? {}).length > 64000) return { error:"Întrebarea este prea mare." };
  const spec = validateSpec(body.spec);
  if ("error" in spec) return spec;
  if (revision && (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1)) return { error:"Lipsește versiunea de la care pornești. Redeschide rețeta." };
  return { title:body.title.trim(), note:typeof body.note === "string" ? body.note.trim() || null : null, spec,
    ...(revision ? { expectedVersion:Number(body.expectedVersion) } : {}) };
}
export const recipeIdValid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
