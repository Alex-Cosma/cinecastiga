# Construiește, brought into the new experience

Design proposals for selection · 13 September 2026

Recommendation: **an editable question above the answer**, with a focused condition editor and useful follow-up questions. Keep the approved discovery homepage and the existing deterministic query engine. Make the growing question readable and its scope explicit.

This is a proposal document. The application and the approved functional mock-up have not been changed.

## What the current implementation actually does

The current Builder is a continuous typeahead composer. A person types a term, chooses a suggestion, and receives an editable chip. Subsequent suggestions depend on the chosen subject, entities, answer type and missing fields. The result is an `AskSpec`, sent directly to `/api/ask` without an AI call. The separate natural-language route produces the same spec; its result can already be transferred into Construiește.

There are 13 existing analytical operations: rankings, totals, time series, county maps, comparisons, risk distributions, category breakdowns, risk/volume plots, money flows, partner networks, entity superlatives, buyer–supplier relationship checks and changes between two years. Ordinary transaction queries combine county, category, period, entity, institution type, employee bounds and administrator filters.

Existing strengths to retain:

- Institutional aliases, scored suggestions and some typo tolerance.
- Suggestions based on the entities already selected.
- Click-to-edit chips and keyboard operation.
- A deterministic, validated specification shared with the natural-language interpreter.
- Source rows, exports, citations, permalinks and query clips in Anchete.
- Exact entity IDs and month bounds preserved when provided by deep links.

The main friction is presentation. Empty focus offers all 13 answer forms. Required prompts ask for the answer's form, dimension and measure. Chips follow selection order rather than reading order. An entity chip loses its previous value as soon as editing begins. Results expose the interpreted question, but its pills are not directly editable, and the interface does not provide a persistent history of successive refinements.

## A — The editable question (recommended)

The question becomes a designed part of the result page. Large, readable Romanian phrases contain quiet editable controls. Common scope sits on a second line. Rare constraints live behind **Adaugă o condiție**.

```text
ÎNTREBAREA TA

Cine are contracte cu [spitalele ▾]
din [Cluj ▾], în [2023–2025 ▾]?

[Doar contracte ▾]  [Firme cu sub 5 angajați ×]  [+ Adaugă o condiție]

Arată [primele 10 firme ▾], după [valoarea contractelor ▾].

                                      [Vezi răspunsul →]
─────────────────────────────────────────────────────────────
Cine furnizează spitalelor din Cluj?

[Tabel | Bare]                         [Surse] [Salvează în anchetă]

                    the actual result

Continuă de aici:
[Cum s-a schimbat în timp?] [Vezi achizițiile] [Verifică o relație]
```

This example fits the existing transaction query schema: supplier ranking, contracts, hospitals in Cluj, 2023–2025, maximum four employees, top ten by value. Employee count comes from the latest available filing; that date basis stays beside the condition. It is not a claim about an actual result.

### How it feels

1. On the approved homepage, keep the simple search and topic starters. Add a quiet **Construiește o întrebare** entry for someone arriving with a hypothesis.
2. On a profile or result, **Rafinează întrebarea** opens the composer with the existing institution, topic and period already set.
3. Clicking **Cluj** opens a county selector. Clicking the period opens a period selector. Each editor keeps the old choice until a replacement is committed; Escape cancels the edit.
4. **Adaugă o condiție** opens a searchable menu grouped into **Instituții**, **Firme**, **Achiziții**, and **Perioadă**. Examples: number of employees, representative, source stream, category. Selecting a condition opens only its relevant controls.
5. On execution, the question becomes a compact summary above the answer. **Modifică** expands it again. A shortcut can focus it directly for repeated work.
6. A follow-up inherits applicable context. It creates another question or analytical action, preserving a route back to the prior answer.

The forest-green question, pale mint controls and warm paper surfaces use the approved visual language. The active phrase receives a restrained orange accent. On mobile, the summary wraps naturally and editors open as bottom sheets.

