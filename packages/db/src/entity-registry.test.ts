import { describe, expect, it } from 'vitest';
import { otherRegistryNames, registryNameWords, sameRegistryName } from './entity-registry.js';

describe('ONRC names of an entity\'s CUI that are not its own (1 November 2026)', () => {
  it('reads a name without legal forms, accents, numbers or dotted letters', () => {
    expect(registryNameWords('SC R.B.R. CONSULTING S.R.L.')).toEqual(['rbr', 'consulting']);
    expect(registryNameWords('LYB ARHI-PROIECT SOCIETATE CU RASPUNDERE LIMITATĂ')).toEqual(['lyb', 'arhi', 'proiect']);
    expect(registryNameWords('CĂRĂMIDA 95 S.A.')).toEqual(['caramida']);
  });
  it('takes SICAP\'s and ONRC\'s spellings of one name as one name', () => {
    for (const [sicap, onrc] of [
      ['RBR CONSULTING', 'R.B.R. CONSULTING SRL'],
      ['SC SIMTUR SRL', 'SIM TUR SRL'],
      ['ING.FLORIN BOCA', 'ING. BOCA FLORIN PERSOANĂ FIZICĂ AUTORIZATĂ'],
      ['S.C. SOCIAL GREEN SERVICES S.R.L. BOTOSANI', 'SOCIAL GREEN SERVICES SRL'],
      ['MARCALAU PREST SRL', 'MARCLAU PREST SRL'],
      ['ILIE ISPAS SOCIETATE IN NUME COLECTIV', 'ILIE ISPAS SNC'],
      ['PF ARSINEL ALEXANDRU CORNELIU', 'ARŞINEL L. ALEXANDRU-CORNELIU - PERSOANĂ FIZICĂ AUTORIZATĂ'],
      ['MIG INTERANTIONAL SRL', 'SC MIG INTERNATIONAL SRL'],
      ['IOVESCU DANIEL IOAN PERSONA FIZICA AUTORIZATA', 'IOVESCU DANIEL IOAN "IOVESCU DANIEL IOAN" PERSOANĂ FIZICĂ AUTORIZATĂ'],
      ['SCM TEHNOPREST', 'SOCIETATE COOPERATIVĂ MEŞTEŞUGĂREASCĂ TEHNOPREST'],
      ['S.C. ALEX ORA EUROCONSTRUCT SRL-D', 'ALEX ORA EUROCONSTRUCT S.R.L.'],
    ]) expect(sameRegistryName(sicap, onrc), `${sicap} / ${onrc}`).toBe(true);
    expect(sameRegistryName('PSIHO POLIGRAF', 'STRATEGIC CONNECT S.R.L.')).toBe(false);
    expect(sameRegistryName('GENERALI ROMANIA ASIGURARE REASIGURARE', 'ASIGURARE REASIGURARE ARDAF SA')).toBe(false);
    expect(sameRegistryName('CMC GRUP BROKER DE ASIGURARE SRL', 'CMC GRUP INVESTMENT ADVISOR S.R.L.')).toBe(false);
    expect(sameRegistryName('ALFA', 'ALFA CONSTRUCT SRL')).toBe(false);
  });
  it('keeps a renamed firm\'s other name once, in ONRC\'s spelling', () => {
    expect(otherRegistryNames('PSIHO POLIGRAF', ['STRATEGIC CONNECT S.R.L.', 'PSIHO POLIGRAF S.R.L.'])).toEqual(['STRATEGIC CONNECT S.R.L.']);
    expect(otherRegistryNames('CENTRUL MEDICAL CONECT', ['CENTRUL MEDICAL CONECT S.R.L.'])).toEqual([]);
    expect(otherRegistryNames('X', ['ALFA SRL', 'ALFA S.R.L.'])).toEqual(['ALFA SRL']);
  });
});
