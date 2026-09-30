import type { DbSql } from "./client.js";
import { SIGNAL_LOOKUP_QUERY } from "./schema/marts.js";

/** Run under the publication gate, never on a page request. Full comparison,
 * including missing rows, extra rows, source values and ordering precision. */
export async function validateSignalLookup(q: DbSql) {
  const [result] = await q`
    with expected as (${q.unsafe(SIGNAL_LOOKUP_QUERY)})
    select count(*)::text compared,
      count(*) filter (where e.id is null or a.id is null or
        row(e.flag_code,e.subject_type,e.entity_id,e.partner_id,e.severity,e.total_ron,e.source_id)
        is distinct from row(a.flag_code,a.subject_type,a.entity_id,a.partner_id,a.severity,a.total_ron,a.source_id))::text mismatches
    from expected e full join marts.signal_lookup a on a.id=e.id`;
  return { compared: String(result?.compared ?? "0"), mismatches: String(result?.mismatches ?? "0") };
}
