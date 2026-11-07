import { describe, expect, it } from "vitest";
import { humanTitle, privateDay, privateMoment, privatePeriod, uniqueNotes, yearRuns } from "./private-format";

describe("private space formats (owner, 7 November 2026)", () => {
  it("writes days as dd.mm.yyyy in București, calendar dates as written", () => {
    expect(privateDay("2026-11-07")).toBe("07.11.2026");
    expect(privateDay("2026-11-06T23:30:00Z")).toBe("07.11.2026");
    expect(privateDay("2026-11-07 10:16:23.152885+00")).toBe("07.11.2026");
    expect(privateDay(null)).toBe("Dată necunoscută");
    expect(privateDay("nu e o dată", "—")).toBe("—");
  });
  it("adds the hour only where it matters", () => {
    expect(privateMoment("2026-11-07 10:16:23.152885+00")).toBe("07.11.2026, 12:16");
    expect(privateMoment(undefined)).toBe("Încă neverificată");
  });
  it("states a period once when it is one day", () => {
    expect(privatePeriod("2018-04-03", "2026-09-25")).toBe("03.04.2018 – 25.09.2026");
    expect(privatePeriod("2026-09-25", "2026-09-25")).toBe("25.09.2026");
    expect(privatePeriod(null, "2026-09-25")).toBeNull();
  });
  it("says each limit once, three in view", () => {
    const notes = ["Valori înregistrate, nu plăți.", "valori înregistrate,  nu plăți", "A", "B", "C", 4];
    expect(uniqueNotes(notes)).toEqual({ shown: ["Valori înregistrate, nu plăți.", "A", "B"], rest: ["C"], all: ["Valori înregistrate, nu plăți.", "A", "B", "C"] });
  });
  it("joins consecutive years", () => {
    expect(yearRuns(["2025", "2018", "2019", "2020", "2021", "2023", "2024", "2025"])).toBe("2018–2021, 2023–2025");
    expect(yearRuns([2020])).toBe("2020");
    expect(yearRuns([])).toBe("");
  });
  it("puts the source's capitals into ordinary case, keeping short acronyms", () => {
    expect(humanTitle("Cât valorează achizițiile făcute de ORASUL ODOBESTI (CONSILIUL LOCAL al ORASULUI ODOBESTI)?"))
      .toBe("Cât valorează achizițiile făcute de Orasul Odobesti (Consiliul Local al Orasului Odobesti)?");
    expect(humanTitle("METCON GEONED S.R.L. SA CJ ȘCOALA")).toBe("Metcon Geoned S.R.L. SA CJ Școala");
  });
});
