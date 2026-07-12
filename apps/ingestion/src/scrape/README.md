# scrape/

Source-specific fetchers (e-licitatie.ro, data.gov.ro) built on `@seap/scraper-clients`.

**Boundary (bronze-first rule):** this module writes `raw.raw_documents` ONLY.
It never parses payloads beyond what's needed to page/cursor, and never touches
`core` or `marts`. If a response wasn't archived, it doesn't exist.
