import { describe, expect, it } from 'vitest';
import { markRanges, pageRuns, passage, textSource } from './passage';

// Owner, 17 November 2026 („varianta A”), on /cauta?q=Cluj: the two first results of the public site, as they were.
const SCAN = '…; Ne, Pă; Nr. 260\n\n9 9\nAGRE\n\nwae\n\nAPROBAT,\n/cfeuevasea Petru loan VERES\n\nts,\nEe\n\n[rima Speursala SH Cluj\n\nNae Cie 4\nN IE\n\nSie\n\nPENTRU ACHIZITIE DE SERVICII\n\nPRODUS:\n\n™ COD CPV:\n\nData elaborarii: iulie 2025\n\n71356100-9 (Servicii de control tehnic)\n\nPag.1\n\nServicii de verificari si reglare supape de siguranta SH Cluj ~ UHE Oradea\n\nSucursala Hidracentrale Cluj - Uzina Hidroelectrica';
const WORD = 'Text rearanjat pentru lectură · verifică formatarea în original\n\n\n\n[word/document.xml]\nStr. I.C. Bratianu nr.14\nCluj-Napoca, RO-400079\nTel.: 0264-40.53.00 int. 5266\nFax: 0264-59.05.92\nwww.ubbcluj.ro\nNr.    4999 / 10.09.2026\n\nNr. anunt de participare (SEAP): SCN1179452 / 03.09.2026\nEchipamente de iluminat si multifunctionale-2 Loturi\n\nRĂSPUNS   CONSOLIDAT LA SOLICITARILE DE CLARIFICĂRI\n\nRăspuns la solicitarea de clarificări numărul unu';
const marked = (text: string, q: string) => markRanges(text, q).map(([a, b]) => text.slice(a, b));

describe('the words marked in a result', () => {
  it('marks a searched word where a word starts, not inside another', () => {
    expect(marked('Cluj-Napoca, www.ubbcluj.ro, Sucursala Cluj', 'Cluj')).toEqual(['Cluj', 'Cluj']);
    expect(marked('judetul Cluj; Clujului nu', 'cluj')).toEqual(['Cluj']);
  });
  it('marks a longer word to its end, in its other forms, and ignores accents', () => {
    expect(marked('Iluminatul public și reiluminat; ILUMINARE', 'iluminat')).toEqual(['Iluminatul']);
    expect(marked('Școală nouă, școala, preșcoală', 'scoala')).toEqual(['Școală', 'școala']);
  });
  it('joins what overlaps and marks nothing for nothing', () => {
    expect(marked('drumuri drum', 'drumuri sau drum')).toEqual(['drumuri', 'drum']);
    expect(markRanges('orice', '')).toEqual([]);
  });
});

describe('the passage of a document result', () => {
  it('is one flowing paragraph around the word, cut at whole words', () => {
    const p = passage(SCAN, 'Cluj');
    expect(p).not.toMatch(/\n| {2}/);
    expect(p.length).toBeLessThanOrEqual(240 + 4);
    expect(p.startsWith('… ')).toBe(true);
    expect(p.endsWith(' …')).toBe(true);
    expect(p).toContain('Speursala SH Cluj Nae Cie');
    // whole words at both ends: what follows „… ” and precedes „ …” stands between spaces in the page's text
    const flat = SCAN.replace(/\s+/g, ' ');
    expect(flat).toContain(' ' + p.slice(2, -2) + ' ');
  });
  it('leaves out the lines our own conversion wrote', () => {
    const p = passage(WORD, 'Cluj');
    expect(p.startsWith('Str. I.C. Bratianu nr.14 Cluj-Napoca, RO-400079')).toBe(true);
    expect(p).not.toMatch(/rearanjat|document\.xml/);
  });
  it('gives a short page whole, and a page without the word from its start', () => {
    expect(passage('Judetul  Cluj\nComuna Baciu', 'Cluj')).toBe('Judetul Cluj Comuna Baciu');
    expect(passage(SCAN, 'altceva').startsWith('…; Ne, Pă; Nr. 260 9 9 AGRE')).toBe(true);
  });
});

describe('the pages of a document result', () => {
  it('joins consecutive pages into one run', () => {
    expect(pageRuns([85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98])).toEqual([[85, 98]]);
    expect(pageRuns([1])).toEqual([[1, 1]]);
    expect(pageRuns([39, 41, 43, 44, 45, 53])).toEqual([[39, 39], [41, 41], [43, 45], [53, 53]]);
  });
});

describe('what a result was read from', () => {
  it('names a Word or Excel file as such, whatever was signed or packed around it', () => {
    expect(textSource('raspuns consolidat OCSANA.docx.p7s', 'text')).toBe('Text extras din Word');
    expect(textSource('Caiet de sarcini revizuit word.doc.p7s', 'text')).toBe('Text extras din Word');
    expect(textSource('Lista.xlsx', 'text')).toBe('Text extras din Excel');
    expect(textSource('Caiet sarcini Servicii IP - Revizuit.pdf', 'text')).toBe('Text extras din PDF');
    expect(textSource('Caiete de sarcini Supape 2025.pdf.zip.p7s', 'ocr')).toBe('Text OCR');
  });
});
