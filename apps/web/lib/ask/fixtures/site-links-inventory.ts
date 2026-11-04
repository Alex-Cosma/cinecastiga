/**
 * Every file outside the corpus that links to "Întreabă", hands its routes a
 * spec, or relays one (plan §2.6, F0). lib/ask/site-links.test.ts scans app/,
 * components/ and lib/ with SITE_LINK_PATTERN and fails when a file is missing
 * here or its count of matches changed, and when a producer has no entry in
 * the legacy corpus (fixtures/legacy-corpus.ts, run by the golden test).
 *
 * Kinds:
 * - producer: builds a new question (its corpus ids run what it builds);
 * - derived: inside "Întreabă", narrows or deepens the applied question (one level down, a row's records);
 * - relay: re-encodes a question it received (a saved question, a watch, a clip, the answer's permalink);
 * - question-text: opens `/intreaba?q=` for the interpreter (lib/intent), not a spec;
 * - plain: opens the builder without a question;
 * - definition: defines a link helper used by the others.
 */
export type SiteLinkKind = "producer" | "derived" | "relay" | "question-text" | "plain" | "definition";
export interface SiteLinkFile {
  /** Relative to apps/web. */
  file: string;
  /** Matches of SITE_LINK_PATTERN in the file. */
  occurrences: number;
  kind: SiteLinkKind;
  what: string;
  /** Corpus ids that run what the file builds (producers and derived links). */
  corpus?: string[];
}

