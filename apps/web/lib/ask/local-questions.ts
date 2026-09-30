import { recipeInput } from "./recipe-input";
import { copyRecipeTitle, normalizeRecipeTitle } from "./recipe-title";
import { validateSpec } from "./spec";
import type { QuestionSpec } from "./question-ui";

export const LOCAL_QUESTIONS_KEY = "cinecastiga.saved-questions.v1";
export const LOCAL_QUESTIONS_EVENT = "cinecastiga:saved-questions";
export type LocalQuestion = { id:string; title:string; version:number; spec:QuestionSpec; updatedAt:string; storage:"local" };
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export class LocalQuestionError extends Error {
  constructor(message:string, public code?:string) { super(message); }
}
const unavailable = () => new LocalQuestionError("Browserul nu permite salvarea locală sau spațiul este plin. Permite stocarea pentru acest site ori salvează într-un cont.");
const damaged = () => new LocalQuestionError("Lista locală nu poate fi citită. Datele existente au fost păstrate; încearcă din nou în browserul în care ai salvat întrebările.");

export function localQuestionStorage():Storage {
  try { return window.localStorage; } catch { throw unavailable(); }
}

export function readLocalQuestions(storage:StorageAccess):LocalQuestion[] {
  let raw:string | null;
  try { raw = storage.getItem(LOCAL_QUESTIONS_KEY); } catch { throw unavailable(); }
  if (raw === null) return [];
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.questions) || data.questions.length > 200) throw damaged();
    const ids = new Set<string>(); const titles = new Set<string>();
    return data.questions.map((item:LocalQuestion) => {
      if (!item || typeof item.id !== "string" || !item.id.startsWith("local:") || ids.has(item.id) || typeof item.title !== "string" ||
        !item.title.trim() || item.title.length > 160 || !Number.isSafeInteger(item.version) || item.version < 1 ||
        typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt))) throw damaged();
      const title = normalizeRecipeTitle(item.title); const key = title.toLocaleLowerCase("ro-RO");
      const spec = validateSpec(item.spec);
      if ("error" in spec || titles.has(key)) throw damaged();
      ids.add(item.id); titles.add(key);
      // Whitelist fields: never retain results, account data, or arbitrary payloads.
      return { id:item.id, title, version:item.version, spec:spec as QuestionSpec, updatedAt:item.updatedAt, storage:"local" as const };
    }).sort((a:LocalQuestion,b:LocalQuestion) => b.updatedAt.localeCompare(a.updatedAt));
  } catch { throw damaged(); }
}

export function suggestLocalCopyTitle(storage:StorageAccess, title:string):string {
  const titles = new Set(readLocalQuestions(storage).map(item => item.title.toLocaleLowerCase("ro-RO")));
  for (let n=1; ; n++) { const candidate = copyRecipeTitle(title,n); if (!titles.has(candidate.toLocaleLowerCase("ro-RO"))) return candidate; }
}

/** Call under the browser's origin-wide Web Lock; the synchronous fallback never awaits mid-write. */
export function writeLocalQuestion(storage:StorageAccess, raw:unknown, id?:string):LocalQuestion {
  const input = recipeInput(raw, !!id);
  if ("error" in input) throw new LocalQuestionError(input.error);
  const items = readLocalQuestions(storage);
  const previous = id ? items.find(item => item.id === id) : undefined;
  if (id && (!previous || previous.version !== input.expectedVersion)) throw new LocalQuestionError("Întrebarea a fost modificată în alt tab. Redeschide-o din „Salvate” sau salvează o copie.", "conflict");
  if (items.some(item => item.id !== id && item.title.toLocaleLowerCase("ro-RO") === input.title.toLocaleLowerCase("ro-RO")))
    throw new LocalQuestionError("Ai deja o întrebare cu acest nume pe dispozitiv. Alege un nume diferit.", "title_taken");
  if (!id && items.length >= 200) throw new LocalQuestionError("Ai atins limita de 200 de întrebări pe dispozitiv. Poți actualiza una existentă sau salva într-un cont.");
  const question:LocalQuestion = { id:id ?? `local:${crypto.randomUUID()}`, title:input.title, version:(previous?.version ?? 0)+1,
    spec:input.spec as QuestionSpec, updatedAt:new Date().toISOString(), storage:"local" };
  try { storage.setItem(LOCAL_QUESTIONS_KEY, JSON.stringify({ version:1, questions:[question, ...items.filter(item => item.id !== id)] })); }
  catch { throw unavailable(); }
  return question;
}

export async function saveLocalQuestion(raw:unknown, id?:string):Promise<LocalQuestion> {
  const write = () => { try { return writeLocalQuestion(localQuestionStorage(), raw, id); } catch (error) { throw error instanceof LocalQuestionError ? error : unavailable(); } };
  const question = navigator.locks ? await navigator.locks.request(LOCAL_QUESTIONS_KEY, write) : write();
  window.dispatchEvent(new Event(LOCAL_QUESTIONS_EVENT));
  return question;
}
