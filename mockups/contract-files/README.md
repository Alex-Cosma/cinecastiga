# Contract details + files — interactive local mock

Open **http://127.0.0.1:3112/contract-files/**. Existing Python mock server serves only `mockups`; if stopped, run from repository root: `python3 -m http.server 3112 --bind 127.0.0.1 --directory mockups`.

Try:
1. Click **Lista de contracte**, type `buzau`, then click the contract title. A new tab opens; original drawer/filter stay intact.
2. On the detail page click **Descarcă și procesează** for Caiet de sarcini, then **Reia procesarea** for the illustrative clarification. One active job, one queue position; progress goes source/download/extraction/OCR before the next job starts.
3. Reload while running: simulated schedule persists. Within this prototype origin/tab set, localStorage+Web Locks deduplicate job starts; this is not a global server worker. Simulation advances by elapsed wall-clock time even if the tab closes. Reset affects this mock only.
4. Once prepared, **Deschide documentul** opens an inline actual PDF viewer. For the specification, page-linked OCR text is the real local pilot output (machine-recognized, not fully verified). The signed original stays downloadable separately. Page2is blank in the real file and correctly has no OCR text.
5. Initial available court PDF opens immediately. Clarification uses a conspicuously fictional fixture to demonstrate retry; it is not a document of this real procurement. Try theme switch and mobile layout.

No backend/application/schema edits or deployment. No external calls by prototype code: files/OCR/fonts are local. Public-source and existing local-application anchors navigate only if clicked. Save-to-investigation is an explicitly labeled local demonstration, not a production save. Download/process percentages and state transitions are synthetic; no acquisition/OCR worker runs.

Real metadata: local core.contracts ca_notice_contract_id107063311/internal561760, contractNo181777,value996846RON; source awardSCNA1128762/100594775, one winnerRC ENERGO INSTALL/entity2099469, municipalityBuzău/entity2144364. Contract date is stored2025-11-23T22:00:00Z and displayed24November2025in Europe/Bucharest. Display headline paraphrases the verified participation noticeSCN1168231; full notice title disclosed under details. Values are registered amounts, not payments. Missing bidder count remains unknown. No corruption or court-result claim.

Fixtures preserve exact original bytes:
- `fixtures/CS ILUMINAT_semnat.pdf.p7s`: user's supplied public document, SHA25682549efe9ccbb7fd08edaf8504b5f1038435d4e094b3c5e06ea3a6150311ab43.
- `fixtures/CS ILUMINAT.pdf`: extracted signed payload, SHA256002f500d6bc4905bc5f9be1c155784c1aded187e0e72cb6d17cc5a07f80789c7.16scanned pages; OCR from local Apple Vision retained in ocr.json. Signature integrity verified offline, certificate trust/revocation not validated.
- `fixtures/HC-127-2025.pdf`: pilot's automatic download, SHA2569b305927ede6acf7a831ecde2a111df668bac20e046d61fefdf33f879b3cb4da.10scanned pages; readable as PDF, no OCR represented as complete.
- `fixtures/clarificare-exemplu.pdf`: existing synthetic fixture from ../documents/fixtures/. Clearly fictional,1page.

No shipped raster assets. Fonts use existing offline ../src/fonts.css. Code-led existing-design extension; direction brief under apps/web/.impeccable/surfaces/mockups-contract-files-index-html.md. Verification screenshots/checks and source evidence under docs/implementation/previews/batch5-contract-files/. Canon PRODUCT.md,DESIGN.md and design.json are preserved.

`node mockups/contract-files/check.mjs` uses dedicated Chrome CDP9237 and local server; checks new-tab navigation, queue stages, reload, real source bytes, reader/page fidelity, dark/mobile/reduced-motion and zero external network during the interactions. It resets only prototype state.

Verification completed:26checks passed. Fresh finish review disposition: **ship**, limited to this local mock; see `docs/implementation/previews/batch5-contract-files/finish-review.md`. The specialized reviewer type was unavailable, so a fresh generic agent followed the skill's review contract. Design documentation uses the same fresh-agent substitution and preserves the incumbent canon. Search within/across prepared files and saving referenced passages to Anchete are proposed next steps, not features implemented by this mock.
