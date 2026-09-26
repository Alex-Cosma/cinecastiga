# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People investigating public procurement in Romania who need to understand a result, check the underlying records, and keep evidence for follow-up. The current brief prioritizes an intuitive Romanian watchdog workflow and exact sources; it does not establish a narrower audience segment.

## Product Purpose

**cinecâștigă?** makes Romanian procurement records understandable and traceable: authorities, suppliers, contracts, partners, and signals lead to their source records. A successful investigation can move from a question to the relevant records, retain what was observed, and revisit changes without losing the original evidence.

## Operating Context

Readers discover an authority or company, apply a question and filters, inspect the exact source selection, and save evidence in an investigation. Investigations contain questions, evidence, chronology, and verification tasks, with explicit private access roles. Recipes preserve a reusable question version. Monitoring follows a frozen question/source selection, establishes an initial reference without alerts, and compares later validated data versions.

The public record sources include SEAP/SICAP and TED, supplemented by Ministry of Finance financial statements and ONRC company information where present. Coverage and collection dates are observed data, not a promise of complete or live collection.

## Capabilities and Constraints

- A saved scope includes the question, precise grouped conditions, and source-drawer filters. Human summaries must distinguish base query conditions from additional restrictions and the effective source stream.
- Historical profile views and transaction views use different populations; their source scope must be stated accurately.
- Procurement date, time first observed in a watched selection, and technical validation time have different meanings.
- Monetary source values retain their exact stored decimal precision. Registered contract values are not necessarily payments; consortium attribution may be estimated where member values are unavailable.
- Entering or leaving a selection does not by itself establish a new procurement, cancellation, first import, or wrongdoing.
- A failed or incomplete refresh must not produce an apparently successful check. The last successful frozen version remains available.
- Monitoring is private to its owner. Copying a change into an authorized investigation preserves both source versions and its explanation under the investigation's access controls; it does not grant access to the original private watch.
- In-app updates and optional email digests are separate capabilities. Email availability and delivery failures must be shown truthfully; current local verification did not send mail.

## Brand Commitments

The existing name is **cinecâștigă?** and the tagline is “Cine câștigă banii publici din România — și cum”, recorded in [site.ts](apps/web/lib/site.ts). The user-facing language is Romanian. Actions describe their outcome directly, and explanations distinguish evidence from interpretation. The footer identifies the project as open and noncommercial; this is not a separate licensing or availability claim.

The incumbent visual identity is recorded in [DESIGN.md](DESIGN.md). Future extensions preserve it unless a redesign is explicitly requested.

## Evidence on Hand

- [Site identity](apps/web/lib/site.ts), [application shell and source caveats](apps/web/app/layout.tsx), and [methodology](apps/web/app/metodologie/page.tsx).
- [Batch 2 implementation evidence](docs/implementation/previews/batch2/) and [Batch 3 review packet](docs/implementation/previews/batch3/review-packet.md).
- [Monitoring design extension](docs/implementation/batch3-design.md) and [refresh/checkpoint protocol](docs/implementation/batch3-refresh-checkpoints.md).

Preview investigations and monitoring examples marked fictitious demonstrate behavior; they are not findings about real institutions. Browser fixtures, automated tests, and a validated existing-data checkpoint do not establish complete current collection or production email delivery. Do not invent customer, reach, freshness, or effectiveness claims.

## Product Principles

1. Make the exact source and selection easy to inspect.
2. Preserve what was observed when evidence is saved.
3. Distinguish facts, unknowns, derived signals, and interpretations.
4. Make privacy, failure, and unavailable features explicit.
5. Use plain Romanian actions that support the next investigative step.

## Accessibility & Inclusion

The application is a responsive Romanian web interface with light and dark themes. Preserve keyboard operation, visible focus, labeled controls, semantic headings and tables, understandable loading/error messages, and reduced-motion behavior. State must remain understandable without color alone. Existing checks cover selected flows and viewport behavior; no full accessibility certification is claimed.
