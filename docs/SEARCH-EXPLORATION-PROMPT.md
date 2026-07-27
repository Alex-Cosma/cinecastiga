# Search Experience — Exploration & Continuous Development Prompt

> Standing prompt. Re-run it each round. Every round starts by reading this file
> and the round log at the bottom, then continues the loop.

---

## The task

You are designing and iterating on the **search experience** of a Romanian
public-procurement transparency platform (SEAP/e-licitatie data, 2018–2026:
20.8M direct acquisitions, 1.13M contracts, 305k entities, 161k TED notices).

The current implementation is the "Construiește" single-input typeahead builder:

- `apps/web/app/intreaba/Builder.tsx` — one field, inline chips, adaptive dropdown
- `apps/web/app/api/suggest/route.ts` — CPV synonyms, UATs, authorities, suppliers
- `apps/web/lib/ask/spec.ts` — the closed `AskSpec` vocabulary (13 blocks)
- `apps/web/lib/ask/compile.ts` — spec → parameterized SQL
- `apps/web/app/intreaba/AskPanel.tsx` — the AI (natural-language) sibling mode

**It works. It is not great. Your job is to make it a banger.**

Work **mock-first**: every round produces a standalone, self-contained HTML
artifact (single file, no build step, fake but realistic data) that starts from
*exactly* the behavior currently in the app and evolves from there. The app is
only touched once a mock direction is explicitly approved. Never port
unapproved ideas into `apps/web`.

---

## The two personas — both must be served, neither may be sacrificed

### 1. Curious citizen ("Ana")
Arrives from a Facebook link. Has never used a data tool. Does not know what a
CPV is, what a "block" is, what an "autoritate contractantă" is. Vague or zero
intent — "I wonder what my commune spends money on."

She needs:
- A **zero-intent on-ramp**. An empty search box is a wall. She must be able to
  start with a place, a thing, or nothing at all.
- **Her own vocabulary.** "satul meu", "școala", "drumuri", "lemne de foc" —
  not "dimensiune", "măsură", "formă a răspunsului".
- **Answers that carry their own context.** "241.340 lei" means nothing alone.
  Is that a lot? Compared to what? Per person? Versus similar communes?
- **A next question handed to her.** She won't invent one. The result must
  offer the follow-up.
- To **share** what she found, and have the link render the same thing.
- To never feel stupid. No dead ends, no empty states without an escape.

### 2. Watchdog ("Dan")
Journalist / activist / opposition councillor. Arrives with a hypothesis:
"this firm wins suspiciously often in this county." Will run 40 queries in a
session. Knows the domain, maybe not the tool.

He needs:
- **Speed and keyboard.** Never touch the mouse. Compose, run, refine, repeat.
- **The whole vocabulary reachable.** All 13 blocks — especially `fact_check`,
  `network`, `sankey`, `distribution`, `compare`, `scatter`, which are the
  investigative ones and are *currently unreachable from the search bar*.
- **Comparison and negation.** "this commune versus its neighbours",
  "everything except the incumbent", "only single-bidder".
- **Refine from the result**, not from a blank field. The answer is the next
  query's starting point.
- **An evidence trail.** Which contracts underlie this number? Permalink,
  export, the actual SQL if he wants it.
- **Query memory.** Recent, saved, re-run, tweak-and-rerun.
- Honesty about limits. He will publish this; a wrong caveat is a retraction.

**Design tension to hold, not resolve cheaply:** Ana needs guidance and
scaffolding; Dan needs the scaffolding to get out of the way. A mode switch is
the lazy answer — prefer a design where fluency *earns* speed progressively:
the same input rewards typing more, and the guidance recedes as intent sharpens.

---

## Known weaknesses in the current build

Verified by reading the code — treat as the starting backlog, not the whole list.

**Coverage**
- `Builder.tsx:75` exposes 7 blocks; `spec.ts` defines 13. Missing: `compare`,
  `distribution`, `scatter`, `sankey`, `network`, `fact_check` — the watchdog set.
