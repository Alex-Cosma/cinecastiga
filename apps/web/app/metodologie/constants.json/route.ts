import {
  BUYER_REGIME_OVERRIDES,
  FIRM_DUTY,
  FLAGS_METHODOLOGY_VERSION,
  PROFILE_FLAG_CODES,
  ROUND_EVIDENCE,
  SCORE_BAND_MIN,
  SCORE_CAPACITY_ALONE,
  SCORE_FAMILY,
  SCORE_FAMILY_CAP,
  SCORE_FAMILY_REST,
  SCORE_GATE,
  SCORE_WEIGHT,
  SPLIT_RECURRING,
} from "@seap/db";
import { DA_CEILING_ERAS } from "@seap/domain";
import { FIRM_DOMAIN_MINIMUM } from "@/lib/risk-peers";
import { PEER_MINIMUM } from "@/lib/ask/peer-groups-shared";

// /metodologie/constants.json: the risk score's constants as the code uses them (packages/db/src/profile-flags.ts,
// packages/domain/src/procurement-thresholds.ts), linked from "Codul, constantele și licența". The per-pattern level
// thresholds are written in the strength functions of profile-flags.ts and in the "Nivelul fiecărui tipar" table.
// `source` is that file as text, the one /metodologie shows (owner, 9 November 2026: shown there, not linked).
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json(
    {
      methodology: FLAGS_METHODOLOGY_VERSION,
      source: "https://cinecastiga.ro/metodologie/cod/profile-flags.ts",
      license: "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/deed.ro) for the derived data",
      score: {
        formula: "100 × (1 − Π(1 − weight × F)); F = a family's strongest level + rest × the others, up to the family cap",
        weight: SCORE_WEIGHT,
        familyRest: SCORE_FAMILY_REST,
        family: SCORE_FAMILY,
        familyCap: SCORE_FAMILY_CAP,
        capacityAlone: SCORE_CAPACITY_ALONE,
        bandMin: SCORE_BAND_MIN,
        evidenceGate: SCORE_GATE,
        firmDuty: FIRM_DUTY,
        splitRecurring: SPLIT_RECURRING,
        roundEvidence: ROUND_EVIDENCE,
      },
      patterns: PROFILE_FLAG_CODES,
      comparison: { minimumPeers: PEER_MINIMUM, firmDomainMinimum: FIRM_DOMAIN_MINIMUM },
      directAwardCeilings: DA_CEILING_ERAS,
      reviewedBuyers: BUYER_REGIME_OVERRIDES,
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