/** A link or spec helper call, a raw "Întreabă" URL, a sources drawer, or an import of the shared builders. */
export const SITE_LINK_PATTERN = /encodeSpec\(|askHref\(|questionHref\(|countyBreakdownHref\(|\/intreaba\?|\/\?spec=|<EvidenceDrawer\b|from ["'][^"']*\/(?:ask\/site-links|discovery-links)["']/g;

export const SITE_LINK_INVENTORY: SiteLinkFile[] = [
  { file: "app/page.tsx", occurrences: 7, kind: "producer", what: "Home: six starting questions, three national figures; `/?spec=` and `?q=` are forwarded to /intreaba",
    corpus: ["site:home-roads", "site:home-hospitals", "site:home-contract-winners", "site:home-communes", "site:home-authority-cloud", "site:home-single-bidder", "site:home-da-count", "site:home-contract-count", "site:home-value"] },
  { file: "app/DiscoveryMap.tsx", occurrences: 3, kind: "producer", what: "Home map: the national map and a county's domains",
    corpus: ["site:home-map", "site:county-breakdown"] },
  { file: "app/ghid/page.tsx", occurrences: 4, kind: "producer", what: "Guide: a county's domains and the roads ranking",
    corpus: ["site:county-breakdown", "site:home-roads"] },
  { file: "app/entitati/[id]/page.tsx", occurrences: 5, kind: "producer", what: "Entity page: its records per channel (sources open), the firms of a representative",
    corpus: ["site:entity-channel-authority-da", "site:entity-channel-authority-contracts", "site:entity-channel-authority-all", "site:entity-channel-supplier-da", "site:person-firms"] },
  { file: "app/entitati/[id]/YearMiniChart.tsx", occurrences: 3, kind: "producer", what: "Entity page: one month of direct acquisitions (sources open)",
    corpus: ["site:entity-month-authority", "site:entity-month-supplier"] },
  { file: "app/entitati/[id]/PartnersTable.tsx", occurrences: 3, kind: "producer", what: "Entity page partners: one buyer–firm pair (sources open)", corpus: ["site:pair"] },
  { file: "app/contracte/[nid]/page.tsx", occurrences: 3, kind: "producer", what: "Contract page: the pair's records (sources open)", corpus: ["site:pair"] },
  { file: "app/entitati/[id]/radiografie/DependencyScatter.tsx", occurrences: 2, kind: "producer", what: "Radiografie: the pair's procedure contracts, in the sources drawer", corpus: ["site:pair-contracts"] },
  { file: "app/entitati/[id]/legaturi/ConnectionsExplorer.tsx", occurrences: 1, kind: "producer", what: "Connections: the selected pairs' records in the drawer (connection-evidence-shared.ts, bound to a snapshot)",
    corpus: ["site:connection-evidence"] },
  { file: "app/entitati/[id]/comparatii/PeersExplorer.tsx", occurrences: 1, kind: "producer", what: "Comparisons: the group's records in the drawer (peers-evidence-shared.ts, bound to a snapshot)",
    corpus: ["site:peer-evidence"] },
  { file: "app/domenii/DomainExplorer.tsx", occurrences: 4, kind: "producer", what: "Domains: a division's ranking or evolution in one year, and its records in the drawer",
    corpus: ["site:domain-ranking", "site:domain-evolution", "site:domain-sources-all", "site:domain-sources-division", "site:domain-sources-other"] },
  { file: "lib/domains-shared.ts", occurrences: 1, kind: "producer", what: "domainSourceUrl: a domain's records as a link (raw btoa, the same bytes as encodeSpec)",
    corpus: ["site:domain-sources-all", "site:domain-sources-division", "site:domain-sources-other"] },
  { file: "app/anchete/DossierEvidence.tsx", occurrences: 5, kind: "producer", what: "Dossier: a saved person opens the firms they represent; a saved question reopens with its scope (relay)",
    corpus: ["site:person-clip", "saved:watch-selection"] },
  { file: "lib/evidence-captures.ts", occurrences: 1, kind: "producer", what: "Evidence captures of an entity (buyer or firm) and of a person", corpus: ["site:capture-entity", "site:capture-person"] },
  { file: "lib/topic-search/interpretation.ts", occurrences: 7, kind: "producer", what: "Search page \"Pe scurt\": a total, the first three winners and the buyer's domains; otherwise `?q=`",
    corpus: ["site:topic-total", "site:topic-top", "site:topic-domains"] },
  { file: "lib/ask/source-spec.ts", occurrences: 6, kind: "derived", what: "A ranking row's or a year's records; a lone county council's place among the others and its total (\"Cine conduce?\")",
    corpus: ["site:source-entity-row", "site:source-entity-spec", "site:source-year", "site:leader-alone-peers", "site:leader-alone-total"] },
  // F4: a network node's and a flow's records open the drawer in place (NetworkAnswer, SankeyAnswer); the corpus keeps
  // the links those built before (site:node-records, site:ribbon-records), which still answer.
  { file: "app/intreaba/blocks.tsx", occurrences: 2, kind: "derived", what: "A slice's records",
    corpus: ["site:slice-records", "site:node-records", "site:ribbon-records"] },
  { file: "app/intreaba/answer-state.ts", occurrences: 2, kind: "derived", what: "A breakdown slice one CPV level down, and the thread's crumbs back up (fir)",
    corpus: ["site:slice-deeper"] },
  { file: "app/intreaba/MapBlock.tsx", occurrences: 2, kind: "derived", what: "A county's records", corpus: ["site:map-county-records"] },
  { file: "app/intreaba/AskPanel.tsx", occurrences: 13, kind: "relay", what: "The applied answer's permalink (also after a strip change, a trend's or a network's group button, the flow's length), the keys of the answers kept for «Înapoi» (answer-memory.ts), builder key, export key and drawer; the flow's domain thread (threadHref, F4); the answer a typed question's interpretation line belongs to" },
  { file: "app/intreaba/EvidenceDrawer.tsx", occurrences: 2, kind: "relay", what: "The drawer's own source link (sourceUrl) for captures" },
  { file: "app/intreaba/SaveQuestionButton.tsx", occurrences: 2, kind: "relay", what: "A saved question's link" },
  { file: "app/intreaba/SavedQuestions.tsx", occurrences: 2, kind: "relay", what: "Reopening a saved question in the builder" },
  { file: "lib/monitoring-shared.ts", occurrences: 2, kind: "relay", what: "A watch opens its question, scope and source filters (selectionHref, used by app/urmariri/shared.tsx)" },
  { file: "components/FollowButton.tsx", occurrences: 1, kind: "relay", what: "Hands a question to /urmariri/noua" },
  { file: "app/urmariri/noua/page.tsx", occurrences: 2, kind: "plain", what: "Without a question, or with one from a newer release: a link to the builder" },
  { file: "app/urmariri/MonitoringInbox.tsx", occurrences: 2, kind: "plain", what: "\"Urmărește o întrebare\" opens the builder" },
  { file: "lib/search-suggestions.ts", occurrences: 5, kind: "question-text", what: "Search suggestions open `/intreaba?q=` (the interpreter)" },
  { file: "lib/ask/permalink.ts", occurrences: 1, kind: "definition", what: "encodeSpec" },
  { file: "lib/discovery-links.ts", occurrences: 3, kind: "definition", what: "askHref, countyBreakdownSpec, countyBreakdownHref" },
];

/** Shared builders whose specs other pages hand to the routes without a link (sources drawers, captures, partner rows). */
export const SPEC_BUILDERS: { module: string; builders: string[]; corpus: string[] }[] = [
  { module: "lib/ask/site-links.ts", builders: ["(every export)"], corpus: [] },
  { module: "lib/connections-shared.ts", builders: ["connectionPairSpec"], corpus: ["site:connection-pair"] },
  { module: "lib/connection-evidence-shared.ts", builders: ["connectionEvidenceSpec"], corpus: ["site:connection-evidence"] },
  { module: "lib/peers-shared.ts", builders: ["peerSourceSpec", "peerMemberSpec"], corpus: ["site:peer-source"] },
  { module: "lib/peers-evidence-shared.ts", builders: ["peerEvidenceSpec"], corpus: ["site:peer-evidence"] },
  { module: "lib/domains-shared.ts", builders: ["domainSourceQuery"], corpus: ["site:domain-sources-all", "site:domain-sources-division", "site:domain-sources-other"] },
  { module: "lib/discovery-links.ts", builders: ["countyBreakdownSpec"], corpus: ["site:county-breakdown"] },
];
