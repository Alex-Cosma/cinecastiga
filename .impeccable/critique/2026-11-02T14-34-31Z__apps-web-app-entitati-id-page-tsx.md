---
target: "https://cinecastiga.ro/entitati/2048579 + /entitati/2032501 (entity page, supplier)"
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:~/Desktop/Personal/code/seap-integration-20261016/apps/web/app/entitati/[id]/page.tsx"
target_fingerprint: "sha256:e9fce67cf8285b7c74e3f9b63f6a46f48a39d30c9d48da3b1a8432bc3e8df112"
target_path: ~/Desktop/Personal/code/seap-integration-20261016/apps/web/app/entitati/[id]/page.tsx
timestamp: 2026-11-02T14-34-31Z
slug: apps-web-app-entitati-id-page-tsx
---
# Critique: entity page, supplier role (BUG FOREST SRL /entitati/2048579, ALPINA BLAZNA SRL /entitati/2032501), production 998a076

Method: dual-agent (A design review · B detector + browser), isolated sub-agents.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Year drill + status fine; phone pager lands in footer; focus stays on chart after year click |
| 2 | Match System / Real World | 3 | "46%" beside "risc" reads as probability; peer line compares score, says "mai multe tipare" |
| 3 | User Control and Freedom | 3 | Escape / clear filters exist; table state not in URL |
| 4 | Consistency and Standards | 2 | Two pager designs; tab order ≠ page order; "Vezi în tabel →" reloads, years filter in place |
| 5 | Error Prevention | 3 | Caveats exist but the two key ones sit in broken tips |
| 6 | Recognition Rather Than Recall | 3 | Ledger is the legend; hatched partial year unexplained |
| 7 | Flexibility and Efficiency | 2 | Fixed 10 rows, no URL state, no export |
| 8 | Aesthetic and Minimalist Design | 3 | Calm; BUG repeats its only channel as Total; 5 equal header buttons |
| 9 | Error Recovery | 3 | Retry exists; raw error string printed in a cell |
| 10 | Help and Documentation | 3 | (?) everywhere, but the strip's two tips are 116–130 px wide |
| **Total** | | **28/40** | **Good** |

## Design Specificity Verdict
LLM: mostly authored (ledger swatches = chart legend, turnover over value per year, banded risk scale, per-signal "În risc", consortium fractions, source per row); skeleton is the generic company-intel template; no signature after the top strip; the evidence chain is not shown as one path.
Deterministic: CLI 50 findings in [id]/ — all CSS, TSX 0; entity.css 12 advisory (font-size ramp, 2–4 px radii on chart marks = false positive, 999px pills, a shadow colour). CDP desktop 13 per page: srctag 10.5px ×10 (true, desktop only), stream toggle 4.18:1 light (true), kicker "Furnizor" (role label, false positive), repeating stripes = partial-year hatch (false positive). Phone 3–4. Extra: term "?" glyph 2.87–2.98:1 in #semnale th and footer; footer h2→h4; heading names include help-button label; tabs clipped at 390 with no scrollbar; generic <title>.
Overlays: skipped (headless browser, no user-visible tab).

## Priority Issues
- [P1] Strip tips (risc page.tsx:261, Total înregistrat page.tsx:295) 116–130 px wide, cut at "…Nu este o probabilitate"; not scrollable by keyboard (tabIndex -1); on phone cover the ledger and swallow the next tap. Cause entity.css:32 max-width min(46ch,100%) against the inline span. Fix: anchor to region; phone width min(46ch,100vw-32px); lead with "Nu este o probabilitate de corupție." — /impeccable harden
- [P1] Phone records pager drops the reader in the footer (ghost rows shorter than cards). Fix: keep stale rows dimmed, scroll + focus table top, "pagina 2 din 14". — /impeccable harden
- [P2] Stream toggle 4.18:1 light, no aria-pressed; "în consorțiu" 11.5px on phone (×6 ALPINA); "?" glyph 2.9:1. — /impeccable polish
- [P2] Generic <title> on every entity page (no generateMetadata); tab order differs from page order. — /impeccable polish
- [P2] Peer line "Mai multe tipare decât 97% dintre firmele" compares score, not patterns (lib/risk-peers.ts:16). — /impeccable clarify

## Persona Red Flags
Alex: no URL state, fixed 10 rows, same tab titles, non-scoring signals not filterable. Sam: focus left on chart after year Enter; strip tips unscrollable; heading names include tip labels; dark bar segments 1.73:1. Casey: 158 px sticky chrome, header buttons on two rows, pager to footer, open tip swallows tap, Conducere 3-col at 390. Journalist: quotable figures big, their limits in cut tips or closed details.

## Minor Observations
Turnover sets ALPINA's scale (owner kept it 2 Nov); "0%" grey reads clean; axis 11px at 641–700 px; "1,3 mil." for 1,25 mil.; diagonal hover switches year; empty Semnale column on contract rows; partner names truncated at 1280; registries weigh as much as analysis actions; scroll-reveal fades on an Operate page.

## Questions to Consider
- Does the risk need "%"? "moderat · 46/100".
- Chart as share of turnover instead of two magnitudes on one axis?
- Caveat inline at the first number, and the page ending on the next investigative step?
