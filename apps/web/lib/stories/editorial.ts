import { citedIds, countyLabel, dateLabel, sumExact } from './shared';
import type { Story, StorySource } from './types';

/** Shared mechanisms. A pattern relates stories; it describes what the documents show, not a verdict. */
export const STORY_PATTERNS: Record<string, { label: string; hint: string }> = {
  'fara-anunt': { label: 'Fără anunț public', hint: 'Atribuire fără anunț de participare publicat în prealabil.' },
  'oferta-unica': { label: 'O singură ofertă', hint: 'Documentele de atribuire indică un singur ofertant.' },
  'disproportie': { label: 'Contract peste mărimea firmei', hint: 'Valoarea câștigată depășește de multe ori veniturile raportate de firmă.' },
  'directe-in-serie': { label: 'Achiziții directe în serie', hint: 'Mai multe achiziții directe apropiate în timp, de la același furnizor.' },
  'procedura-repetata': { label: 'Aceeași achiziție, de două ori', hint: 'Același obiect, cumpărat prin două proceduri apropiate.' },
  'termen-depasit': { label: 'Termen public depășit', hint: 'Un termen anunțat public nu a fost respectat.' },
  'control': { label: 'Constatări ale unui control', hint: 'Un organ de control sau de audit a documentat probleme.' },
};
export const patternLabel = (key: string) => STORY_PATTERNS[key]?.label ?? key;

/** Romanian count agreement: „1 zi”, „2 zile”, „20 de zile”. */
export function plural(n: number, one: string, many: string) {
  if (n === 1) return `1 ${one}`;
  const rest = Math.abs(n) % 100;
  return rest === 0 || rest >= 20 ? `${n} de ${many}` : `${n} ${many}`;
}
/** Counties as one phrase once a story spans more than two of them. */
export function scopeLabel(story: Story) {
  if (story.counties.length <= 2) return story.counties.map(countyLabel).join(', ');
  const others = story.counties.filter(c => c !== 'bucuresti').length;
  return story.counties.includes('bucuresti') ? `București și ${plural(others, 'județ', 'județe')}` : plural(others, 'județ', 'județe');
}
export const isNational = (story: Story) => story.counties.length > 2;

const procurements = (story: Story) => story.finding.sourceIds.flatMap(id => {
  const s = story.sources.find(s => s.id === id);
  return s?.kind === 'procurement' ? [s] : [];
});

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Year boundaries inside a dated span, as fractions of it. */
function yearMarks(first: string, last: string) {
  const span = Math.max(1, days(first, last)), years: { at: number; label: string }[] = [];
  for (let y = Number(first.slice(0, 4)) + 1; `${y}-01-01` < last; y++) years.push({ at: days(first, `${y}-01-01`) / span, label: String(y) });
  return years;
}

