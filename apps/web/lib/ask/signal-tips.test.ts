import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flagLabel } from "../flags";
import { RISK_CRITERIA } from "../risk-score";
import { signalTip } from "./signal-tips";

/*
 * Every signal tag explains itself on hover or a tap (owner, 15 November 2026): what the pattern means for an
 * institution or a firm, and what the number after "·" is.
 */
describe("a signal tag's explanation", () => {
  it("exists for every criterion of the risk score, for both roles, under its label", () => {
    for (const role of ["authority", "supplier"] as const) {
      for (const code of RISK_CRITERIA[role]) {
        const tip = signalTip({ code }, role);
        expect(tip?.title).toBe(flagLabel(code));
        // Short: two or three sentences, never the methodology's full rule.
        expect(tip!.text.length).toBeLessThan(330);
        expect(tip!.text).toMatch(/\.$/);
      }
    }
  });

  it("says what the number after \"·\" is: years, a share of the acquisitions, the main partner's share", () => {
    expect(signalTip({ code: "da_split", years: [2021] }, "authority")!.text).toMatch(/ 2021: anul în care apare\.$/);
    expect(signalTip({ code: "da_year_end", years: [2019, 2021, 2022] }, "authority")!.text).toMatch(/ 2019, 2021–2022: anii în care apare\.$/);
    expect(signalTip({ code: "da_round", share: 0.123 }, "supplier")!.text).toMatch(/ 12,3%: cât din achizițiile directe ale firmei sunt imediat sub plafon\.$/);
    expect(signalTip({ code: "da_above_ceiling", share: 0.075 }, "authority")!.text).toMatch(/ 7,5%: cât din achizițiile directe ale instituției sunt peste plafon\.$/);
    expect(signalTip({ code: "da_dependence", share: 0.993 }, "supplier")!.text).toMatch(/ 99,3%: partea acelei instituții\.$/);
    expect(signalTip({ code: "da_dependence", share: 1, single: true }, "supplier")!.text).toMatch(/Un singur client: toate achizițiile directe ale firmei sunt cu aceeași instituție\.$/);
    expect(signalTip({ code: "da_concentration", share: 0.91 }, "authority")!.text).toMatch(/ 91%: partea acelei firme\.$/);
    // No number on the tag, no sentence about one.
    expect(signalTip({ code: "da_capacity" }, "supplier")!.text).toMatch(/lucrarea\.$/);
    expect(signalTip({ code: "da_round" }, "supplier")!.text).toMatch(/sub prag\.$/);
  });

  it("puts the duty to stay under the ceiling on the institution when the profile is a firm", () => {
    expect(signalTip({ code: "da_above_ceiling" }, "supplier")!.text).toContain("Obligația e a instituției, nu a firmei.");
    expect(signalTip({ code: "da_above_ceiling" }, "authority")!.text).not.toContain("Obligația");
    expect(signalTip({ code: "da_split" }, "supplier")!.text).toContain("Aceeași instituție a cumpărat de la firmă");
    expect(signalTip({ code: "da_split" }, "authority")!.text).toContain("Instituția a cumpărat de la aceeași firmă");
  });

  it("explains a stored answer's retired signal as retired, and has nothing for an unknown code", () => {
    expect(signalTip({ code: "da_rapid", share: 0.252 }, "supplier")).toEqual({
      title: "Finalizare rapidă",
      text: expect.stringContaining("a ieșit din scor la 1 noiembrie 2026"),
    });
    expect(signalTip({ code: "nu_exista" }, "supplier")).toBeNull();
  });
});

describe("a signal tag that explains itself", () => {
  it("shows no \"?\" on the tag: the whole tag is the button (owner, 15 November 2026)", () => {
    const css = readFileSync(new URL("../../app/intreaba/builder/filters-kit.css", import.meta.url), "utf8");
    expect(css).toContain(".qb .qb-tag.qb-tag-tip>.term-trigger>.term-mark{display:none}");
  });
});
