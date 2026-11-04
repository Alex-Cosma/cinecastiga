import { describe, expect, it } from "vitest";
import { readFilters, writeFilters } from "./table-filters/codec";
import { TED_COLUMNS } from "./ted-columns";
import { LOT_COLUMNS } from "./notice-lots-columns";

const read = (search: string) => {
  const p = new URLSearchParams(search);
  return readFilters(TED_COLUMNS, (k) => p.get(k));
};

describe("/supra-prag's filters in the address", () => {
  it("still reads the old links and writes the funnels' parameters", () => {
    expect(read("?extern=1")).toEqual({ tara: { kind: "options", values: ["strain"] } });
    expect(read("?extern=1&tara=DE")).toEqual({ tara: { kind: "options", values: ["DE"] } });
    expect(read("?tara=neclar").tara).toEqual({ kind: "options", values: ["neclar"] });
    expect(read("?unic=1").oferte).toEqual({ kind: "options", values: ["unu"] });
    expect(read(`?${encodeURIComponent("etichetă")}=ted-only`).potrivire).toEqual({ kind: "options", values: ["ted-only"] });
    expect(writeFilters(TED_COLUMNS, "?extern=1&tara=DE&sort=value&p=3", read("?extern=1&tara=DE"))).toBe("?sort=value&p=3&tara=DE");
  });

  it("drops what no funnel offers", () => {
    expect(read("?tara=Germany&oferte=doua&potrivire=maybe&procedura=%3Cscript%3E")).toEqual({});
  });

  it("reads a notice's record filters", () => {
    const p = new URLSearchParams("?tip=calloff,framework&castigator=7&an=2020&valoare=..50000");
    expect(Object.keys(readFilters(LOT_COLUMNS, (k) => p.get(k)))).toEqual(["tip", "castigator", "data", "valoare"]);
  });
});
