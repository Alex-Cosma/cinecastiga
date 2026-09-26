# Batch 5 documents: design documentation

This is an ordinary extension of the incumbent investigation workspace, documented from the corrected prototype source. It does not establish a new visual system. `PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json` remain byte-identical; their existing authority is preserved. Dedicated documenter type unavailable: this pass applied the degraded Impeccable documenter contract.

Artifact checked: `mockups/documents/index.html`, `style.css`, `app.js`, and `data.js`. Authority and context checked: the three canonical files, `apps/web/.impeccable/surfaces/mockups-documents-index-html.md`, and this packet's `review-packet.md`, `finish-review.md`, `fix-notes.md`, and `verification.json`. This documentation pass used source and supplied evidence only; it did not run a browser, detector, network request, application change, or database operation.

## Inherited system and local expression

| Area | Observed implementation | Relationship to the incumbent system |
| --- | --- | --- |
| Palette | Ivory page (`#f7f8f2`), near-white source sheet (`#fffefa`), inset evidence (`#edf0e5`), forest ink (`#243a30`) and actions (`#204c3c`); dark ground (`#111d18`) and surface (`#18271f`). | These values preserve the recorded palette and semantic roles. Amber highlights and OCR cautions use the existing amber surface; the wordmark retains orange. |
| Supporting text | Local light muted color is strengthened to `#596553`; dark muted remains `#a5b39e`. | The light value differs from the canonical `#6c746b` to support small metadata and placeholders. It is a local readability adaptation, not a replacement token for future surfaces. |
| Typography | Bricolage Grotesque headings and IBM Plex Sans reading text. Case title is 36px on desktop and 28px on mobile. Body is 16px/1.6; source paragraphs are 16px/1.85, reducing to 15px on mobile. Supporting copy spans 12–14px; the file hash is 11px. Reader, section and sidebar headings use intermediate sizes. | The existing family pairing and heading/reading hierarchy remain intact. The local scale gives source text more room than the canonical 15px body role. Intermediate sizes describe this tool's density and are not promoted to shared typography tokens. |
| Layout | Open document rows and thin rules; a 1170px maximum main box including 25px side padding provides 1120px of desktop content. Reader uses a source column with a 300px provenance/save column, then 270px below 950px, and stacks below 700px. | The desktop content width agrees with the investigation workspace. The local 950px and 700px reader adjustments are surface choices, not changes to the incumbent 760px workspace stacking boundary. |
| Depth and shape | Flat source sheet, subdued quotation surfaces, thin borders, 6px control corners and 8px notice/upload corners. No box shadows. Workspace tabs retain a 3px underline and zero corner radius. | Tonal grouping, softly rounded controls and the approved navigation underline belong to the inherited vocabulary. The detector's combined-line underline/radius warning does not establish an accent-card defect. |
| Components and states | Filled forest committing actions, surface secondary actions, labeled native controls, 2px accent focus outlines with 4px offset, semantic active tabs and text status messages. Most buttons are at least 44px high; paragraph helper buttons are 36px. | The source and save workflow extends the existing preserved-evidence component. Hover transitions are local 0.18s state changes and are removed under reduced motion. No new component family or universal touch-target claim is recorded. |

## Direction and source truth

The inherited source-first workflow appears as one continuous search → exact page → saved passage task. Availability and indexing coverage remain visible alongside the document list. The reader keeps the original PDF action, source provenance, page identity and save form together; mobile stacks them with a direct link to the save form. Saved quotations remain paired with document, page, question and note. These are local workflow decisions rather than new global composition rules.

The correction described in `fix-notes.md` is present in `app.js`: native selection must begin and end inside the actual source paragraph and match its text; the save handler independently checks the chosen quote against the fixture paragraph. This addresses the review's finding that selection could include helper wording. `verification.json` reports 24 passing browser assertions, including valid substring selection and selection crossing into the helper, and no runtime errors. The fix notes report recapture and inspection of all seven required evidence screenshots. This documentation pass does not independently repeat those checks.

At the time of this pass, the supplied finish review records `disposition: fix`; the independent post-correction verdict is pending. Documentation completion does not substitute for that verdict or claim final acceptance.

## Assets and scope

There are no shipping raster assets in this prototype. The PNG captures are review evidence. The two synthetic PDFs are authored text fixtures, not photographs or scanned source assets; the illustrative OCR state is disclosed. The interface is built from text, CSS and native controls and uses the shared font stylesheet.

The fictional-data banner, browser-only saving, illustrative extraction/OCR and metadata-only local file addition remain explicit. No production upload, OCR, extraction, server preservation, application integration or document comparison is asserted by this artifact.

## Preservation record

SHA-256 values recorded before documentation and checked after writing:

| Canonical file | SHA-256 |
| --- | --- |
| `PRODUCT.md` | `83fc90efd5a984ae7049eea8512902f4205133f2c95444aa777aa7ac94d13b24` |
| `DESIGN.md` | `a6991426170ab2f72767179f1696a9adf86166881bf68160c5706b60fa2ab3e6` |
| `.impeccable/design.json` | `de3d623ee0466006854b0ec81158f0270ee02fdc0ac3bc1ab8314e1f722b9611` |

Only this documentation file was written by this pass. No local muted-color, type-size, spacing, breakpoint or component variation is canonized as a shared rule. Pre-existing historical kicker/glyph/token drift already excluded by `DESIGN.md` remains excluded and unrepaired because this is an ordinary extension with no authority to change the system.

Final status update by root: the independent `finish-verdict.md` has now arrived with disposition **ship**, scoring the one source-selection finding **resolved**. This is a verdict on that listed fix, not a new whole-surface review. Documentation and review handoffs are complete.
