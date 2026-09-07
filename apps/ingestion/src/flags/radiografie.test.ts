import { describe, expect, it } from "vitest";
import { detectPatterns } from "./radiografie.js";

type Row = Parameters<typeof detectPatterns>[0][number];

let cid = 0;
const row = (
  notice: string,
  d: string,
  suppliers: [string, string][],
  opts: { single?: boolean | null; cls?: string; v?: number; contract?: string } = {},
): Row[] => {
  const contract = opts.contract ?? String(++cid);
  return suppliers.map(([id, name]) => ({
    authority_id: "1",
    notice_no: notice,
    contract_id: contract,
    supplier_id: id,
    supplier_name: name,
    cls: opts.cls ?? "4545",
    d,
    n_winners: suppliers.length,
    single: opts.single ?? null,
    vfull: String(opts.v ?? 1_000_000),
    v: String(opts.v ?? 1_000_000),
  }));
};

describe("detectPatterns", () => {
  it("finds a rotation: same firms, one lot each, in two lot tenders", () => {
    const firms: [string, string][] = [["10", "A"], ["11", "B"], ["12", "C"], ["13", "D"]];
    const rows = [
      ...firms.flatMap((f) => row("N1", "2022-07-06", [f], { single: true })),
      ...firms.flatMap((f) => row("N2", "2024-09-09", [f], { single: false })),
    ];
    const out = detectPatterns(rows);
    const rot = out.find((p) => p.kind === "rotatie");
    expect(rot).toBeDefined();
    expect(rot!.member_ids).toEqual(["10", "11", "12", "13"]);
    expect(rot!.reps).toBe(2);
    expect(rot!.single).toBe(4);
    expect(rot!.known).toBe(8);
    expect(rot!.strength).toBe("puternic");
  });

  it("treats a consortium as one winner, not as lots", () => {
    // one contract, three names → not a 3-lot tender, no cake, no group
    const rows = [
      ...row("N1", "2023-03-16", [["20", "X"], ["21", "Y"], ["22", "Z"]], { single: true }),
      ...row("N2", "2023-05-09", [["20", "X"], ["21", "Y"], ["22", "Z"]]),
    ];
    const out = detectPatterns(rows);
    expect(out.filter((p) => p.kind === "rotatie")).toHaveLength(0);
    // and becomes a stable consortium from 3 tenders
    const more = [...rows, ...row("N3", "2024-01-01", [["20", "X"], ["21", "Y"], ["22", "Z"]])];
    const cons = detectPatterns(more).find((p) => p.kind === "consortiu");
    expect(cons).toBeDefined();
    expect(cons!.reps).toBe(3);
    expect(cons!.set_key).toBe("20+21+22");
  });

  it("finds a sweep only when it repeats", () => {
    const one = [
      ...row("N1", "2020-05-01", [["30", "S"]]),
      ...row("N1", "2020-05-01", [["30", "S"]]),
      ...row("N1", "2020-05-01", [["30", "S"]]),
    ];
    expect(detectPatterns(one).filter((p) => p.kind === "maturare")).toHaveLength(0);
    const two = [
      ...one,
      ...row("N2", "2021-05-01", [["30", "S"]]),
      ...row("N2", "2021-05-01", [["30", "S"]]),
      ...row("N2", "2021-05-01", [["30", "S"]]),
    ];
    const sw = detectPatterns(two).find((p) => p.kind === "maturare");
    expect(sw).toBeDefined();
    expect(sw!.reps).toBe(2);
    expect(sw!.strength).toBe("mediu");
  });

  it("finds a two-firm split only when they take all lots together", () => {
    const rows = [
      ...row("N1", "2024-09-01", [["40", "T"]]),
      ...row("N1", "2024-09-01", [["41", "K"]]),
      ...row("N1", "2024-09-01", [["41", "K"]]),
      ...row("N2", "2025-12-01", [["40", "T"]]),
      ...row("N2", "2025-12-01", [["41", "K"]]),
      ...row("N2", "2025-12-01", [["40", "T"]]),
    ];
    const sp = detectPatterns(rows).find((p) => p.kind === "impartire");
    expect(sp).toBeDefined();
    expect(sp!.member_ids).toEqual(["40", "41"]);
    // a third firm taking a lot in N2 breaks "all lots"
    const broken = [...rows, ...row("N2", "2025-12-01", [["42", "Q"]])];
    expect(detectPatterns(broken).filter((p) => p.kind === "impartire")).toHaveLength(0);
  });
});
