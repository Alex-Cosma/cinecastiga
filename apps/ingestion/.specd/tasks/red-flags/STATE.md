# State: red-flags

**Task:** red-flags
**Stage:** in-progress (Phases 1–3 done)
**Last Updated:** 2026-07-13

## Progress
- [x] Research + taxonomy + decisions (DEC-001..007) + roadmap
- [x] DA ceilings confirmed (132.519 / 441.730, net VAT)
- [x] Phase 1 — DA import: 4.78M → core.direct_acquisitions (943 auth misses, 0
      supplier, 1 bad CPV). raw_id made nullable (0009).
- [x] Phase 2 — core.flags + core.risk_thresholds (0010); ceilings + calibrated
      statistical cutoffs seeded.
- [x] Phase 3 — 6 DA flag rules computing on real data (was 7; da_estimate_match
      DROPPED — 96% trigger = process norm). Counts: split 9463, concentration
      535, dependence 26552, rapid 407934, round 13255, year_end 1560.
- [ ] Phase 4 — CRI + marts (entity_flags, flag_instances, fill authority_concentration)
- [ ] Phase 5 — web surfaces (/semnale, risk leaderboard, profile badges, /metodologie)
- [ ] Phase 6 — award engine (dormant)

## Findings (validated on real data)
- da_estimate_match dropped (closing==estimate is the DA norm, 96%).
- da_rapid tightened to 10 min (DAs inherently fast; 8.5%).
- Data quality: ~275 DAs carry corrupt closing values (billions, e.g. 21B for a
  commune). Bounded via `da_max_plausible`=2M → DA total 22.4B, matching the 2020
  build's cleaned 21.35B. Confirms SICAP data-quality caveat.
- da_split surfaces real structuring (Otopeni←COSTALEX 22 DAs=6.36M; Sector1
  schools←BE HOME 47 DAs).

## Next
Phase 4 — CRI composite + marts, then web surfaces.
