import { describe, expect, it } from "vitest";
import { validateSpec, type AskSpec } from "./spec";
import { isHistoricalProfile, validatePopulation, type QueryPopulation } from "./population";
import { cloneQuestion, questionKey, transitionQuestion, type QuestionSpec } from "./question-ui";
import { recipeInput } from "./recipe-input";
import { entitySourceLink } from "./source-spec";
import { decodeSpec } from "./permalink";

const population:QueryPopulation = { operator:"or", groups:[
  { operator:"and", conditions:[{ field:"date", op:"gte", value:"2025-01-01" }, { field:"value", op:"lte", value:"9007199254740993.0101" }] },
  { operator:"and", conditions:[{ field:"supplier", op:"in", values:["10","11"], labels:["Firma A", "Firma B"] }, { field:"cpv", op:"not_in", values:["45"] }] },
] };
const query:AskSpec = { block:"stat", measure:"value", filters:{ county:"Cluj" }, population, minimumRecords:{ role:"supplier", count:2 } };
describe("portable investigative populations", () => {
  it("retains exact decimal strings, named entity sets and grouped AND/OR", () => expect(validateSpec(query)).toEqual(query));
  it.each([
    { operator:"and", groups:[] }, { ...population, sql:"select 1" },
    { operator:"and", groups:[{ operator:"and", conditions:[{ field:"date", op:"gte", value:"2025-02-29" }] }] },
    { operator:"and", groups:[{ operator:"and", conditions:[{ field:"value", op:"gte", value:"1e8" }] }] },
    { operator:"and", groups:[{ operator:"and", conditions:[{ field:"supplier", op:"in", values:["1 OR 1=1"] }] }] },
    { operator:"and", groups:[{ operator:"and", conditions:[{ field:"cpv", op:"in", values:["45%"] }] }] },
    { operator:"and", groups:Array.from({ length:5 }, () => ({ operator:"and", conditions:Array.from({ length:8 }, () => ({ field:"value", op:"gte", value:"1" })) })) },
  ])("rejects malformed or unbounded predicates without dropping them", raw => expect(validatePopulation(raw)).toHaveProperty("error"));
  it("preserves population and minimum counts through compatible view changes and deep cloning", () => {
    for (const block of ["table", "timeseries", "map", "breakdown", "compare", "network", "sankey", "fact_check"]) {
      const next = transitionQuestion(query as QuestionSpec, block).spec;
      expect(next.population).toEqual(population); expect(next.minimumRecords).toEqual(query.minimumRecords);
      expect(next.filters).toEqual(query.filters);
    }
    const cloned = cloneQuestion(query as QuestionSpec); cloned.population!.groups[0]!.conditions.splice(0,1);
    expect(query.population!.groups[0]!.conditions).toHaveLength(2);
    expect(questionKey(query as QuestionSpec)).not.toBe(questionKey(cloned));
  });
  it("distinguishes legacy historical comparisons and explicitly scoped comparisons", () => {
    const compare = { ...query, block:"compare", filters:{ authorityId:1, compareWithId:2 } };
    expect(isHistoricalProfile(compare)).toBe(true);
    expect(validateSpec(compare)).toHaveProperty("error");
    expect(validateSpec({ ...compare, comparisonMode:"transactions" })).not.toHaveProperty("error");
  });
  it("rejects historical population filters and invalid aggregate thresholds", () => {
    for (const block of ["distribution", "scatter", "entity_card"]) expect(validateSpec({ ...query, block, filters:{ authorityId:1 } })).toHaveProperty("error");
    for (const count of [0,-1,1.1,1000001,"2"]) expect(validateSpec({ ...query, minimumRecords:{ role:"supplier", count } })).toHaveProperty("error");
    expect(validateSpec({ ...query, block:"trend", dim:"supplier", filters:{ yearFrom:2024, yearTo:2025 } })).toHaveProperty("error");
  });
  it("saves full validated conditions and requires an explicit parent revision", () => {
    expect(recipeInput({ title:"  Verificarea mea  ", spec:query })).toMatchObject({ title:"Verificarea mea", spec:query, note:null });
    expect(recipeInput({ title:"Rețetă", spec:query },true)).toHaveProperty("error");
    expect(recipeInput({ title:"Rețetă", spec:query, expectedVersion:2 },true)).toMatchObject({ expectedVersion:2, spec:query });
    expect(recipeInput({ title:"Rețetă", spec:{ ...query, population:{ sql:"anything" } } })).toHaveProperty("error");
  });
  it("chart-source links intersect the original query without recalculating a narrower >=N cohort", () => {
    const spec:AskSpec = { ...query, block:"table", dim:"authority" };
    const params = new URL(entitySourceLink(spec,{ entityId:"1", name:"Instituție" }),"https://example.test").searchParams;
    expect(decodeSpec(params.get("spec")!)).toEqual(spec);
    expect(JSON.parse(params.get("evidence")!)).toEqual({ role:"authority", entityIds:["1"] });
  });
});