- No negation, no "except", no multi-select (one county, one CPV, one supplier).
- `uatSiruta` is builder-only and correctly excluded from the LLM schema — but
  that split means the two modes have different power. Reconcile it.

**Input intelligence**
- `match()` is `fold(s).includes(fold(q))` — substring only. No typo tolerance,
  no fuzzy, no prefix ranking beyond `position()` in the SQL. "Buzeu", "Cluj
  Napca", "lemn foc" all fail.
- Phrase intents were bolted on (`topNIntent`, `din`/`până` regexes). They work
  but don't generalize — "cele mai riscante", "anul trecut", "fără licitație",
  "mai mult de 100 de mii" all fall through to CPV free-text.
- No word-order freedom in multiword input; no handling of a full typed sentence.

**Feedback**
- 180ms debounce + network fetch with **no loading state** — the dropdown looks
  frozen or wrong mid-type.
- `cb-empty` is a static string; a zero-result state suggests nothing dynamic.
- `mai lipsește: …` is low-affordance text; the gating of `Rulează` is invisible
  until you look down.

**The loop**
- Running is **terminal**. There is no path from a result back into the query.
- No history, no saved queries, no recently-viewed.
- Chips render in insertion order — a jumble, not a readable sentence.

**Craft**
- Dropdown is bare `div`s: no `role="listbox"`, no `role="option"`, no
  `aria-activedescendant`, no announced result count. Keyboard works; screen
  readers do not.
- `onMouseDown` only — touch/mobile behavior of the chip+input combo is unproven.
- No visible design for narrow viewports, where most Facebook traffic lands.

---

## The loop — repeat every round

**1. Observe.** Re-read the current mock (or the app, round 1) and the round log.
State what specifically is weak *now*. No generic UX platitudes — cite the
interaction, the file, the line.

**2. Walk both personas.** Pick one concrete task per persona and narrate the
keystroke-by-keystroke path through the *current* design. Count keystrokes,
count dead ends, count moments of "what do I do now?". This is the diagnosis;
be brutal and specific.

Rotate the tasks each round. Suggested pool:

*Ana:* "what does my commune spend on" · "who sells firewood to schools near
me" · "is my mayor's spending normal?" · arrives with literally nothing typed ·
arrives on a shared link and wants to change one thing.

*Dan:* "does firm X win disproportionately in county Y" · "who are firm X's
buyers, and do they overlap" · "which communes jumped most in spend after the
2020 elections" · "single-bidder contracts over 1M lei in health CPVs" ·
"compare these two hospitals" · "give me the contracts behind this number".

**3. Propose.** 2–4 concrete, opinionated changes for the round. Each with:
what changes, which persona it serves, what it costs, what it risks. Prefer one
structural change over four cosmetic ones. Say what you are *not* doing and why.

**4. Build the mock.** Single self-contained HTML file, realistic fake data,
Romanian UI copy. Must include every behavior already approved in prior rounds —
**regressions are the main failure mode of this loop.** Keep a visible version
number and a short changelog in the mock footer.

**5. Self-critique before showing it.** Re-walk both personas through the *new*
mock. Score it (rubric below). Name what is still broken. If a change made
something worse for the other persona, say so plainly.

**6. Report.** Short. What changed, why, what to try in the mock (give the exact
keystroke sequence), what you'd do next, and the open question you need answered.

**7. Log.** Append a round entry to the bottom of this file.

---

## Rubric — score every round, 1–5, both personas separately

