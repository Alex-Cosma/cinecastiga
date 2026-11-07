import { canonicalEntityId, createDb, type DbSql } from "@seap/db";
import { getCompanyReps, getEntityFlagEvidence, getEntityFlags, getRegistryCui } from "./marts";
import { flagLabel } from "./flags";

/*
 * "Fapte din registre" on a firm's (or an institution's) evidence card in a dossier (owner, 7 November 2026): the
 * registry facts a reader would otherwise open the entity page for, each with its source and its year, in one click.
 * The same readers as the entity page (corroborated CUI only: a foreign number never brings another firm's facts).
 * These are today's registry rows, not part of the frozen capture: the card says so.
 */

const globalDb = globalThis as unknown as { __dossierRegistrySql?: DbSql };
const db = () => globalDb.__dossierRegistrySql ??= createDb().sql;

export interface RegistryYear { year: number; employees: number | null; turnoverExact: string | null }
export interface RegistryPerson { name: string; role: string | null }
export interface RegistrySignal { code: string; label: string; years: string[] }
export interface RegistryFacts {
  entityId: string;
  name: string | null;
  cui: string | null;
  /** MF balance sheets, newest first (only the years with employees or turnover). */
  financials: RegistryYear[];
  /** ONRC representatives in the latest monthly snapshot, with that snapshot's date. */
  administrators: { snapshotDate: string | null; people: RegistryPerson[] };
  /** The signals the entity's risk profile carries today, with the years of their occurrences. */
  signals: RegistrySignal[];
}

export async function readRegistryFacts(entityId: string, sql: DbSql = db()): Promise<RegistryFacts | null> {
  if (!/^\d+$/.test(entityId)) return null;
  const id = String(await canonicalEntityId(sql, entityId));
  const [entity] = await sql`select name_display from core.entities where id = ${id}`;
  if (!entity) return null;
  const cui = await getRegistryCui(id);
  const [financials, reps, snapshot, flags, evidence] = await Promise.all([
    cui ? sql`select year, employees, net_turnover::text turnover from reference.company_financials
      where cui = ${cui} and (employees is not null or net_turnover is not null) order by year desc` : Promise.resolve([]),
    cui ? getCompanyReps(cui) : Promise.resolve([]),
    cui ? sql`select max(snapshot_date)::text d from reference.company_reps where cui = ${cui}` : Promise.resolve([]),
    getEntityFlags(id),
    getEntityFlagEvidence(id),
  ]);
  const codes = [...new Set(flags.flatMap((row) => row.flags))];
  return {
    entityId: id, name: entity.name_display == null ? null : String(entity.name_display), cui,
    financials: financials.map((row) => ({ year: Number(row.year), employees: row.employees == null ? null : Number(row.employees),
      turnoverExact: row.turnover == null ? null : String(row.turnover) })),
    administrators: { snapshotDate: snapshot[0]?.d == null ? null : String(snapshot[0].d),
      people: reps.map((rep) => ({ name: rep.personName, role: rep.calitate })) },
    signals: codes.map((code) => ({ code, label: flagLabel(code),
      years: [...new Set(evidence.filter((row) => row.flagCode === code && row.period).map((row) => String(row.period)))] })),
  };
}
