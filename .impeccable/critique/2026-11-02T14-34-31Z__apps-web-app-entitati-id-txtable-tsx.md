---
target: "http://192.168.34.61:3100/entitati/2146798#achizitii (records section)"
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:~/Desktop/Personal/code/seap-integration-20261016/apps/web/app/entitati/[id]/TxTable.tsx"
target_fingerprint: "sha256:f372da2287f6f8867e393dff4bb6a1fb7e231a4f6e349776ff1116dd0f07ac2b"
target_path: ~/Desktop/Personal/code/seap-integration-20261016/apps/web/app/entitati/[id]/TxTable.tsx
timestamp: 2026-11-02T14-34-31Z
slug: apps-web-app-entitati-id-txtable-tsx
---
# Critique: records section #achizitii (SPITALUL ORASENESC AGNITA /entitati/2146798, local preview 998a076; above-cap checked on CNAIR 2146146)

Method: dual-agent (A design review · B detector + browser), isolated sub-agents.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | ?sem= load says "(ambele canale)" while the API returns DA only; phone pager lands in footer |
| 2 | Match System / Real World | 3 | Four names for one set; "Arată excluse din total" shows only excluded |
| 3 | User Control and Freedom | 2 | "scoate filtrele" leaves the channel; no URL state; Back doesn't undo |
| 4 | Consistency and Standards | 2 | Two pagers, two selected styles, unstyled retry, rounded vs exact values |
| 5 | Error Prevention | 2 | Filters that always return 0 |
| 6 | Recognition Rather Than Recall | 2 | Hidden channel switch not in banner; badge meanings title-only |
| 7 | Flexibility and Efficiency | 2 | 454 pages prev/next only; no URL; no save to anchetă |
| 8 | Aesthetic and Minimalist Design | 3 | Clean table; dead gap, empty 132px Semnale column |
| 9 | Error Recovery | 2 | Error shown twice; empty state names no cause/fix |
| 10 | Help and Documentation | 2 | ⚠ "valoare de verificat" explanation hover-only |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict
LLM: rows authored (source exit per row, contract no., 1 ofertant, consortium share, dotted-struck suspect values, "Dată sursă improbabilă", neutral badges); chrome generic with three control languages; no "cite/save this selection".
Deterministic: CLI 0 (TSX regex-only, undercount). CDP inside the section: 1280 light 11 (srctag 10.5px ×10, stream toggle 4.18:1), 390 1; panel open / filter applied add none. Extra: th without scope, no caption/name, toggles and chips without aria-pressed, year panel without aria-controls, Escape drops focus to body, phone sort hit area 27×20 with an unclickable "sortează după" prefix, badges cut mid-word, Feedback FAB over the Sursă column at 1280; filters update in 14–122 ms.
Overlays: skipped (headless browser).

## Priority Issues
- [P1] Filter state not truthful: signal chip / excluded switch the channel to DA silently (TxTable.tsx:122, :161); banner silent; clear leaves channel (4.530 vs 4.536); ?sem= load shows "toate sursele" + "(ambele canale)" (TxTable.tsx:181) while marts.ts:470–471 returns DA only; year drill drops the flag while URL keeps ?sem. Fix: derive channel, banner lists every dimension with its ✕, clear resets all, URL sync. — /impeccable harden
- [P1] Dead-end filters: "Vârf în decembrie" (yearly pattern) always 0; excluded checkbox shown with 0 excluded; years ignore channel; empty state without cause/fix. — /impeccable harden
- [P1] Paging loses the reader: phone footer jump, desktop pager moves 92px, focused pager button disabled → focus to body; Escape in year panel loses focus. Fix: stale rows dimmed (.tx-loading), scroll + focus, aria-disabled. — /impeccable harden
- [P2] Values rounded to whole lei (formatRonFull, lib/format.ts:31) vs PRODUCT.md exact precision; above-cap contracts closed after the pager, not in the status. — /impeccable clarify
- [P2] Contracts view loses "1 ofertant"; empty Semnale column 132px; Furnizor 92px at 901–1100; badges cut without ellipsis. — /impeccable layout

## Persona Red Flags
Alex: no URL, 454 pages, focus lost after paging, no save, panel closes on mouseleave. Sam: no aria-pressed, unnamed table, focus lost on Escape/clear/paging, ⚠ hover-only. Casey: pager to footer + Feedback slides under the thumb, ~280px of controls, 27×20 sort, panel covers status.

## Minor Observations
Amber "Filtrat" for a neutral state; "0 înregistrări · pagina 1 din 1"; browser-blue checkboxes in the year panel; "toți anii" checkbox behaves as radio; no "nu plăți" cue on Valoare; ledger arrows go to Ask while tabs/chart land here; two-filter banner without a separator.

## Questions to Consider
- Filter state as the citation (URL + one-line selection) ready for an anchetă?
- Above-cap as a fourth channel instead of a closed list after the pager?
- "Încarcă încă 10" in place on phones instead of paging?