/** Stories sharing a mechanism come first, then a county, then a topic. */
export function relatedStories(story: Story, stories: Story[], limit = 3) {
  return stories.filter(s => s.slug !== story.slug).map(s => {
    const patterns = (s.patterns ?? []).filter(p => story.patterns?.includes(p)), county = s.counties.find(c => story.counties.includes(c));
    const score = patterns.length * 3 + (county ? 1 : 0) + (s.topic === story.topic ? 1 : 0);
    const reason = patterns.length ? `Același tipar: ${patternLabel(patterns[0]!)}` : county ? `Tot în ${countyLabel(county)}` : s.topic === story.topic ? `Tot despre ${s.topic.toLowerCase()}` : '';
    return { story: s, score, reason };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score || b.story.publishedAt.localeCompare(a.story.publishedAt)).slice(0, limit);
}

/** Time between highlighted dated events, for the compact timeline. */
export function gapLabel(from: string, to: string) {
  const d = days(from, to);
  if (d < 60) return plural(d, 'zi', 'zile');
  const months = Math.round(d / 30.44);
  if (months < 12) return plural(months, 'lună', 'luni');
  const years = Math.floor(months / 12), rest = months % 12;
  return rest ? `${plural(years, 'an', 'ani')} și ${plural(rest, 'lună', 'luni')}` : plural(years, 'an', 'ani');
}
export function timelineStrip(story: Story) {
  const dated = story.timeline.filter(e => e.date);
  if (dated.length < 3) return null;
  const first = dated[0]!.date!, span = Math.max(1, days(first, dated.at(-1)!.date!));
  const keys = dated.filter(e => e.highlight);
  const key = keys.length ? keys : [dated[0]!, dated.at(-1)!];
  return {
    from: first, to: dated.at(-1)!.date!,
    points: dated.map(e => ({ id: e.id, date: e.date!, title: e.title, at: days(first, e.date!) / span, key: key.includes(e) })),
    years: yearMarks(first, dated.at(-1)!.date!),
    key: key.map((e, i) => ({ id: e.id, date: e.date!, title: e.title, gap: i ? gapLabel(key[i - 1]!.date!, e.date!) : null })),
  };
}

const CEILING = /acord(?:ul|uri|urile|urilor|ului)?-cadru/i;
/** A framework agreement records a ceiling for future orders, not an order. */
export const isCeiling = (s: StorySource) => s.kind === 'procurement' && CEILING.test(`${s.title} ${s.note ?? ''}`);
/** „Ce arată cifrele”, matched to what was bought. */
export function valueNote(story: Story) {
  const records = procurements(story), cpv = records.map(s => s.cpv?.slice(0, 2)).filter(Boolean) as string[];
  const ceilings = records.filter(isCeiling).length, ceiling = records.length > 0 && ceilings === records.length;
  const what = cpv.length && cpv.every(c => c === '45') ? 'execuția lucrărilor' : cpv.length && cpv.every(c => Number(c) >= 50) ? 'prestarea serviciilor' : cpv.length && cpv.every(c => Number(c) < 45) ? 'livrarea produselor' : 'execuția contractelor';
  const lead = ceiling ? 'Plafoane de acord-cadru, nu comenzi sau plăți.' : ceilings ? 'Valori înregistrate; acordurile-cadru arată plafoane, nu comenzi.' : 'Valori înregistrate, nu plăți.';
  return { ceiling, anyCeiling: ceilings > 0, text: `${lead} Din ele nu putem deduce plățile sau ${what}.` };
}

/** Questions keep their addressee („AASNACP: …”); unprefixed ones continue the previous group. */
export function questionGroups(story: Story) {
  const groups: { to: string | null; items: string[]; request?: NonNullable<Story['requests']>[number] }[] = [];
  for (const q of story.questions) {
    const m = /^([^:?]{2,60}):\s+(.+)$/s.exec(q), to = m ? m[1]!.trim() : groups.at(-1)?.to ?? null, text = m ? m[2]!.charAt(0).toLocaleUpperCase('ro-RO') + m[2]!.slice(1) : q;
    if (groups.at(-1)?.to === to) groups.at(-1)!.items.push(text); else groups.push({ to, items: [text] });
  }
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  for (const g of groups) { const request = story.requests?.find(r => g.to && fold(g.to).startsWith(fold(r.to).slice(0, 6))); if (request) g.request = request; }
  return groups;
}
export function requestLabel(r: NonNullable<Story['requests']>[number]) {
  const on = r.date ? ` la ${dateLabel(r.date)}` : '';
  return r.status === 'pregatita' ? 'Cerere pregătită, netrimisă' : r.status === 'trimisa' ? `Cerere trimisă${on}` : r.status === 'raspuns' ? `Răspuns primit${on}` : `Fără răspuns${r.date ? ` până${on}` : ''}`;
}

export type SourceItem = { source: StorySource; n: number };
export type SourceGroup = { id: string; title: string; items: SourceItem[]; clusters: { key: string; title: string; total: string; items: SourceItem[] }[] };
/** The dossier, grouped: procurement records (same-day series collapsed), outside documents, own notes. */
export function sourceGroups(story: Story): SourceGroup[] {
  const numbered = story.sources.map((source, i) => ({ source, n: i + 1 }));
  const records = numbered.filter(x => x.source.kind === 'procurement');
  const byDay = new Map<string, SourceItem[]>();
  for (const x of records) if (x.source.kind === 'procurement') { const k = `${x.source.date}|${x.source.authority}`; byDay.set(k, [...(byDay.get(k) ?? []), x]); }
  const clusters = [...byDay.entries()].filter(([, items]) => items.length >= 3).map(([key, items]) => {
    const first = items[0]!.source as Extract<StorySource, { kind: 'procurement' }>;
    const total = sumExact(items.flatMap(x => x.source.kind === 'procurement' ? [x.source.amount] : []));
    return { key, title: `${plural(items.length, 'înregistrare', 'înregistrări')} din ${dateLabel(first.date)}`, total, items };
  });
  const clustered = new Set(clusters.flatMap(c => c.items.map(x => x.source.id)));
  const groups: SourceGroup[] = [
    { id: 'achizitii', title: 'Înregistrări de achiziție', items: records.filter(x => !clustered.has(x.source.id)), clusters },
    { id: 'externe', title: 'Documente oficiale și presă', items: numbered.filter(x => x.source.kind === 'external'), clusters: [] },
    { id: 'note', title: 'Observațiile noastre', items: numbered.filter(x => x.source.kind === 'note'), clusters: [] },
  ];
  return groups.filter(g => g.items.length || g.clusters.length);
}

/** Source ids each chapter relies on, for the reading rail. */
export function chapterSources(story: Story) {
  const out: Record<string, string[]> = {};
  const add = (id: string, ids: string[]) => { out[id] = [...new Set([...(out[id] ?? []), ...ids])]; };
  const v = story.visual;
  const visual = !v ? [] : v.kind === 'map' ? [...v.regions, ...(v.unlocated ?? [])].map(r => r.sourceId) : v.kind === 'compare' ? v.sourceIds : v.bars.flatMap(b => b.sourceIds);
  add('firul', [...story.intro.flatMap(citedIds), ...story.finding.sourceIds, ...citedIds(story.finding.after), ...visual]);
  const actorIds = story.actors?.items.flatMap(a => a.sourceIds) ?? [];
  const actorsHome = story.sections?.find(s => s.actors)?.id ?? 'firul';
  add(actorsHome, actorIds);
  for (const s of story.sections ?? []) add(s.id, [...s.paragraphs.flatMap(citedIds), ...s.sourceIds, ...(s.quote ? [s.quote.sourceId] : [])]);
  add('cronologie', story.timeline.flatMap(e => e.sourceIds));
  add('intrebari', story.reply?.sourceIds ?? []);
  return out;
}

/** Plain-text citation of the story, for „Cum citez”. */
export const citation = (story: Story, url: string) => `cinecâștigă?, „${story.title}”, ${dateLabel(story.updatedAt ?? story.publishedAt)}, ${url}`;
