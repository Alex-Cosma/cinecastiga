# Documentele anchetei — functional mock

Run from repository root:

```sh
python3 -m http.server 3112 --bind 127.0.0.1 --directory mockups
```

Open http://127.0.0.1:3112/documents/ . Existing local app3110 is unchanged.

Try `utilaje`, open the passage beginning `Operatorul va demonstra` (page2), open its reference PDF, add a note and save. The **Pasaje păstrate** section retains exact quote, document, page, question, note and actual PDF SHA-256 in this browser only. Reload persistence and JSON notes export work. PDFs themselves are served fixture assets, not stored in localStorage. Link-only and pending documents truthfully lack indexed text. OCR is an illustrative state and no extraction worker runs. Adding a PDF keeps only temporary metadata/object URL in the browser; it does not upload or parse it. File selection is lost on reload, unlike saved fixture passages.

All authorities, documents, contracts and statements here are **fictional**. They must not be used as investigative findings. No production auth, source acquisition or application integration is present.

`data.js` is the authored text source. Two real PDF fixtures have matching physical page counts (3and1); `generate-fixtures.mjs` can rebuild them through dedicated ChromeCDP9237 with this server running. Regeneration changes PDF bytes/hash; clear the prototype's localStorage key `cinecastiga:document-mock:v1` before testing regenerated fixtures. Do not use a real investigation as a fixture.

`node mockups/documents/check.mjs` runs browser checks in a fresh dedicated tab; it resets only the prototype's localStorage key on its own origin. It exercises no real application endpoints or external sources.24assertions and7desktop/mobile/dark captures are in `docs/implementation/previews/batch5-documents/`.

Discovery and implementation outline: `docs/implementation/batch5-documents-discovery.md`. Strict automatic-fetch pilot proposal: `docs/implementation/batch5-document-pilot.md`. All discovery so far is read-only/offline, zeroSEAPrequests.
