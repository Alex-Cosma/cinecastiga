---
target: "https://cinecastiga.ro/"
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "url:https://cinecastiga.ro/"
timestamp: 2026-11-01T20-34-34Z
slug: cinecastiga-ro
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent). Production https://cinecastiga.ro/, 1280×900 + 390×844, light + dark, signed out.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Typeahead pending row + live region; map tap navigates ~0.9 s with no feedback; "complet până la 30.06.2026" only at page bottom |
| 2 | Match System / Real World | 3 | Jargon: "achiziții directe acceptate", "înregistrări contract–furnizor", TED/SEAP, "catalogul CPV · 44211300-5"; "1.146.439 înregistrări" lacks "de" (DiscoveryMap.tsx:36, :42) |
| 3 | User Control and Freedom | 3 | URLs everywhere, search clear, Esc; theme toggle icon-only 3-state cycle, state not visible |
| 4 | Consistency and Standards | 2 | "Cluj" → 3 destinations (chip → /cauta, map/typeahead → Ask); "înregistrări" two meanings on one screen; hero search focus ring differs |
| 5 | Error Prevention | 3 | "nu plăți" at the figure; 260,5 mld. lei above-cap exclusion not |
| 6 | Recognition Rather Than Recall | 3 | Grouped typeahead excellent; map legend without values; caveats ~900px lower |
| 7 | Flexibility and Efficiency | 3 | "/" focuses search; 42 county links → 58 tab stops before first figure |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, clear; noise: 3 kickers, compass, swash, 01/02/03, triple card copy |
| 9 | Error Recovery | 3 | Honest gibberish + API-failure states |
| 10 | Help and Documentation | 3 | Tips everywhere; some tips are long legal paragraphs (terse-copy rule) |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict
LLM: partly authored. Own: hero line, live county map + readout, figures that open their answers with "nu plăți", typeahead that interprets a question. Generic: stock SaaS landing skeleton (split hero, stat band, numbered feature cards kicker+01+illustration+title+text+arrow, second card row, 3-col footer); explainer clip-art illustrations. Missed: no real winner/institution/contract on the home, only aggregates.
Detector: 1280 → 7 (5 warnings, 2 advisory); 390 → 28 on 25 elements (mostly 8–10px text); source → 0 (CSS-blind, not clean). Agree with review: phone microcopy (20 elements), map-card contrast 4.0:1, two kickers (DESIGN.md "not canonized"). Detector-only: "01" numeral 2.8:1, straggler "SEAP.". False positive: search-form hard-offset-shadow (1.08:1 tonal ledge).
Overlay: blocked by Chrome Local Network Access on cinecastiga.ro; ran only in a throwaway headless browser with the check disabled (same findings); not user-visible.

## Overall Impression
Strong working core; weak trust layer around the numbers. Biggest opportunity: make the first screen as trustworthy as it is inviting.

## What's Working
1. Search behaves like a question builder (intent, grouped kinds with CUI/county, tolerant input, keyboard-complete, honest failure).
2. Every number opens its evidence (933,1 mld. lei → same total in 134 ms, split DA + contracts, "Vezi cele 21.244.587 de înregistrări").
3. Coherent identity in both themes; accessible map (labeled links + select); no horizontal scroll at 390/1280.

## Priority Issues
1. [P1] "înregistrări" contradicts itself on the first screen — map readout counts DA + contracts (Cluj 1.146.439), strip counts contracts only (1.005.467); national 21.244.587 absent; missing "de". Fix: lead strip with "21.244.587 de înregistrări", split in tip, or name the unit in the readout; one formatter for the "de" rule. → /impeccable clarify
2. [P1] Headline figure's biggest caveat ~900px away — 95 contracts above 1 bn cap (260,5 mld. lei, ≈28% on top of 933,1), "complet până la 30.06.2026", TED separate; third wording in footer. Fix: "Ce include? ›" trigger in the strip opening the same disclosure in place; merge footer wording. → /impeccable layout
3. [P1] Phone text 8–10px, caveats included (approved.css:76; guide.css:75 "tuned sizes"); map card 4.0:1; hero input 14px (iOS zoom, inferred). Fix: 12px floor (11px caps kickers), 13px figure labels + readout, --ink2 on mint card, 16px hero input; land in guide.css. → /impeccable typeset
4. [P2] Keyboard path and focus uneven — 58 tab stops before the first figure; hero search ring ≈1.6:1 vs shared 3px orange. Fix: county links tabindex=-1 (select is the keyboard route); shared focus ring on the search. → /impeccable harden
5. [P2] "O întrebare bună e un început." is a template — 7 doors, overlapping tiers, triple copy, ~770px per card on phone, page 3,808px. Fix: keep 3 questions, live first-row answer preview instead of illustration, cut description or action line, Semnale/Domenii/TED as compact links. → /impeccable distill

## Persona Red Flags
Jordan: jargon strip labels + legal tips; inverted affordance (static-looking links, link-looking tip labels); "Cluj" chip → /cauta with 4 filters vs map → answer; "spital" lists a foreign person above subjects.
Riley: county > country count; 260,5 mld. lei exclusion only at bottom; "🙂🙂" 4.8 s; unmarked mojibake in suggestions; București 330 mld. on 14×15px (seat-based map inflates it).
Casey: 8–10px text; targets <44px (chips 58×25, theme 30×30, tips 24×24, București 9×9); county tap without preview; 108px sticky header; ~510px map before figures; "Feedback" anglicism.

## Minor Observations
Hidden dialog H2 before H1; footer H4 without H2/H3. Dark choropleth: highest values recede. Orange overloaded (hover, focus, illustration dot). "O arhivă de urmărit." empty label. Feedback FAB covers "Construiește întrebarea ta" at 1280×900. Speed meets the bar (Ask 134–206 ms; county breakdown 926 ms).

## Questions to Consider
- Real first answer row instead of illustrations on the starting cards?
- Map in lei per inhabitant, or national bodies set aside, so "în județul tău" is honest?
- If 933,1 excludes 260,5 mld. lei, is it the number to lead with?
- Map as hero or second hero — one way in above the fold?
