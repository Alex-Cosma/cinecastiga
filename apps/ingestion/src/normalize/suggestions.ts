import { entityNameSuggestions, type Db, type DbSql } from "@seap/db";

/**
 * Tier-3 fuzzy entity matching (core-layer DEC-003). Generates REVIEW
 * SUGGESTIONS only — nothing here auto-merges. A human adjudicates
 * `core.entity_name_suggestions`.
 *
 * Guardrails (a wrong merge in a watchdog tool = a false accusation):
 *  - Only pairs where at least one side lacks a checksum-valid CUI. Two
 *    entities with different valid CUIs are provably distinct → never suggested.
 *  - Trigram similarity bands: ≥0.85 strong, 0.55–0.85 weak, <0.55 dropped
 *    (pg_trgm's default 0.3 is far too loose).
 *  - Negative rule: differing trailing ordinal (`nr 4` vs `nr 5`) suppresses the
 *    pair even at high similarity — for public institutions the number IS the
 *    identity.
 */

const THRESHOLD = 0.55;
const STRONG = 0.85;

interface Candidate {
  aId: bigint;
  bId: bigint;
  aName: string;
  bName: string;
  aCui: string | null;
  bCui: string | null;
  aValid: boolean;
  bValid: boolean;
  sim: number;
}

/** Trailing ordinal like "... nr 4" → "4", else null. */
function ordinal(name: string): string | null {
  const m = /\bnr\s+(\d+)\b/.exec(name);
  return m ? m[1]! : null;
}

export interface SuggestReport {
  compared: number;
  suggested: number;
  suppressedOrdinal: number;
}

export async function generateNameSuggestions(
  db: Db,
  sql: DbSql,
  opts: { log?: (m: string) => void } = {},
): Promise<SuggestReport> {
  const log = opts.log ?? (() => {});

  // Use the GIN trgm index: set the % operator threshold, then self-join.
  await sql`select set_limit(${THRESHOLD})`;
  const rows = (await sql`
    select
      a.id as "aId", b.id as "bId",
      a.name_normalized as "aName", b.name_normalized as "bName",
      a.cui_canonical as "aCui", b.cui_canonical as "bCui",
      a.cui_valid as "aValid", b.cui_valid as "bValid",
      similarity(a.name_normalized, b.name_normalized) as sim
    from core.entities a
    join core.entities b
      on a.id < b.id
     and a.name_normalized % b.name_normalized
    where similarity(a.name_normalized, b.name_normalized) >= ${THRESHOLD}
      -- at least one side needs name help (both-valid-different are provably distinct)
      and (a.cui_valid = false or b.cui_valid = false)
      and length(a.name_normalized) > 0
      and length(b.name_normalized) > 0
  `) as unknown as Candidate[];

  let suggested = 0;
  let suppressedOrdinal = 0;

  for (const r of rows) {
    const oa = ordinal(r.aName);
    const ob = ordinal(r.bName);
    if (oa !== null && ob !== null && oa !== ob) {
      suppressedOrdinal += 1;
      continue; // "nr 4" vs "nr 5" — distinct institutions
    }
    const band = r.sim >= STRONG ? "strong" : "weak";
    await db
      .insert(entityNameSuggestions)
      .values({
        entityA: r.aId,
        entityB: r.bId,
        score: r.sim,
        evidence: {
          band,
          aName: r.aName,
          bName: r.bName,
          aCui: r.aCui,
          bCui: r.bCui,
          note:
            r.aValid || r.bValid
              ? "one side has a valid CUI — candidate is the orphan"
              : "neither side has a valid CUI",
        },
        status: "open",
      })
      .onConflictDoNothing();
    suggested += 1;
  }

  log(
    `suggestions: compared ${rows.length} pairs, ${suggested} written, ${suppressedOrdinal} suppressed by ordinal rule`,
  );
  return { compared: rows.length, suggested, suppressedOrdinal };
}