| # | Criterion | Test |
|---|---|---|
| 1 | **Cold start** | Zero intent, zero typing — is there a way forward? |
| 2 | **Vocabulary fit** | Can the persona express intent in their own words? |
| 3 | **Keystrokes to answer** | Count them. Fewer is better; Dan's ceiling is lower. |
| 4 | **Recoverability** | Typo, wrong pick, zero results — how fast back on track? |
| 5 | **Legibility of state** | Can they read what they've built and what's missing? |
| 6 | **The loop** | Does the answer generate the next question? |
| 7 | **Reach** | What fraction of the 13 blocks / real questions is expressible? |
| 8 | **Trust** | Are scope, caveats, and evidence visible without being asked? |
| 9 | **Craft** | Keyboard, a11y, touch, narrow viewport, latency feedback. |

A round that doesn't move at least one score is a wasted round. Say so if it happens.

---

## Hard constraints

- **UI copy is Romanian.** Diacritics correct (`până`, not `pana` — that exact
  bug already shipped once). Terminology matches the app's existing register.
- **The `AskSpec` contract is the target.** Anything the search can express must
  compile to a valid spec via `validateSpec()`. If a design needs a new spec
  field, say so explicitly and justify it — do not silently invent one.
- **Real data shapes only.** Names are shouty registry strings needing
  `cleanName`/`prettyUat`. Localities collide across counties ("Brăești" ×3).
  CPV grounding is fuzzy and sometimes wrong. Values span 7 orders of magnitude.
  Design for the mess, not for a clean demo.
- **Honesty over polish.** This data drives corruption accusations. A confident
  wrong answer is worse than a hedged right one. Scope caveats are a feature.
- **Mock-first.** No `apps/web` edits until a direction is approved.
- **No regressions.** Every approved behavior survives every subsequent round.

---

## Round log

<!-- Append one entry per round: date · what changed · scores · open question -->

Mocks live in `seap-heartbeat/search-mock/` (outside the repo). Open `vN.html`
directly via `file://`. Shared: `fixture.js` (real data snapshot), `engine.js`
(synthetic tx table + AskSpec runner), `intent.js` (v2+), `mock.css`.

### v1 — baseline (2026-07-23)
Faithful port of `Builder.tsx` as it stands. No improvements; exists so later
rounds can be diffed against the real starting point. Fixture: 3.181 UATs, 1.000
authorities (stratified: 250 national + 750 real communes), 800 suppliers, 45 CPV
divisions, 99 synonyms, 4.000 catalogue entries, 900 real partner edges, 250 real
CRI-scored entities. 42.000 synthetic transactions rescaled per authority to
track real totals, so lei-per-capita and rankings are plausible.
**Scores — Ana 2.0 / Dan 2.1.** Cold start 1/1, vocabulary 2/3, keystrokes 3/3,
recoverability 2/2, legibility 3/3, loop 1/1, reach 2/1, trust 3/3, craft 2/2.

### v2 — input intelligence
One folding rule everywhere (ASCII patterns only — the `â` class of bug is now
structurally impossible). Fuzzy matching with length-scaled edit budget:
`Buzeu`→Buzău, `medicmente`→medicamente, `nucler`→Nuclearelectrica, `farmexm`→
Farmexim, while `Cluj` still never matches `Gorj`. Generalised intents replacing
three ad-hoc regexes: `primele 5`, `top10`, `anul trecut`, `ultimii 3 ani`,
`în 2023`, `peste 1 milion`, `sub 10000`, `fără licitație`, `cele mai riscante`,
`pe locuitor`, `fără <furnizor>`. Candidates scored and ranked; best guess lifted
to a "Cel mai probabil" row so Enter is safe blind. Loading state. Zero-result
recovery that names the filter to drop and how many rows it returns.
New spec fields required: `singleBidder`, `minValue`, `maxValue`, `excludeSupplier`.
**Scores — Ana 2.8 / Dan 3.1.** Vocabulary 2→4, recoverability 2→4, craft 2→3.

