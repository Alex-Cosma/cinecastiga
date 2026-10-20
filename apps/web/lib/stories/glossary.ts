/** Procurement vocabulary explained at its first use in a story. Definitions are general, not story findings. */
export type GlossaryTerm = { id: string; term: string; match: RegExp; text: string };
const L = '(?<![\\p{L}\\d])', R = '(?![\\p{L}\\d])';
const word = (source: string, flags = 'iu') => new RegExp(`${L}(?:${source})${R}`, flags);
export const GLOSSARY: GlossaryTerm[] = [
  { id: 'negociere-fara-publicare', term: 'Negociere fără publicare prealabilă', match: word('negocier(?:e|ea|ii)\\s+fără\\s+publicare(?:\\s+prealabilă)?'), text: 'Procedură în care instituția invită direct unul sau mai mulți operatori, fără anunț public de participare. Legea o permite doar în situații limitate, care trebuie justificate în scris.' },
  { id: 'acord-cadru', term: 'Acord-cadru', match: word('acord(?:ul|uri|urile|urilor|ului)?-cadru'), text: 'Înțelegere care fixează condițiile și o valoare maximă pentru comenzi viitoare. Banii se cheltuie prin contracte subsecvente; acordul în sine nu este o plată.' },
  { id: 'contract-subsecvent', term: 'Contract subsecvent', match: word('contract(?:e|ele|ul|elor)?\\s+subsecvent(?:e|ul|ele)?'), text: 'Comanda concretă făcută în baza unui acord-cadru, pentru o parte din valoarea lui maximă.' },
  { id: 'plafon', term: 'Plafon', match: word('plafo(?:n|nul|nului|ane|anele|anelor)'), text: 'Valoarea maximă până la care se pot face comenzi într-un acord-cadru. Nu arată cât s-a comandat sau plătit efectiv.' },
  { id: 'achizitie-directa', term: 'Achiziție directă', match: word('achiziți(?:e|a|i|ile|ilor)\\s+direct(?:ă|e|ele)'), text: 'Cumpărare de valoare mică, sub un prag stabilit prin lege, pentru care instituția poate alege furnizorul fără licitație.' },
  { id: 'anunt-atribuire', term: 'Anunț de atribuire', match: word('anunț(?:ul|uri|urile|urilor)?\\s+de\\s+atribuire'), text: 'Anunțul prin care instituția face public cine a câștigat o procedură și la ce valoare.' },
  { id: 'valoare-estimata', term: 'Valoare estimată', match: word('valoar(?:ea|e)\\s+estimată'), text: 'Suma pe care instituția o anticipează înainte de procedură. De ea depinde ce fel de procedură trebuie folosită.' },
  { id: 'cifra-de-afaceri', term: 'Cifră de afaceri', match: word('cifr(?:ă|a)\\s+de\\s+afaceri'), text: 'Veniturile din vânzări raportate de firmă în situațiile financiare anuale depuse la Ministerul Finanțelor.' },
  { id: 'cpv', term: 'CPV', match: word('CPV', 'u'), text: 'Codul european care clasifică ce se cumpără, de exemplu servicii de pază. Același serviciu poate apărea sub coduri diferite.' },
  { id: 'seap', term: 'SEAP', match: word('SEAP', 'u'), text: 'Sistemul electronic de achiziții publice (e-licitatie.ro), unde instituțiile publică procedurile și atribuirile.' },
  { id: 'onrc', term: 'ONRC', match: word('ONRC', 'u'), text: 'Oficiul Național al Registrului Comerțului. Registrul arată sediul, activitatea și reprezentanții legali ai firmelor, nu neapărat proprietarii.' },
  { id: 'cui', term: 'CUI', match: word('CUI', 'u'), text: 'Codul unic de identificare fiscală al unei firme sau instituții.' },
  { id: 'legea-544', term: 'Legea 544/2001', match: word('Legii\\s+544/2001|Legea\\s+544/2001'), text: 'Legea liberului acces la informațiile de interes public. Instituția răspunde în 10 zile, termen prelungibil la 30 de zile pentru cereri complexe.' },
];
export const glossaryTerm = (id: string) => GLOSSARY.find(t => t.id === id);

/** Marks each term once per story: at its first appearance, in reading order. Returns block index → term ids. */
export function glossaryPlan(blocks: string[]): Map<number, string[]> {
  const plan = new Map<number, string[]>();
  for (const t of GLOSSARY) {
    const i = blocks.findIndex(b => t.match.test(b.replace(/\[\[[^\]]+\]\]/g, '')));
    if (i >= 0) plan.set(i, [...(plan.get(i) ?? []), t.id]);
  }
  return plan;
}
export type TermPart = { text: string } | { term: string; text: string };
/** Splits plain text at the first occurrence of each given term; overlapping matches keep the earlier one. */
export function markTerms(text: string, ids: string[]): TermPart[] {
  const hits = ids.flatMap(id => { const t = glossaryTerm(id); const m = t ? new RegExp(t.match.source, t.match.flags).exec(text) : null; return m ? [{ id, start: m.index, end: m.index + m[0].length }] : []; })
    .sort((a, b) => a.start - b.start).filter((h, i, all) => !all.slice(0, i).some(p => h.start < p.end));
  const parts: TermPart[] = []; let last = 0;
  for (const h of hits) { if (h.start > last) parts.push({ text: text.slice(last, h.start) }); parts.push({ term: h.id, text: text.slice(h.start, h.end) }); last = h.end; }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