For a long query, stop forcing every clause into a grammatical sentence. Keep one human headline and ordered labeled conditions beneath it. A fifteen-condition sentence would become another wall of chips.

**Best for:** one product serving curious visitors and experienced investigators.

**Tradeoff:** requires careful sentence templates and condition compatibility rules. Deeply nested logic needs an expanded rule editor.

## B — The question worksheet

A persistent panel groups query controls by meaning; the answer stays alongside it. It opens within Explorează when requested. The homepage retains the approved design.

```text
CONSTRUIEȘTE ÎNTREBAREA          CINE FURNIZEAZĂ SPITALELOR DIN CLUJ?

Ce vrei să afli?                [current answer and source actions]
[Cine câștigă ▾]

Cine cumpără?
[Spitale ▾]

Unde și când?
[Cluj ▾] [2023–2025 ▾]

Firme
[Sub 5 angajați ▾]
[+ Condiție]

2 modificări neaplicate
[Actualizează răspunsul →]
```

Controls are easy to find, revisit and compare. Sections expand only when used. A concise sentence above the result restates the applied query. On narrow screens, the worksheet becomes a full-width sheet above the result.

**Best for:** long sessions with many conditions and repeated edits.

**Tradeoff:** more visible interface and a greater sense of operating an analysis tool. Less distinctive and inviting than A for a first-time visitor, but particularly clear for substantial rule sets.

This could also be the expanded condition editor of A, sharing the exact same query state rather than becoming a second query system.

## C — Follow the thread

Queries become steps in an investigation notebook. A person starts with an answer, then restricts it, explores another relationship or creates a comparison. Previous questions stay visible and can branch.

```text
FIRUL INVESTIGAȚIEI

1  Ce cumpără spitalele din Cluj?          [Deschide]
2  Cine sunt furnizorii?                  [Deschide]
3  Dintre aceștia, care au sub 5 angajați? [Pasul curent]
   ├─ Cum au evoluat contractele lor?
   └─ Cu ce alte instituții lucrează?

[current result, query scope and sources]

[Continuă întrebarea] [Adaugă o notă] [Salvează firul în anchetă]
```

Changing an earlier question creates a new branch. Saved steps retain their query definition, timestamp and source context. A short history helps a reporter retrace the reasoning or a citizen return to an earlier discovery.

**Best for:** developing a story across several related questions.

**Tradeoff:** more work to implement and more state to explain. Exact set references such as **dintre aceștia** need defined semantics: the displayed top ten, all matching suppliers, or a saved snapshot are different sets. Existing query clips alone do not provide branching execution or references to previous results.

I would add this within Anchete after the primary query interface is established, rather than making it the only way to ask a precise question.

## Complexity requires a few engine extensions

The interface should only accept conditions the engine can preserve and execute.

| Desired question feature | Current state | What is needed |
| --- | --- | --- |
| Hospitals + Cluj + years + suppliers with fewer than five employees | Supported by transaction queries | New presentation; preserve the actual employee-data date basis |
| All institutions in one locality | Supported by SIRUTA | Distinguish this from selecting only the town hall |
| Suppliers represented by a named person | Supported for transaction queries | Exact person selection; label current representation, not historical ownership |
| Cluj **or** Bihor | One county only | Multi-value geographic filters in schema, grounding, compiler, rows and export |
| Exclude a named supplier | Unsupported | Explicit exclusion operators and exact IDs |
| Individual contracts above 1 million lei | Unsupported | Transaction-level value bounds |
| Suppliers with more than 1 million lei combined | Unsupported | Separate aggregate-level bounds; this is a different question |
| Groups of ALL / ANY conditions | Unsupported | A bounded rule structure with explicit grouping and validation |
| Compare two hospitals' contracts during 2023–2025 | Current comparison is an all-activity direct-acquisition profile comparison | A filtered comparison implementation plus exact second-entity ID |
| Only confirmed single-bidder awards | Supported for the TED-confirmed contracts subset | Show known-data coverage; unknown is not multiple bidders |
| Only multiple-bidder awards | `singleBidder: false` currently means no condition after validation | A distinct competition-state operator |

