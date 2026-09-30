import { describe, expect, it } from "vitest";
import { LOCAL_QUESTIONS_KEY, readLocalQuestions, suggestLocalCopyTitle, writeLocalQuestion } from "./local-questions";

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
  it.each(["not-json", '{"version":2,"questions":[]}', '{"version":1,"questions":[{}]}'])("preserves corrupt/unsupported storage %s", raw => {
    const storage = fixture(); storage.setItem(LOCAL_QUESTIONS_KEY,raw);
    expect(() => writeLocalQuestion(storage, { title:"Lucrări", spec })).toThrow(/păstrate/);
    expect(storage.getItem(LOCAL_QUESTIONS_KEY)).toBe(raw);
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
