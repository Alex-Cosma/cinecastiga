# A — The editable question

**[Open the clickable sketch](../cinecastiga-question.html)** in a browser. It is one offline HTML file, with the approved type, colors, navigation, original discovery screens and working Anchete flow.

The [interaction specification](../../docs/mockups/04-question-sketch.md) was written before implementation. This is a separate mockup; the original v1 and production application are unchanged.

## A one-minute walkthrough

1. Start with **“Cine furnizează spitalelor din Cluj, în 2024–2026?”** The answer contains eight authentic contract records, grouped into suppliers.
2. Click **2024–2026**, select **2026**, then **Păstrează perioada**. The orange state identifies one pending change; the previous answer stays visible.
3. Click **Adaugă o condiție → Ce s-a cumpărat → Sănătate → Păstrează alegerea**. Both changes stay visible in the question.
4. Click **Actualizează răspunsul**. The result becomes five records totaling **9,314,100 lei**. The question folds into a compact summary; **Modifică întrebarea** opens it again.
5. Switch **Bare / Tabel**, inspect **Sursele**, or click one supplier. The main sources button covers the entire applied selection; a supplier opens only its own matching records.
6. **Salvează în anchetă** captures the applied question, its conditions, grouped result and all source records. Open **Anchete**, inspect the captured sources, then **Redeschide întrebarea** to restore it. Notes and JSON dossier export remain functional.

**Cum se schimbă în timp?** and **Pe ce se duc banii?** change the question while retaining its conditions. Apply explicitly to update the answer. CSV and copied links always refer to the applied question, including when another edit is pending.

## Screens

| State | Desktop | Mobile |
| --- | --- | --- |
| Initial question and answer | [Preview](previews/desktop-question.png) | [Preview](previews/mobile-question.png) |
| Add a condition / phrase picker | [Preview](previews/desktop-add-condition.png) | [Preview](previews/mobile-picker.png) |
| A more detailed question, before applying | [Preview](previews/desktop-refined-question.png) | [Preview](previews/mobile-refined-question.png) |
| Updated answer | [Preview](previews/desktop-applied-question.png) | [Preview](previews/mobile-applied-question.png) |

Desktop pickers stay near the clicked phrase. Mobile uses bottom sheets. Escape cancels a picker; arrow keys move among its choices; Tab reaches its confirmation button. An optional three-step **Arată-mi cum** guide explains the interaction.

## Scope and implementation handoff

The sketch calculates results from the original 48 authentic records, across four authorities, selected from 2024–2026. It is not a complete search of SICAP. Every result states this boundary; sums can include framework agreements and amendments and do not establish actual payments. The initial 398,857,099.93 lei includes large framework records. Source URLs are retained from the project; live SICAP availability has not been verified.

Available conditions cover institution kind, institution county, period, procurement type, category and an exact supplier. The source data contains only Cluj and București; selections without matching records have an explicit empty state. Employee counts were not retrieved, so the employee option is omitted; no staffing data is simulated. The source module contains a conditional employee editor for a future verified enrichment, with latest-filing and missing-data explanations.

This is the interaction design for proposal A, not a replacement query engine. Production integration should bind these controls to supported specification fields and preserve the scope distinctions described in [the query review](../../docs/mockups/03-complex-queries.md). Arbitrary OR groups, exclusions, comparisons, relationship exploration and risk analysis are not simulated here.

Investigations use local browser storage. A copied `file:` link requires the same HTML file on another device. No account or server persistence is implied. The original county-map attribution remains embedded.

## Verification and editing

**35 browser checks passed; zero JavaScript runtime errors.** See [the browser verification record](previews/verification.json) for edit/apply, cancellation, source scope, chart equivalence, export, save/reopen/reload, keyboard behaviour, mobile controls and layouts at 1440, 768, 390 and 320 pixels. Preview dossiers were created during verification and are not preloaded into the HTML.

The new UI lives in `src/question.js` and `src/question.css`. The bundler reuses the original prototype fragments and applies checked integration substitutions in memory; it does not modify them.

```sh
python3 mockups/question/src/build.py
```
