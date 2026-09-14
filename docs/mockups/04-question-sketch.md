# A — The editable question: clickable sketch

Before-implementation interaction specification · 13 September 2026

Build a separate artifact, `mockups/cinecastiga-question.html`, in the approved ivory, forest-green and mint visual language. Keep the original `cinecastiga-v1.html` intact. This sketch demonstrates precise question composition using the authentic local extract; it does not connect the production query engine.

## The initial screen

Open with the existing hospital selection in Cluj, 2024–2026, already applied. The visitor starts with an answer and a readable question. Clicking a phrase edits that part; no knowledge of query syntax is required.

```text
← Descoperă                                        Anchete

ÎNTREBAREA TA
Cine furnizează [spitalelor ▾]
din [Cluj ▾], în [2024–2026 ▾]?

[Toate achizițiile ▾]  [+ Adaugă o condiție]

Arată [primele 10 firme ▾], după [valoarea achizițiilor ▾].
                                           [Vezi răspunsul →]
──────────────────────────────────────────────────────────
RĂSPUNSUL LA ÎNTREBAREA APLICATĂ
Cine furnizează spitalelor din Cluj?

[Tabel | Bare]             [Sursele] [Salvează în anchetă]
[result calculated from the selected source records]

Continuă de aici
[Cum se schimbă în timp?] [Pe ce se duc banii?]
```

Near the result, say: **„Rezultat din selecția de înregistrări reale inclusă în prototip. Nu reprezintă toate achizițiile spitalelor din Cluj.”** Show the actual source period and explain the incomplete 2026 period where relevant. Counts and amounts always derive from matching records; do not invent results for unsupported institutions or places.

## Three states to demonstrate

| State | Question area | Answer area |
| --- | --- | --- |
| Initial / applied | Hospital, Cluj, 2024–2026 phrases; quiet condition action | Shows the matching supplier ranking and exact applied scope |
| Editing / pending | An active phrase receives a restrained orange outline; committed changes produce **„2 modificări neaplicate”**, **„Renunță la modificări”**, **„Actualizează răspunsul →”** | The previous answer remains visible, labeled **„Răspunsul de mai jos folosește întrebarea anterioară.”** |
| Applied again | Pending count disappears; edited phrases retain their values | Result, heading, source rows, export and save snapshot update together; announce **„Răspuns actualizat.”** |

Count changed conditions relative to the applied question, not clicks. Editing one period three times is one change. Opening a picker changes nothing. Escape or Cancel closes that picker and preserves its original value. Committing a picker changes the draft; only applying the question changes the result. A committed value equal to the applied value clears that change.

## Phrase editors and additional conditions

The three headline phrases open focused pickers for institution kind, county and period. Use searchable named choices, visible selection and a clear **„Păstrează alegerea”** action. Institution kind labels include **„spitale”**, **„comune”**, **„orașe și municipii”**, **„consilii județene”**, **„școli”** and **„toate instituțiile”**. Geography means the buying institution's location, not the supplier's address or the place of the work.

**Adaugă o condiție** opens one searchable menu, grouped by meaning:

- **Achiziții:** type (**„Achiziții directe”**, **„Contracte”**, **„Toate achizițiile”**) and purchasing category (**„Ce s-a cumpărat”**).
- **Firme:** an exact supplier from the extract; employee bounds only if authentic Ministry of Finance data has been supplied for this sketch.
- **Unde și când:** shortcuts to the existing county and period controls, without duplicate conditions.

Render additional conditions in a consistent order beneath the headline. Each is editable and removable. Employee filtering, if available, states the filing year and the effect of missing filings beside the condition. Never infer staffing from contract values.

Keep the long-question layout readable: one headline, an ordered row of conditions, then the presentation/limit controls. Let these wrap naturally; do not truncate selected values or hide conditions in a horizontal scroller.

## One scope, several ways to understand it

**Tabel / Bare** displays the same ranked entities, values and top-N limit. The main **Sursele** action opens all records matching the applied question, labeled **„Toate sursele selecției”**; clicking one supplier opens only that supplier's matching records. Use these exact scopes in the associated counts, totals and exports. The top-N ranking limit changes the number of displayed suppliers, not the question's overall source scope.

**Cine câștigă?**, **Cum se schimbă în timp?** and **Pe ce se duc banii?** are question choices for supplier ranking, time aggregation and category aggregation. In this sketch each operates on the same supported transaction filters. Their headings, dimensions and measure labels change explicitly; ranking-only controls disappear when inapplicable.

**Compară**, **Urmărește partenerii** or **Vezi profilul de risc**, if offered as further actions, are separate analytical tasks. Explain any changed scope before entering one. Do not render unsupported analytical results or imply that a different chart automatically preserves every condition. The current question remains recoverable.

If a combination has no records, keep every condition editable and say **„Nicio înregistrare în această selecție. Încearcă o perioadă mai largă sau elimină ultima condiție.”** Offer an explicit draft adjustment, not an automatic scope reset.

## Save, source and small-screen behavior

**Salvează în anchetă** saves the applied question, its exact conditions, result snapshot, timestamp and captured source records into the existing local Anchete workflow. During pending edits, label the action **„Salvează răspunsul afișat”**. Exports and copied query links likewise refer to the applied state. The pending draft must never replace the question that produced the saved evidence. Retain the prototype's clear browser-local storage notice.

Desktop selectors are compact, anchored editors. On mobile they become bottom sheets with a title, close control, scrollable choices and a reachable apply button. Preserve the question and current answer behind the sheet. Trap focus while open, restore it to the invoking phrase, support Escape and show visible keyboard focus. Keep primary actions reachable without a horizontally scrolling control bar.

An optional **„Arată-mi cum”** walkthrough uses three dismissible steps: **„Atinge o expresie ca să o schimbi.”**, **„Adaugă doar condițiile care te interesează.”**, **„Aplică întrebarea când ești gata.”** It never blocks normal use or changes the question automatically.

## Minimum review path

Open the hospital answer → change county and period → observe two pending conditions while the original answer remains → cancel all edits → add a source/category condition → apply → compare equivalent table and bars → inspect underlying sources → save the applied query to an investigation → reopen the dossier and its source snapshot. Repeat the edit-and-apply path on mobile and with the keyboard.
