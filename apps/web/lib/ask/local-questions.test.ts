import { describe, expect, it } from "vitest";
import { keptLocalQuestionsNote, LOCAL_QUESTIONS_KEY, readLocalQuestions, readLocalQuestionStore, suggestLocalCopyTitle, writeLocalQuestion } from "./local-questions";

const spec = { block:"table", dim:"supplier", measure:"value", topN:10, filters:{ yearFrom:2022, yearTo:2024, county:"BZ", cpvTerm:"45" } };
function fixture() {
  const data = new Map<string,string>();
  return { getItem:(key:string) => data.get(key) ?? null, setItem:(key:string,value:string) => { data.set(key,value); } };
}
describe("device saved questions", () => {
  it("survives a fresh read with exact filters, no results or credentials", () => {
    const storage = fixture();
    const saved = writeLocalQuestion(storage, { title:"  Lucrări   Buzău ", spec });
    expect(readLocalQuestions(storage)).toEqual([saved]);
    expect(saved.spec.filters).toEqual(spec.filters);
    expect(saved.title).toBe("Lucrări Buzău");
    expect(Object.keys(saved).sort()).toEqual(["id","spec","storage","title","updatedAt","version"]);
  });
  it("rejects duplicate normalized names, including different letter case", () => {
    const storage = fixture();
    writeLocalQuestion(storage, { title:"Lucrări Buzău", spec });
    expect(() => writeLocalQuestion(storage, { title:"  LUCRĂRI   BUZĂU ", spec })).toThrow(/acest nume/);
    expect(readLocalQuestions(storage)).toHaveLength(1);
  });
  it("suggests numbered unique copies without stacking suffixes", () => {
    const storage = fixture();
    writeLocalQuestion(storage, { title:"Lucrări — copie", spec });
    writeLocalQuestion(storage, { title:"Lucrări — copie 2", spec });
    expect(suggestLocalCopyTitle(storage,"Lucrări — copie")).toBe("Lucrări — copie 3");
  });
  it("updates an existing question and refuses stale tab revisions without losing changes", () => {
    const storage = fixture(); const q = writeLocalQuestion(storage, { title:"Lucrări", spec });
    const updated = writeLocalQuestion(storage, { title:q.title, spec:{ ...spec, topN:20 }, expectedVersion:1 }, q.id);
    expect(updated.version).toBe(2);
    expect(() => writeLocalQuestion(storage, { title:q.title, spec, expectedVersion:1 }, q.id)).toThrow(/alt tab/);
    expect(readLocalQuestions(storage)[0]?.spec.topN).toBe(20);
  });
  it.each(["not-json", '{"version":2,"questions":[]}', '{"version":1,"questions":{}}', "null"])("preserves corrupt/unsupported storage %s", raw => {
    const storage = fixture(); storage.setItem(LOCAL_QUESTIONS_KEY,raw);
    expect(() => writeLocalQuestion(storage, { title:"Lucrări", spec })).toThrow(/păstrate/);
    expect(storage.getItem(LOCAL_QUESTIONS_KEY)).toBe(raw);
  });
  // F0a: one item this release cannot read (a newer tab wrote it) never makes the list unreadable or disappears.
  it("skips unreadable items one by one and keeps them exactly when it rewrites the list", () => {
    const storage = fixture(); const ok = writeLocalQuestion(storage, { title:"Lucrări", spec });
    const future = { id:"local:future", title:"Creșteri Buzău", version:3, updatedAt:"2026-11-02T10:00:00Z", spec:{ ...spec, block:"trend", lens:{ x:1 } }, extra:{ kept:true } };
    const broken = { id:"local:broken", title:"", version:0 };
    storage.setItem(LOCAL_QUESTIONS_KEY, JSON.stringify({ version:1, questions:[future, ...JSON.parse(storage.getItem(LOCAL_QUESTIONS_KEY)!).questions, broken] }));
    expect(readLocalQuestionStore(storage)).toEqual({ questions:[ok], kept:[future, broken] });
    expect(readLocalQuestions(storage)).toEqual([ok]);
    writeLocalQuestion(storage, { title:"Nouă", spec });
    expect(JSON.parse(storage.getItem(LOCAL_QUESTIONS_KEY)!).questions.slice(-2)).toEqual([future, broken]);
    // A kept item still holds its name and its place under the limit.
    expect(() => writeLocalQuestion(storage, { title:"CREȘTERI BUZĂU", spec })).toThrow(/acest nume/);
    expect(suggestLocalCopyTitle(storage, "Creșteri Buzău")).toBe("Creșteri Buzău — copie");
  });
  it("lists a question with a key read ahead of the engine, with that key", () => {
    const storage = fixture();
    const saved = writeLocalQuestion(storage, { title:"Lucrări", spec:{ ...spec, filters:{ ...spec.filters, purchaseKind:"lucrari" } } });
    expect(readLocalQuestionStore(storage)).toEqual({ questions:[saved], kept:[] });
    expect(saved.spec.filters.purchaseKind).toBe("lucrari");
  });
  it("says how many items it kept, with the numeral rule", () => {
    expect(keptLocalQuestionsNote(0)).toBeNull();
    expect(keptLocalQuestionsNote(1)).toBe("1 întrebare salvată nu se poate deschide în această versiune a site-ului; am păstrat-o. Reîncarcă pagina.");
    expect(keptLocalQuestionsNote(3)).toBe("3 întrebări salvate nu se pot deschide în această versiune a site-ului; le-am păstrat. Reîncarcă pagina.");
    expect(keptLocalQuestionsNote(20)).toMatch(/^20 de întrebări salvate nu se pot deschide/);
  });
  it("rejects invalid questions before touching storage", () => {
    const storage = fixture();
    expect(() => writeLocalQuestion(storage, { title:"Lucrări", spec:{ block:"bogus" } })).toThrow();
    expect(storage.getItem(LOCAL_QUESTIONS_KEY)).toBeNull();
  });
  it("reports quota and permission errors instead of reporting success", () => {
    const storage = fixture(); const q = writeLocalQuestion(storage, { title:"Lucrări", spec });
    storage.setItem = () => { throw new Error("QuotaExceededError"); };
    expect(() => writeLocalQuestion(storage, { title:"Nouă", spec })).toThrow(/spațiul este plin/);
    expect(readLocalQuestions(storage)).toEqual([q]);
    expect(() => readLocalQuestions({ ...storage, getItem:() => { throw new Error("SecurityError"); } })).toThrow(/nu permite/);
  });
  it("does not silently evict old questions at the capacity limit", () => {
    const storage = fixture();
    storage.setItem(LOCAL_QUESTIONS_KEY,JSON.stringify({ version:1, questions:Array.from({length:200},(_,i) => ({ id:`local:${i}`, title:`Întrebare ${i}`, version:1, spec, updatedAt:"2026-09-30T10:00:00Z" })) }));
    expect(() => writeLocalQuestion(storage, { title:"Nouă", spec })).toThrow(/limita de 200/);
    expect(readLocalQuestions(storage)).toHaveLength(200);
    expect(writeLocalQuestion(storage, { title:"Actualizată", spec, expectedVersion:1 }, "local:0").version).toBe(2);
  });
});
