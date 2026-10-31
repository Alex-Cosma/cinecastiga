/**
 * The criteria of the historical risk profile (marts.entity_flags): the
 * signals on direct acquisitions that make an institution's or a firm's index,
 * per role, in the order the answers list them. The index is the number of
 * criteria met over the number a role can meet (cri = n_flags / applicable).
 * The flag marts build (apps/ingestion) counts with them; Ask's risk cloud and
 * the distribution read the same codes (apps/web/lib/ask/spec.ts SCATTER_FLAGS,
 * peer-groups-shared.ts CRITERIA, kept equal by a test).
 */
export const PROFILE_FLAG_CODES = {
  authority: ['da_split', 'da_year_end', 'da_round', 'da_rapid', 'da_concentration'],
  supplier: ['da_split', 'da_dependence', 'da_rapid', 'da_round'],
} as const;
export type ProfileFlagRole = keyof typeof PROFILE_FLAG_CODES;
export type ProfileFlagCode = (typeof PROFILE_FLAG_CODES)[ProfileFlagRole][number];

/** How many criteria each role can meet: the denominator of the index. */
export const PROFILE_FLAGS_APPLICABLE = {
  authority: PROFILE_FLAG_CODES.authority.length,
  supplier: PROFILE_FLAG_CODES.supplier.length,
} as const;
