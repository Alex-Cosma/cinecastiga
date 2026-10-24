import { recipeInput } from "./recipe-input";
import { copyRecipeTitle, normalizeRecipeTitle } from "./recipe-title";
import { unimplementedSpecKeys, validateSpec } from "./spec";
import { countWords } from "./answer-text";
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

/**
 * The device list. An item this release cannot read (a newer tab wrote it, or
 * an older rule no longer accepts it) is skipped one by one and kept exactly as
 * stored: it never makes the whole list unreadable and a rewrite never drops it.
 * `newer` counts the items a newer release wrote (listed with a key read ahead,
 * or kept with a key unknown here): a reload may bring that release. The other
 * kept items are `unreadable` (damaged, or refused by today's rules).
 */
export type LocalQuestionStore = { questions:LocalQuestion[]; kept:unknown[]; newer:number; unreadable:number };
const titleKey = (title:string) => normalizeRecipeTitle(title).toLocaleLowerCase("ro-RO");
/** Keys this release does not apply: the question cannot open here, a newer release wrote it. */
export const newerQuestion = (spec:unknown):boolean => unimplementedSpecKeys(spec).length > 0;
export function readLocalQuestionStore(storage:StorageAccess):LocalQuestionStore {
  let raw:string | null;
  try { raw = storage.getItem(LOCAL_QUESTIONS_KEY); } catch { throw unavailable(); }
  if (raw === null) return { questions:[], kept:[], newer:0, unreadable:0 };
  let data:{ version?:unknown; questions?:unknown };
  try { data = JSON.parse(raw); } catch { throw damaged(); }
  if (!data || data.version !== 1 || !Array.isArray(data.questions) || data.questions.length > 200) throw damaged();
  const ids = new Set<string>(); const titles = new Set<string>();
  const questions:LocalQuestion[] = []; const kept:unknown[] = [];
  let newer = 0, keptNewer = 0;
  for (const item of data.questions as LocalQuestion[]) {
    const valid = !!item && typeof item.id === "string" && item.id.startsWith("local:") && !ids.has(item.id) && typeof item.title === "string" &&
      !!item.title.trim() && item.title.length <= 160 && Number.isSafeInteger(item.version) && item.version >= 1 &&
      typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt)) && !titles.has(titleKey(item.title));
    let spec:ReturnType<typeof validateSpec> | null = null;
    // Whatever one stored spec holds, only that item is skipped.
    try { spec = valid ? validateSpec(item.spec) : null; } catch { spec = null; }
    if (!spec || "error" in spec) {
      kept.push(item);
      if (valid && newerQuestion(item.spec)) { newer++; keptNewer++; }
      continue;
    }
    if (newerQuestion(spec)) newer++;
    ids.add(item.id); titles.add(titleKey(item.title));
    // Whitelist fields: never retain results, account data, or arbitrary payloads.
    questions.push({ id:item.id, title:normalizeRecipeTitle(item.title), version:item.version, spec:spec as QuestionSpec, updatedAt:item.updatedAt, storage:"local" });
  }
  return { questions:questions.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), kept, newer, unreadable:kept.length - keptNewer };
}
export function readLocalQuestions(storage:StorageAccess):LocalQuestion[] {
  return readLocalQuestionStore(storage).questions;
}
/** Under the list: what cannot be opened here. A reload helps only the items of a newer release. */
export function keptLocalQuestionsNote({ newer, unreadable }:Pick<LocalQuestionStore, "newer" | "unreadable">):string | null {
  const notes:string[] = [];
  if (newer) notes.push(`${countWords(newer, "întrebare salvată", "întrebări salvate")} ${newer === 1 ? "vine" : "vin"} dintr-o versiune mai nouă a site-ului; ${newer === 1 ? "am păstrat-o" : "le-am păstrat"}. Reîncarcă pagina.`);
  if (unreadable) notes.push(`${countWords(unreadable, "întrebare salvată", "întrebări salvate")} ${unreadable === 1 ? "nu poate fi citită; am păstrat-o neschimbată" : "nu pot fi citite; le-am păstrat neschimbate"}.`);
  return notes.length ? notes.join(" ") : null;
}
/** Titles held by kept items stay taken, so a rewrite cannot create a duplicate the newer release would refuse. */
const keptTitles = (kept:unknown[]) => kept.flatMap(item => {
  const title = (item as { title?:unknown } | null)?.title;
  return typeof title === "string" && title.trim() ? [titleKey(title)] : [];
});

export function suggestLocalCopyTitle(storage:StorageAccess, title:string):string {
  const store = readLocalQuestionStore(storage);
  const titles = new Set([...store.questions.map(item => item.title.toLocaleLowerCase("ro-RO")), ...keptTitles(store.kept)]);
  for (let n=1; ; n++) { const candidate = copyRecipeTitle(title,n); if (!titles.has(candidate.toLocaleLowerCase("ro-RO"))) return candidate; }
}

/** Call under the browser's origin-wide Web Lock; the synchronous fallback never awaits mid-write. */
export function writeLocalQuestion(storage:StorageAccess, raw:unknown, id?:string):LocalQuestion {
  const input = recipeInput(raw, !!id);
  if ("error" in input) throw new LocalQuestionError(input.error);
  const { questions:items, kept } = readLocalQuestionStore(storage);
  const previous = id ? items.find(item => item.id === id) : undefined;
  if (id && (!previous || previous.version !== input.expectedVersion)) throw new LocalQuestionError("Întrebarea a fost modificată în alt tab. Redeschide-o din „Salvate” sau salvează o copie.", "conflict");
  if (items.some(item => item.id !== id && item.title.toLocaleLowerCase("ro-RO") === input.title.toLocaleLowerCase("ro-RO")) ||
    keptTitles(kept).includes(input.title.toLocaleLowerCase("ro-RO")))
    throw new LocalQuestionError("Ai deja o întrebare cu acest nume pe dispozitiv. Alege un nume diferit.", "title_taken");
  if (!id && items.length + kept.length >= 200) throw new LocalQuestionError("Ai atins limita de 200 de întrebări pe dispozitiv. Poți actualiza una existentă sau salva într-un cont.");
  const question:LocalQuestion = { id:id ?? `local:${crypto.randomUUID()}`, title:input.title, version:(previous?.version ?? 0)+1,
    spec:input.spec as QuestionSpec, updatedAt:new Date().toISOString(), storage:"local" };
  // Kept items go back exactly as they were read.
  try { storage.setItem(LOCAL_QUESTIONS_KEY, JSON.stringify({ version:1, questions:[question, ...items.filter(item => item.id !== id), ...kept] })); }
  catch { throw unavailable(); }
  return question;
}

export async function saveLocalQuestion(raw:unknown, id?:string):Promise<LocalQuestion> {
  const write = () => { try { return writeLocalQuestion(localQuestionStorage(), raw, id); } catch (error) { throw error instanceof LocalQuestionError ? error : unavailable(); } };
  const question = navigator.locks ? await navigator.locks.request(LOCAL_QUESTIONS_KEY, write) : write();
  window.dispatchEvent(new Event(LOCAL_QUESTIONS_EVENT));
  return question;
}
