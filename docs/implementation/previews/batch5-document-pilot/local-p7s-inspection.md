# User-supplied P7S inspection — 26 September 2026

Input: `CS ILUMINAT_semnat.pdf.p7s`, supplied by the user in the repository root. This was **not** an automatic download. The remote pilot remains stopped at 7/10 requests and zero downloaded PDFs. Inspection made no network requests and changed no application/database state.

## Verified locally

- CMS/PKCS#7 SignedData, DER encoded, one signer, includes the PDF content. Not an encrypted envelope or detached-only signature.
- Original: 999,161 bytes, SHA-256 `82549efe9ccbb7fd08edaf8504b5f1038435d4e094b3c5e06ea3a6150311ab43`. Original bytes remained unchanged.
- `openssl cms -verify -binary -inform DER -in 'CS ILUMINAT_semnat.pdf.p7s' -noverify -out <output>` succeeded. Signature integrity verification passed using the embedded certificate. `-noverify` deliberately skips signer certificate trust validation; no certificate-chain, revocation, trusted timestamp or qualified-signature conclusion is made.
- Extracted PDF: 991,344 bytes, SHA-256 `002f500d6bc4905bc5f9be1c155784c1aded187e0e72cb6d17cc5a07f80789c7`; 16 pages; unencrypted/unlocked. PDFKit could parse/render it. Zero native text characters across all 16 pages: OCR is needed for search.
- First page visually inspected: Municipiul Buzău, Direcția Tehnică, caiet de sarcini nr. 138.737/17.09.2025, festive lighting rental/installation/removal for winter 2025–2026. Topic matches the pilot's procurement, but an exact source download URL/hash match has not been established for this user-supplied file.

## Local artifacts

Private ignored folder `.local/document-inspection-iluminat/`: `CS ILUMINAT.pdf`, `inspection.json`, `pages.json`, `page-1.png`, extraction inspection Swift script. The native-text `.txt` has page markers only and is not OCR output. Keep original signed bytes distinct from the extracted PDF and any OCR derivative.

## Application implication

No personal signing certificate was needed to extract this document. Support P7S import by detecting the actual CMS structure, preserving signed original bytes, deriving a separately hashed PDF, and reporting extraction, cryptographic integrity and certificate trust as separate states. Render image-only pages and expose OCR as machine-extracted text with page links and explicit review status. This local inspection validates feasibility for this file; authenticated/public SEAP downloading and production ingestion remain separate unimplemented concerns.

## OCR result

Apple Vision accurate recognition with `ro-RO` and `en-US`, entirely local: all 16 pages processed; 14 pages yielded text. Pages 2 and 16 yielded no text and were rendered and visually confirmed blank. `CS ILUMINAT OCR.txt` contains page-separated machine text; `ocr.json` also records line confidence and normalized bounding boxes for later source highlighting. This is not a searchable-PDF modification: the extracted PDF remains byte-for-byte identical to its signed payload. OCR text has not been fully human-verified; first-page title/date were visually checked. Original PDF/P7S and page reference remain the authoritative evidence.