The expanded rule editor should say **Toate condițiile** and **Oricare dintre condiții**, with indentation and visible groups. Avoid SQL terminology in the product. Keep query-level conditions separate from restrictions applied to grouped totals.

## Correctness constraints that affect the design

### A chart switch must not silently become a different question

The existing `block` field mixes presentation and analytical semantics:

- A ranking displayed as a table or bars can use the same result rows.
- Comparison, risk distribution, scatter and entity-superlative operations use all-activity profile marts and do not honor the ordinary transaction filter set.
- Partner networks and flows have their own focal-entity scoping and limits.
- The current county map rejects a single-county or locality filter.
- The current trend operation compares monetary change between endpoint years; it is not simply the selected measure drawn over time.

Use **Tabel / Bare** for genuinely equivalent presentation choices. Use **Compară**, **Vezi profilul de risc**, or **Urmărește partenerii** for analytical actions, with their applicable scope visible. Where scope changes, explain it at the action and preserve the previous query; do not silently remove conditions.

### The accepted question must equal the executed question

A read-only validation probe showed that new fields such as `counties`, `minValue` and `excludeSupplierId` are silently discarded by today's validator. The new interface must not display them as active until the complete execution path supports them. Unsupported conditions should be returned as explicit validation errors rather than disappearing.

Exact entity identities should survive selection, editing, comparison, permalinks and exports. The current suggestion response only supplies entity names and counties; it needs IDs to avoid selecting one institution and subsequently resolving a homonym.

**Fără licitație** and **un singur ofertant** must be separate interpretations. Both the current phrase parser and AI instructions conflate them. Present explicit acquisition-type and competition choices; ambiguous language should lead to a small clarification at that phrase.

### Preserve the result while a new question is being edited

Keep a draft query separate from the query that produced the visible answer. Show **2 modificări neaplicate** and **Actualizează răspunsul**. Do not blank the answer while someone edits or run a database query on every keystroke. Exports and investigation saves use the applied query and visible result, never an unexecuted draft.

Natural-language input can remain an optional shortcut that prepares these same visible conditions. It should neither be required for complex filtering nor quietly approximate an unsupported request. The structured representation is the source of truth.

## Recommended delivery order

1. Choose A, B or C as the primary interaction.
2. Mock the selected interaction in the approved visual design, including one ordinary query, one complex query, an edit, a failed match, a scope-changing analysis and a saved query.
3. Establish strict query validation, exact selected identities, and capability rules for each analytical operation.
4. Connect the existing supported transaction filters and evidence workflow.
5. Add multi-select, exclusions, transaction/aggregate thresholds and filtered comparisons as explicit engine extensions. Demonstrate each through results, source rows, URLs, exports and Anchete.
6. Add branching question history inside Anchete when its semantics are defined.

## Code inspected

- [Builder](../../apps/web/app/intreaba/Builder.tsx): vocabulary, required steps, suggestions, chip editing, input behavior and spec construction.
- [AskPanel](../../apps/web/app/intreaba/AskPanel.tsx): mode switching, execution, result state, evidence rows, exports and query clipping.
- [AskSpec and validation](../../apps/web/lib/ask/spec.ts): supported conditions and normalization rules.
- [Query compiler](../../apps/web/lib/ask/compile.ts): transaction filters, analytical scopes, result limits and evidence queries.
- [Grounding](../../apps/web/lib/ask/ground.ts) and [suggestion endpoint](../../apps/web/app/api/suggest/route.ts): entity, category, locality and person resolution.
- [Phrase parsing](../../apps/web/lib/ask/intent.ts), [AI interpretation](../../apps/web/lib/ask/llm.ts), and [API](../../apps/web/app/api/ask/route.ts): both input paths into the shared specification.

Verification was read-only: source inspection and direct `validateSpec` probes. No database query or external AI request was needed, and no implementation changes were made.
