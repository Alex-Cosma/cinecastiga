import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";
import { withPeerGroup } from "./server";
import { BUZAU_DIALOG } from "../ask/fixtures/distribution-screen";
import type { PeerDialogData } from "../ask/peer-groups-shared";

/*
 * F6a in words (plan §2.7 "distribuție", final distribution §4.2, §7.12): the
 * rule's own phrases tick the group ("de mărimea lui", "de același tip", "cu
 * activitate apropiată"); a new distribution ticks the sure group by default,
 * unless the words ask for the whole country; "din județul lui" ticks the
 * entity's own county.
 */

const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
async function ask(q: string) {
  return resultFor(await interpreter.interpret(q, { now: NOW }));
}
/** A transaction that only sets its timeout; the window's read is the fixture's (peer-groups.ts peerDialog). */
const sql = { begin: async (_mode: string, work: (tx: DbSql) => Promise<unknown>) => work({ unsafe: async () => [] } as unknown as DbSql) } as unknown as DbSql;
const dialog = (data: PeerDialogData) => async () => structuredClone(data);

describe("the distribution's group in words", () => {
  it("ticks «același tip» from the rule's own phrase, and says where it does not apply", async () => {
    const r = await ask("semnale la primaria buzau fata de primariile de marimea ei");
    expect(r.spec).toMatchObject({ block: "distribution", filters: { authorityId: 2144364 }, peers: { similar: true } });
    const activity = await ask("semnale la primaria buzau cu activitate asemanatoare");
    expect(activity.spec).toMatchObject({ block: "distribution", peers: { activity: true } });
    // On another question the words say that they were not applied.
    const ranking = await ask("cine castiga in judetul buzau de acelasi tip");
    expect(ranking.spec?.peers).toBeUndefined();
  });

  it("ticks the sure group of a new distribution, the whole country when the words say it (final §4.2)", async () => {
    const r = await ask("semnale la primaria buzau");
    const ticked = await withPeerGroup(sql, r, dialog(BUZAU_DIALOG));
    expect(ticked.spec?.peers).toEqual({ similar: true });
    expect(ticked.sentence).toBe("Unde se situează MUNICIPIUL BUZAU după indicele de risc, față de primăriile cu 52–207 mii de locuitori?");
    // The whole country said in words: no default, no read.
    const national = await ask("semnale la primaria buzau la nivel national");
    expect(await withPeerGroup(sql, national, async () => { throw new Error("read"); })).toBe(national);
    // "din județul lui": the entity's own county; with the population band it would leave none, so the county alone.
    const county = await withPeerGroup(sql, await ask("semnale la primaria buzau fata de cele din judetul ei"), dialog(BUZAU_DIALOG));
    expect([county.spec?.peers, county.spec?.filters.county]).toEqual([undefined, "Buzău"]);
    // Without the database the question stays as interpreted.
    const failing = { begin: async () => { throw new Error("no database"); } } as unknown as DbSql;
    expect(await withPeerGroup(failing, r)).toBe(r);
  });
});
