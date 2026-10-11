---
version: 1
slug: "document-categories"
primary_target: "apps/web/components/documents/ContractFiles.tsx"
related_targets: ["apps/web/components/documents/DocumentLibrary.tsx", "apps/web/components/documents/library.css", "apps/web/lib/documents/classification.ts"]
---

# Document categories in the contract reader

Mode: Operate. The visitor finds a relevant procedure document, understands its preparation and classification state, and opens the exact archived source or page. This implements the user-approved [document categories mockup](../../mockups/document-categories/README.md) within the existing contract document reader. It preserves the visual identity and investigative constraints in [PRODUCT.md](../../PRODUCT.md) and [DESIGN.md](../../DESIGN.md).

Initial design verification was local on `fix/document-archive-recovery`; the subsequent production release is recorded as `e2ec0ff` in the implementation record. The [implementation record](../../docs/implementation/document-categories-20261011.md) owns backend behavior, migrations, test results and operational limitations. The earlier expanded-format production release is a separate change.

## Approved behavior

The desktop sidebar offers all documents plus eight role categories, in this order: Caiete de sarcini; Clarificări și modificări; Documentație tehnică; Participare și formulare; Modele de contract; Evaluare și atribuire; Contracte și acte adiționale; Neclasificate. Each category has a count. Below 760px the same choices use a labeled native select. Specification documents receive quiet emphasis in the list.

Filename search also searches archived member names and ignores diacritics. “Doar de citit acum” narrows the list to prepared documents. The list shows at most six original files per page; changing a category, search or readiness filter returns to page one. Empty selections explain the filter or uncertainty and offer “Resetează filtrele”; an empty category never proves that a procedure lacks that document. Mixed archives appear in each applicable category and count once under all documents.

The user chose specification priority across the full history, with newer procedures first within that priority. Manual jobs retain precedence, and running files are not interrupted to reorder them. Only identified specifications can receive that priority; an unseen member inside an unprocessed generic archive is unknown. The sidebar states the automatic-collection policy without presenting a misleading FIFO position. Source pacing and operator settings remain governed by the separate collection controls.

Readable titles retain the exact original filename beneath them. “Surse și clasificare” discloses the SEAP code, available dates and original hash, signature status, classification method and evidence. Filename classification is marked “din numele fișierului” and remains preliminary. Categories describe a document's role; they do not establish completeness, wrongdoing, contract signature or validity. No manual classification editor is included.

Archive disclosures retain member names, categories, processing limitations and actual combined-PDF page references. “Citește” opens the existing reader at that member's original page; the PDF is not reordered. Stored originals remain publicly downloadable, while requesting source retrieval requires authentication. Download, queue, running, failure and partial-text states remain explicit. Existing PDF viewing, prepared-text search, transcripts and quote saving stay in `ContractFiles.tsx` with their existing access and frozen-evidence semantics.

## Incumbent visual system

The implementation extends the approved forest and ivory interface. It reuses the existing Bricolage Grotesque headings, IBM Plex Sans reading text and `DiscoveryIcon` line icons. The authority remains the cascade of [globals.css](../../apps/web/app/globals.css) and [approved.css](../../apps/web/app/approved.css), together with the incumbent document reader styles.

Local library styles use the existing `--surface`, `--ink`, `--ink2`, `--muted`, `--line`, `--accent`, `--accent-ink`, `--accent-soft`, `--accent-line` and `--on-accent` roles. Thin separators, flat rows, native disclosures and form controls continue the existing component language. The selected category uses accent/on-accent; specification rows use accent-soft. Dark mode follows the shared theme variables. No new shared token, visual world or shipping raster is introduced; `DESIGN.md` and `.impeccable/design.json` are preserved.

Desktop uses a category column beside the flexible results area; on mobile, controls and row actions stack while long filenames wrap. Selected category state is exposed through `aria-pressed`, result counts use a polite status, pagination has named controls and disabled boundaries, and keyboard focus remains visible. Reduced motion follows the existing document surface. These are surface behaviors, not new global layout rules.

The two bounded contrast corrections use existing tokens: the filename-search placeholder explicitly uses `--muted` at full opacity, and supporting text on highlighted specification rows uses `--ink2`. They do not alter the global palette.

## Completion evidence and limits

Documentation checked the current component and classification paths, `library.css`, the approved mockup README, `PRODUCT.md`, `DESIGN.md`, the theme token definitions in `approved.css`, the existing admin surface documentation convention, and the implementation record. It visually inspected these final local captures:

- `.local/document-categories-implementation/desktop-reviewed.png`: the all-documents library with category navigation, six rows, source disclosures, current processing state and pagination.
- `.local/document-categories-implementation/mobile-reviewed.png`: the native category selector, stacked controls, wrapped document rows and mobile actions.
- `.local/document-categories-implementation/dark-reviewed.png`: dark-theme specification selection and corrected filename-search placeholder.

The accompanying `.local/document-categories-implementation/verification.json` records 22 passing browser checks, no browser errors and no external/source requests. Its checks cover filtering and pagination, member-name search, an archive PDF rendered at its recorded page, public originals versus authenticated retrieval, queued feedback, 320px and 390px widths, reduced motion and both contrast corrections. Recorded contrast is **7.07:1** for the dark filename-search placeholder and **7.18:1** for highlighted filenames in light mode.

The independent finish disposition supplied for this handoff is **ship for the two corrected contrast findings**; the preceding full review reported no other material findings. This documentation pass inspected the supplied evidence and source without rerunning a browser or expanding that review scope.

These captures show the actual React components through a temporary local fixture with intercepted API responses and synthetic document data. They are private verification artifacts, not shipping artwork, real procurement findings or a complete production-contract-page check. The temporary route was removed; its source remains with the local evidence. Keep `.local` artifacts out of Git. This record does not certify a new production build, deployment, source collection, live totals or multipart-archive recovery; release and operational verification remain separate.
