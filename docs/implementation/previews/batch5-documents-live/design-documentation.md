# Contract documents — design extension record

Recorded 26 September 2026. Fresh generic-agent substitution for the unavailable specialized Impeccable documenter. This is a bounded source-and-evidence documentation pass; no browser session, network request, UI edit or canon refresh was performed.

## Preserved system

This ordinary extension follows [the live direction](../../../../apps/web/.impeccable/surfaces/contract-files-live.md), [PRODUCT.md](../../../../PRODUCT.md), [DESIGN.md](../../../../DESIGN.md) and [the existing sidecar](../../../../.impeccable/design.json). It introduces no new visual world or reusable global token. The files workflow retains the production contract facts and source actions, then moves through explicit file coverage, preparation, search, an inline original/text reader and saved investigation evidence.

Five-line system summary:

1. Palette: forest actions and ink on ivory light surfaces; green-black dark surfaces inherit the existing theme variables.
2. Type: Bricolage headings, IBM Plex Sans reading/control text and IBM Plex Mono source hashes preserve the incumbent families.
3. Type ramp: local section headings are 28px (25px on narrow screens), reader headings 23px, file titles 17px, reading text 15px and supporting controls/metadata 12–14px.
4. Structure: open ruled rows, flat surfaces and restrained borders keep file names, source access and page text prominent.
5. Rules: reuse shared theme/font roles, show source and coverage explicitly, preserve visible focus and text state; no new named system rules are introduced.

## Local variations

[ContractFiles.tsx](../../../../apps/web/components/documents/ContractFiles.tsx) and [documents.css](../../../../apps/web/components/documents/documents.css) implement these surface choices. They are descriptive of this workflow, not additions to the global scale.

- File rows use a format label, flexible filename/status column and trailing action column. Thin separators and 26px vertical row padding provide grouping without raised cards. Small format-label corners are 4px.
- Buttons use 7px corners, a 40px minimum height and 9px × 14px padding. The committing search/save action has the shared accent fill; other actions use the shared surface. Fields retain visible labels, 7px corners and a 42px minimum height. These dimensions do not replace monitoring's larger controls in the canon.
- Provenance lives in native disclosures with code, source dates, original hash and original download. Progress is a small native bar accompanied by stage and page counts; queue positions and recorded request counts remain words and numbers.
- The reader uses a 1.15fr/1fr original/transcript split with a 26px gap. The original PDF has its own white document field even in dark theme. Extracted text uses the app surface, preserved whitespace and a 1.8 line height; this is source content, not decorative imagery.
- At 760px and below the reader stacks, file actions move below the filename, search fields stack and provenance becomes a single column. The embedded PDF height changes from 680px to 480px. In-document search also stacks at 480px. Long filenames and hashes wrap locally.
- Search uses the existing amber-soft role for literal-term highlights. Cross-file results, document-result labels and reader highlights retain separate applied queries; opening a result restores that result's term.
- Quote saving stays inline beside the source text. The investigation picker, optional new-investigation title and observation field retain familiar native forms. [DossierEvidence.tsx](../../../../apps/web/app/anchete/DossierEvidence.tsx) renders the preserved quote with page/method, original/source links and a hash disclosure in the existing private workspace.
- The [contract detail](../../../../apps/web/app/contracte/[nid]/page.tsx) supplies the Files anchor and component. [EvidenceDrawer.tsx](../../../../apps/web/app/intreaba/EvidenceDrawer.tsx) opens contract/direct-acquisition titles in a separate tab while preserving drawer context.

## Accessible states and truthful availability

Source inspection confirms labeled native inputs/selects, semantic section headings, titled PDF frames, focusable transcript content and a reader section that receives focus when opened. Document controls use a visible 2px accent outline with a 4px offset. Results use polite live regions, cross-file results expose busy state, progress has a stage label, failures use alerts and successful quote saving uses status text. Current result pages expose `aria-current="page"`; disabled controls use the native disabled state. Reduced-motion CSS removes local transitions, and opening the reader respects the reduced-motion preference.

The whole-page save action provides a keyboard-friendly alternative to selecting a passage when the page text is within the supported length. Selection also has keyboard, pointer and touch handlers. These are observed implementation provisions, not a full accessibility certification or a claim that every focus-return path was tested.

Copy distinguishes absent association, unsupported source fallback, metadata-only files, incomplete list coverage, queued/running/failed work, archived originals without text, ready text, no matches, no extracted page text, signed-out saving and disabled acquisition. OCR is explicitly identified and readers are directed to verify the original. Search states explain that unprocessed files are excluded and that a limited result set is truncated. Saved evidence preserves this source distinction rather than implying that OCR is a verified transcript.

## Evidence checked and scope

Read the direction, canon files, component/CSS sources above, the shared palette/focus rules in `approved.css`, relevant shared typography in `globals.css`, and [implementation handoff](../../batch5-documents-implementation.md). Read [finish-review.md](finish-review.md), [finish-verdict.md](finish-verdict.md), [verification.json](verification.json) and [search-context-verification.json](search-context-verification.json). The implementation handoff is the authority for backend/deployment claims here; this pass did not independently audit the complete backend.

The original fresh review records inspection of ten named captures and found one material issue: in-document search overwrote the cross-file query context. The follow-up verdict marks that scored issue resolved and gives a ship disposition for the fix. It explicitly does not constitute a second whole-surface review. Current component source agrees with the separation described in the verdict.

The supplied main verification records 16 passing browser checks, including an actual public PDF with OCR, search, server-validated quote saving, original-page links, export source references and no horizontal overflow at 320/390/800/1440px. It records no runtime errors, no external browser requests and zero new SEAP requests. The follow-up records four passing assertions for different cross-file/document terms and reopening each result type, again with zero new SEAP requests. Those are existing reported results; this documentation pass did not rerun them or inspect screenshot pixels.

Acquisition support is bounded to verified simplified notices (type17/SCN17). The archived pilot supplied five metadata entries out of nine reported files; coverage remains explicit and is not represented as a fully checked list. Acquisition requires `DOCUMENTS_ENABLED=true` and a separately deployed worker. The current work is local and is not committed, pushed or deployed according to the implementation handoff; supplied checks do not establish successful production acquisition. Public PDF/OCR evidence is real source material. Temporary private cases are labeled local examples. Screenshots are development evidence, and no generated or shipping raster asset was introduced.

## Canon preservation and prior drift

SHA-256 values before and after this documentation write match the supplied baseline:

| File | SHA-256 |
| --- | --- |
| `PRODUCT.md` | `83fc90efd5a984ae7049eea8512902f4205133f2c95444aa777aa7ac94d13b24` |
| `DESIGN.md` | `a6991426170ab2f72767179f1696a9adf86166881bf68160c5706b60fa2ab3e6` |
| `.impeccable/design.json` | `de3d623ee0466006854b0ec81158f0270ee02fdc0ac3bc1ab8314e1f722b9611` |

Not canonized or repaired: the existing DESIGN.md already identifies older discovery kickers, isolated glyph decoration and historical base/approved-token differences; those pre-existing issues remain outside this ordinary extension. Local control sizes, reader dimensions and PDF white ground are surface variations, not global rules. The resolved search-state defect is recorded as a fix rather than a design convention.
