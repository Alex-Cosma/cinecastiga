export type StoryArt = 'road' | 'hospital' | 'network';
export type RecordRef = { type: 'direct'; id: string } | { type: 'contract'; id: string; awardNoticeId: string };
export type StorySource = {
  id: string;
  title: string;
  observedAt: string;
} & (
  | { kind: 'procurement'; record: RecordRef | null; date: string; amount: string; currency: 'RON'; authority: string; suppliers: string[]; code?: string; cpv?: string; publishedAt?: string; finalizedAt?: string; note?: string }
  | { kind: 'external'; url: string | null; publisher: string; summary: string }
  | { kind: 'note'; text: string }
);
/** Large figures beside the headline. Values are display text; amounts must also exist as sources. */
export type StoryFact = { value: string; label: string };
/** A story-specific figure. Every mark links to a source of the same story. */
export type StoryVisual =
  | { kind: 'map'; title: string; caption: string; groups: { id: string; label: string }[]; regions: { county: string; label: string; group: string; sourceId: string }[]; unlocated?: { label: string; group: string; sourceId: string }[] }
  | { kind: 'compare'; title: string; caption: string; columns: [string, string]; sourceIds: [string, string]; rows: { label: string; values: [string, string] }[] }
  | { kind: 'bars'; title: string; caption: string; bars: { label: string; value: number; display: string; note?: string; highlight?: boolean; sourceIds: string[] }[] };
/** Supplier profile: what the public registers show next to what it won. `revenue` (decimal) lets the page set the amount won against the firm's size. */
export type StoryActor = { name: string; entityId?: string; won: string; wonLabel: string; facts: { label: string; value: string }[]; sourceIds: string[]; revenue?: { amount: string; label: string } };
/** A preprinted request for information and where it stands. */
export type StoryRequest = { to: string; status: 'pregatita' | 'trimisa' | 'raspuns' | 'fara-raspuns'; date?: string };
export type Story = {
  slug: string;
  status: 'draft' | 'published' | 'preview';
  title: string;
  /** Article standfirst; at most two sentences. */
  summary: string;
  /** Short card text for indexes; the summary is used without it. */
  teaser?: string;
  counties: string[];
  topic: string;
  /** Key of STORY_SCENES: the story's own drawn illustration. */
  scene?: string;
  /** Generic drawing used until the story has its own scene. */
  illustration?: StoryArt;
  /** Keys of STORY_PATTERNS; they relate stories that share a mechanism. */
  patterns?: string[];
  /** „Pe scurt”: what the documents establish and what they do not. */
  brief?: { known: string[]; unknown: string[] };
  requests?: StoryRequest[];
  author: string;
  publishedAt: string;
  updatedAt?: string;
  minutes: number;
  period: string;
  keyFacts?: StoryFact[];
  visual?: StoryVisual;
  /** Paragraphs may cite inline with [[source-id]]; markers render as numbered notes. */
  intro: string[];
  /** `lead` sections open the article before the procurement finding; `actors` places the supplier profiles inside that section. */
  sections?: { id: string; title: string; paragraphs: string[]; sourceIds: string[]; quote?: { text: string; attribution: string; sourceId: string }; lead?: boolean; actors?: boolean }[];
  finding: { title: string; sourceIds: string[]; explanation: string; after: string; groupBySupplier?: boolean };
  actors?: { title: string; intro?: string; items: StoryActor[] };
  timeline: { id: string; date: string | null; title: string; text: string; sourceIds: string[]; gapBefore?: string; highlight?: boolean }[];
  questions: string[];
  reply: { title: string; text: string; sourceIds: string[] } | null;
  methodology: string;
  corrections: { date: string; text: string }[];
  sources: StorySource[];
};
export type StoryView = { kind: 'atlas' } | { kind: 'county'; county: string } | { kind: 'story'; slug: string } | { kind: 'source'; slug: string; sourceId: string };
