# Peer comparisons — design extension record

Recorded 20 September 2026. This is an ordinary **Operate** extension of the existing entity profile, source drawer and private investigation workspace. The visual authority remains [DESIGN.md](../../../../DESIGN.md), its [existing sidecar](../../../../.impeccable/design.json), and the [comparison direction contract](../../batch4-peers-design.md). [PRODUCT.md](../../../../PRODUCT.md) supplies the Romanian language, source transparency and preserved-evidence commitments.

This documentation pass writes only this record. It preserves PRODUCT.md, DESIGN.md and `.impeccable/design.json`; it does not introduce a new visual world, regenerate the sidecar or promote page-specific choices into global tokens. The Impeccable document reference was consulted for extraction and comparison. Its global-file replacement workflow does not apply to this explicitly scoped preservation record.

## Implemented extension

The [comparison route](../../../../apps/web/app/entitati/[id]/comparatii/page.tsx), [explorer](../../../../apps/web/app/entitati/[id]/comparatii/PeersExplorer.tsx) and [local stylesheet](../../../../apps/web/app/entitati/[id]/comparatii/peers.css) implement the direction contract's reading order: return to entity, labelled criteria and explicit Apply, inspectable group definition, focal-versus-median comparison, source/save actions, paginated members and methodology disclosure. The route sits inside the existing main landmark.

The signature is a comparison whose denominator and sources remain visible. The median uses the complete group and excludes the focal entity; every member has its own source action. Small groups explain the interpretation threshold while retaining available sources. Full-group save wording states what is preserved. These are workflow expressions of the incumbent investigative identity, not new global design requirements.

## Incumbent comparison

| Area | Observed implementation and relationship to the incumbent |
| --- | --- |
| Colors and themes | Uses the shared `--paper`, `--surface`, `--sunk`, ink, muted, line and accent roles from the `globals.css` → `approved.css` cascade. No local palette or theme replacement. Forest/ivory and existing dark overrides remain authoritative. Text and source labels carry meaning independently of the bars' colors. |
| Typography | Shared Bricolage display and IBM Plex body variables; body remains 15px/1.6. The route uses a 42px heading, reduced to 34px on mobile; 25px section/value emphasis; 13px supporting labels; 14–17px role-specific copy and member values. Tabular numerals support comparison. These are local hierarchy choices within existing tool-page practice, not amendments to the global type ramp. |
| Layout | A 1120px maximum matches the investigation workspace. Open sections, thin separators and one inset comparison panel preserve the established reporting structure. The form adapts below 1050px and 700px; mobile moves labels above values, stacks actions and keeps source buttons alongside their records. These thresholds remain surface-specific. |
| Material and shapes | Flat tonal separation uses `--sunk`; record rows use thin lines. Controls retain the familiar 7px button and 6px field corners. The comparison panel's 12px radius has precedent in the workspace editor; the 3px bar corner is a local detail with precedent in shared compact UI. Neither becomes a new global radius token. |
| Controls | Native labelled selects and explicit Apply; filled accent for the committing action and surface buttons for source/navigation actions. Main buttons and selects have a 44px minimum height; the compact measure toggle uses 38px. Disabled controls, hover feedback, semantic pressed state and a 2px accent focus outline with 4px offset retain the tool-control vocabulary. |
| Motion and feedback | Buttons use a short .18s background transition. Decorative bars use .35s transform scaling, with transitions removed for reduced motion. Numbers are not animated. The loading region reserves space and exposes readable status; failures expose alert text and a recovery action. |
| Source and frozen evidence | The existing [EvidenceDrawer](../../../../apps/web/app/intreaba/EvidenceDrawer.tsx) accepts a peer selection and explains whole-group save semantics without introducing a second drawer style. [PeerEvidenceSummary](../../../../apps/web/app/anchete/PeerEvidenceSummary.tsx) reuses workspace text, disclosure and focusable horizontally scrolling table patterns, preserving exact decimals and focal-exclusion wording. |

## Review and advisory disposition

The independent [finish review](finish-review.md) accepted the visual extension as **ship**, with two bounded copy advisories. Both corrections are present in the inspected explorer: singular source/contract agreement, and a median definition that handles tied values. The root implementation pass reports a subsequent successful browser confirmation with 23 checks and replacements of all 12 screenshots at their existing paths. The subsequent [bounded verdict](finish-verdict.md) confirms both copy findings **resolved**, with no visible resulting regression. The broader review remains in `finish-review.md`.

The retained [detector output](design-detect.json) is historical evidence of its single run. Its width-transition warning was resolved: the inspected stylesheet uses `transform: scaleX(...)` and reduced-motion support. Eight radius/type advisories describe local values outside the concise global frontmatter scale. The finish reviewer accepted these as compatible tool-specific choices; they do not justify changing DESIGN.md or its sidecar. No detector rerun or product edit was performed for documentation.

No new context-loader drift finding was supplied in this pass. The older base CSS and approved overriding palette remain the previously documented cascade distinction; this record does not attempt drift repair or treat them as competing new authorities.

## Evidence and limits

[Review packet](review-packet.md), [browser observations](browser-checks.json), [verification](verification.json) and [implementation notes](../../batch4-peers.md) carry the detailed scope and checks. The initial independent review opened all 12 supplied images; this documentation pass compared source and incumbent records and did not rerun browser, build, detector or test checks. Screenshot evidence does not certify every keyboard, assistive-technology, contrast or error-state combination.

The 12 `peer-*.png` captures are browser review evidence, not shipping raster assets. No new product raster asset or generated-image provenance record is required. National-query latency and the explicit 499-other-member whole-group capture limit remain documented operational boundaries. Local design acceptance grants no commit, push or deployment authorization.
