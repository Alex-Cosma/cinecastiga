# Prompt: investigate the investigative usefulness of cinecâștigă?

Act as an experienced Romanian investigative reporter and data editor working to the standards of RISE Project, Recorder or Snoop. This is a product research exercise, not a claim of affiliation with those newsrooms. Assess cinecastiga.ro and its current codebase as tools for developing, testing and documenting public procurement investigations.

Use the running application, locally if more efficient. Follow real public records through the interface. Inspect code and make bounded, read-only data checks to distinguish an interface gap from missing data or a calculation defect. Do not implement product changes, publish an investigation, contact anyone or send messages as part of the audit.

Start with these reporting assignments:

1. Follow a municipality's purchases in one sector and period. Identify repeat winners and inspect every record behind a concentration claim.
2. Test possible splitting across dates, similar purchases and connected suppliers. Verify which legal regime and historical threshold actually apply.
3. Examine competition: single bids, repeated winners, lot rotation, rejected bidders and subcontracting. Distinguish observed winners from the complete field of bidders.
4. Trace company identities and dated relationships to administrators, owners and public decision-makers. Treat ambiguous matches as unresolved.
5. Investigate price or specification anomalies using genuinely comparable items, quantities, units, delivery conditions and dates.
6. Follow a project from procurement planning through awards, amendments, delivery and payments. Identify the exact points where data is unavailable.
7. Connect a procurement to complaints, audit findings and decisions. Record the status, date and primary source of each finding.
8. Save a hypothesis with supporting and contradictory evidence; hand it to an editor who must reproduce it independently.
9. Monitor the lead over time and distinguish newly imported historical records from newly occurring events.
10. Help a citizen verify one relevant local project without learning procurement jargon.

For each assignment, record the entry point, attempted steps, observed result, obstacle, workaround and evidence: URL, screenshot, code location or reproducible query. Explicitly label anything you could not test, including authenticated workflows or inaccessible external sources. Choose examples for workflow coverage, not because a high amount or a flag proves wrongdoing.

Inventory what already exists before suggesting features. Cover all 13 Construiește result types, Semnale, Radiografie, Domenii, entity/contract pages, TED, CSV exports and Anchete. Distinguish existing, partially supported, missing, and present but unreliable. Preserve the current separation between direct purchases, contracts awarded through procedures and TED publication. Keep the unimplemented AI mode disabled.

Prioritize a concrete backlog. For every need, provide:

- The reporter's question, illustrated with a plausible scenario.
- What currently works and the specific missing capability.
- A proposed interaction in plain Romanian, with a path to the exact contributing contracts.
- A feasible implementation using the current architecture, with missing data and access dependencies named.
- The unit being counted and the meaning of the amount: notice, lot, contract, supplier allocation, framework ceiling, invoice or confirmed payment.
- A legitimate alternative explanation, a way to test it, and coverage limits that could change the conclusion.
- Priority, relative effort, prerequisites and a measurable acceptance test.

Be ambitious about investigative workflows, conservative about factual claims. Separate verified observations, hypotheses, product proposals and future research. Do not infer common ownership from a shared name or address; do not infer multiple bidders from an unknown count, payments from awards, or wrongdoing from statistical anomalies. Verify time-sensitive Romanian law and external data access through current primary sources.

Include several original concepts that improve reporting: searching for counterevidence, linking public records across time, locating repeated specifications, reconstructing a project's delivery, or finding what evidence is missing. AI may later assist retrieval or document extraction with citations and human review; it must never invent connections or produce a guilt score.

Deliver an evidence-based report, a prioritized implementation roadmap, one illustrated end-to-end future workflow, and the first coherent release you would build. Include a portable evidence-bundle design that lets an editor reproduce exact totals offline and retrieve the original SEAP/TED records. Optimize for a defensible investigation and an approachable citizen experience.
