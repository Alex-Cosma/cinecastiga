import { describe, expect, it } from "vitest";
import {
  ACCEPTED_AUTHORITY_CUI, AUTHORITY_UAT_CORRECTIONS, BUYER_REGIME_OVERRIDES, REVIEWED_AUTHORITY_NAMES, REVIEWED_FOREIGN_TWIN_MERGES,
  REVIEWED_REGISTRY_COLLISIONS, REVIEWED_SUPPLIER_MERGES, REVIEWED_TOWN_HALL_NAMES, REVIEWED_WINNER_RECORDS,
} from "@seap/db";
import { anchorIn, correctionAnchor, correctionGroups, mergeSource, onrcHolder, winnerSource } from "./seap-corrections";
import { withDatabase } from "./seap-corrections-data";

const groups = correctionGroups();
const all = groups.flatMap((g) => g.rows);

describe("Unde corectăm datele SEAP", () => {
  it("lists every reviewed correction the processing applies, one row each", () => {
    const n = Object.fromEntries(groups.map((g) => [g.kind, g.rows.length]));
    expect(n).toEqual({
      castigator: ACCEPTED_AUTHORITY_CUI.length + REVIEWED_WINNER_RECORDS.length,
      dubluri: REVIEWED_SUPPLIER_MERGES.length,
      straine: REVIEWED_FOREIGN_TWIN_MERGES.length,
      nume: REVIEWED_AUTHORITY_NAMES.length + REVIEWED_TOWN_HALL_NAMES.length,
      localitate: AUTHORITY_UAT_CORRECTIONS.length,
      onrc: REVIEWED_REGISTRY_COLLISIONS.length,
      cumparator: BUYER_REGIME_OVERRIDES.length,
    });
    expect(n.dubluri).toBe(20);
    expect(n.castigator).toBe(12);
  });

  it("reads every evidence note into Romanian; no English note reaches the page", () => {
    for (const m of REVIEWED_SUPPLIER_MERGES) expect(mergeSource(m.evidence), m.evidence).not.toBeNull();
    for (const a of ACCEPTED_AUTHORITY_CUI) expect(winnerSource(a.evidence), a.evidence).not.toBeNull();
    for (const r of all) {
      for (const text of [r.name, r.seap, r.shown, r.why, r.basis]) {
        expect(text, r.key).toBeTruthy();
        expect(text).not.toMatch(/undefined|null|only CUI|natural person|the authority of|foreign id|digits swapped/);
      }
    }
    expect(mergeSource("id RO15034059 (digits swapped), Bucharest; ONRC 15034095 = Telecomunicatii C.F.R. SA, only CUI with this name"))
      .toEqual({ seap: "CUI „RO15034059” (cifre inversate)", onrcName: "Telecomunicatii C.F.R. SA", basis: "ONRC: singurul CUI cu acest nume" });
    expect(mergeSource("no id, Bucharest; ONRC 22000460 = PPC ENERGIE S.A., the renamed Enel Energie")?.basis).toBe("ONRC: aceeași firmă, cu numele nou");
  });

  it("names the other ONRC holder only when it is no person: a person is described, a firm stays unnamed", () => {
    expect(onrcHolder("PFA of a natural person, Cluj")).toBe("unei persoane fizice autorizate (PFA), Cluj");
    expect(onrcHolder("MEGASPEED TRANS SRL")).toBe("altei firme");
    const onrc = groups.find((g) => g.kind === "onrc")!.rows;
    for (const c of REVIEWED_REGISTRY_COLLISIONS) {
      const row = onrc.find((r) => r.entityId === c.entityId)!;
      if (!/natural person/.test(c.onrcName)) expect(JSON.stringify(row)).not.toContain(c.onrcName);
    }
  });

  it("gives every row its own anchor and an entity page its row, by id or else by CUI", () => {
    expect(new Set(all.map((r) => r.key)).size).toBe(all.length);
    const merge = REVIEWED_SUPPLIER_MERGES[0]!;
    expect(correctionAnchor(merge.targetId, null)).toBe("corectura-dubluri-1");
    expect(correctionAnchor("1", BUYER_REGIME_OVERRIDES[0]!.cui)).toBe("corectura-cumparator-1");
    expect(correctionAnchor("1", "0")).toBeNull();
  });

  it("resolves CUIs to entity pages and keeps a reviewed merge only once the processing applied it", () => {
    const cui = BUYER_REGIME_OVERRIDES[0]!.cui;
    const out = withDatabase(groups, { [cui]: "42" }, [REVIEWED_SUPPLIER_MERGES[0]!.sourceId]);
    expect(out.find((g) => g.kind === "cumparator")!.rows[0]!.entityId).toBe("42");
    expect(out.find((g) => g.kind === "dubluri")!.rows.map((r) => r.key)).toEqual(["corectura-dubluri-1"]);
    expect(withDatabase(groups, {}, null).find((g) => g.kind === "dubluri")!.rows).toHaveLength(20);
  });

  it("links an entity page only to a row the section shows", () => {
    // A merge whose firm no other row names: once the processing skipped it, its page has no row to link to.
    const named = (id: string) => groups.flatMap((g) => g.rows).filter((r) => r.entityId === id).length;
    const skipped = REVIEWED_SUPPLIER_MERGES.find((m) => named(m.targetId) === 1)!;
    const shown = withDatabase(groups, {}, REVIEWED_SUPPLIER_MERGES.filter((m) => m !== skipped).map((m) => m.sourceId));
    expect(anchorIn(groups, skipped.targetId, null)).toMatch(/^corectura-dubluri-/);
    expect(anchorIn(shown, skipped.targetId, null)).toBeNull();
    const cui = BUYER_REGIME_OVERRIDES[0]!.cui;
    expect(anchorIn(withDatabase(groups, { [cui]: "42" }, null), "42", null)).toBe("corectura-cumparator-1");
  });
});