### v3 — cold start + the loop
Home panel before the first keystroke: 6 one-click exemplars, a 🎲 "surprise me"
that retries until it finds a non-empty query, recent history. Comparison context
on every result ("5,7% din toată cheltuiala", "primele 10 din 39 adună 96%",
"primul e de 2,3× mai mare decât al doilea", risk percentile). Drill: any ranking
or map row opens that entity's spending structure, keeping subject and period.
Follow-ups: up to 6 next questions derived from the result — **each one executed
before being offered, so none can lead to an empty screen** (verified: 0 dead
follow-ups across 3 result types).
**Scores — Ana 4.0 / Dan 3.6.** Cold start 1→5, loop 1→4, trust 3→4.

### v4 — reach
The 6 unreachable blocks are now reachable, but *not* by extending the taxonomy.
The block became a consequence of what you named: name one entity → rețea /
flux / distribuție de risc / structură; name two → "au făcut afaceri împreună?"
(buyer+seller) or "compară-le" (same role). When a focal entity exists the
generic block menu is suppressed entirely — what you named is the stronger signal.
Second entity routes to a `compareWith` slot instead of overwriting the first.
Drill flips role on network/scatter. Six new renderers: Da/Nu + evidence list,
two-ring partner network, partners→categories flow, histogram with your position
marked, scatter with outliers extracted as a list, side-by-side table with the
winner highlighted. All 13 blocks verified rendering.
`compareWith` already exists in `AskFilters` — no schema change needed.
**Scores — Ana 4.1 / Dan 4.5.** Reach 2→5, loop 4→5.

### v5 — trust (audited against `docs/PRINCIPLES.md`)
**The audit that reordered this round.** v4 scored well on Tier 2 (layered depth,
context) and failed three of four Tier 1 items — the walls the constitution calls
non-negotiable, because the app publicly names companies as risky. Tier 1 first:

- **#1 Evidence one click away.** "Vezi cele N achiziții din spatele cifrei" under
  every result — the real rows, each linking to its source on e-licitatie.ro. No
  derived number is a dead end any more.
- **#2 Signal, not verdict.** CRI never appears bare. Band (scăzut/mediu/ridicat)
  plus the caveat in the same breath. Scatter's "ies din tipar" now says outright
  it is a place to look, not an accusation.
- **#3 Methodology linked.** "Cum se calculează?" beside every derived number —
  CRI, lei/locuitor, CPV matching, peer group, stream type.
- **#6 The peer lens** (the open question from v4, resolved as option b). Same
  authority kind, ±40% population; the sentence names the group, sizes it, and
  names the subject. Verified: *"Comuna Greaca: față de 364 comune de mărime
  apropiată (1.526–3.560 loc.) cheltuiește de 40,1× mai mult decât mediana;
  percentila 100."*
- **#7 Streams never blended.** DA vs procedure split with a "why this matters"
  explainer — a direct acquisition is a category, not a violation.
- **#9 Citable.** Permalink (`?q=`, restore verified round-trip), CSV of all rows,
  paste-ready citation with source and date.
- **Craft.** Real `role="listbox"` + `aria-activedescendant`, `aria-live` region
  announcing suggestion counts, active option scrolled into view, evidence table
  degraded for narrow screens.

Verified: all 13 blocks render, evidence + citation present on every non-empty
result, no bare CRI anywhere. 0 warnings.
**Scores — Ana 4.4 / Dan 4.8.** Trust 4→5, craft 3→4, context 3→5.

### Still open
- **Chips render in insertion order**, not as a readable sentence.
- **Historical lens (#6)** absent — needs per-entity series, not just national.
- **`singleBidder`** blocked on reconcile — see `docs/RECONCILE-FINDINGS.md`.
  Bidder data exists only on TED (`is_single_bidder`, 4,03M lots); the
  e-licitatie proxy fires on 94% of rows and is not a competition signal.
- **Visual design untouched by choice** — every version reuses the app's existing
  palette and `.cb-*` rules so behavioural changes stayed attributable. A visual
  redesign (density, typography, hierarchy, the sober-vs-playful question under
  principle #8) would branch from v5 as a variant, not a replacement.
