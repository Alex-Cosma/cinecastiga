/**
 * Seat of a winning firm, for Ask's seat filters and the map lens "Firme din
 * județ" (plan F5, 24 October 2026). The marts build stores it once a night on
 * the supplier profile (marts.entity_profile.seat_county + seat_source,
 * migration 0086) and splits each buyer county of marts.agg_map_county by it;
 * the web reads both and probes for them (apps/web/lib/ask/mart-columns.ts).
 *
 * Priority, first that applies: a foreign marker (is_foreign) → 'foreign'; the
 * county of the latest ONRC registration of a corroborated CUI → 'onrc'; the
 * entity's SEAP county → 'seap'; a non-RO country code → 'foreign'; else
 * unknown (null). The seat is the registered office, not the place of the
 * works.
 */
export const SEAT_SOURCES = ['onrc', 'seap', 'foreign'] as const;
export type SeatSource = (typeof SEAT_SOURCES)[number];

/**
 * A transaction row by the seat of its firm against its own buyer county:
 * 'same' and 'other' need a Romanian seat, 'foreign' is seat_source foreign,
 * 'unknown' covers a row without firm or seat. same + other + foreign +
 * unknown = the county; 'bucuresti' (seat in București, buyer elsewhere) is a
 * part of 'other'.
 */
export const SEAT_CLASSES = ['same', 'other', 'bucuresti', 'foreign', 'unknown'] as const;
export type SeatClass = (typeof SEAT_CLASSES)[number];

/** County spelling of București in the marts (core.entities.county, NUTS RO321). */
export const SEAT_BUCURESTI = 'Bucuresti';

/**
 * Where a firm sits when it has no Romanian county (owner-seat-switch, 26
 * October 2026): /harta's suppliers (marts.spend_by_county) and the "Județ"
 * column of Ask's rankings show a foreign seat apart, never in a county, and
 * a seat nobody knows as unknown.
 */
export const SEAT_ABROAD_LABEL = 'Străinătate';
export const SEAT_UNKNOWN_LABEL = 'Necunoscut';

/** Value and record columns of marts.agg_map_county per seat class, beside
 * v_plaf/n_plaf (DAs up to the 2M analysis ceiling) and v_all/n_all. */
export const AGG_MAP_COUNTY_SEAT_COLUMNS: readonly string[] = (['plaf', 'all'] as const)
  .flatMap(scope => SEAT_CLASSES.flatMap(seat => [`v_${scope}_${seat}`, `n_${scope}_${seat}`]));
