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
export type Story = {
  slug: string;
  status: 'draft' | 'published' | 'preview';
  title: string;
  summary: string;
  counties: string[];
  topic: string;
  illustration: StoryArt;
  author: string;
  publishedAt: string;
  updatedAt?: string;
  minutes: number;
  period: string;
  intro: string[];
  sections?: { id: string; title: string; paragraphs: string[]; sourceIds: string[] }[];
  finding: { title: string; sourceIds: string[]; explanation: string; after: string };
  timeline: { id: string; date: string | null; title: string; text: string; sourceIds: string[] }[];
  questions: string[];
  reply: { title: string; text: string; sourceIds: string[] } | null;
  methodology: string;
  corrections: { date: string; text: string }[];
  sources: StorySource[];
};
export type StoryView = { kind: 'atlas' } | { kind: 'county'; county: string } | { kind: 'story'; slug: string } | { kind: 'source'; slug: string; sourceId: string };
