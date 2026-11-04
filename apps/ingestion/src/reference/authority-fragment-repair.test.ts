import { describe, expect, it } from 'vitest';
import { PINNED_FRAGMENTS, planFragment, type FragmentHolder } from './authority-fragment-repair.js';

// Production, 4 November 2026: '4455226 COMUNA RACOVA(CONSILIUL LOCAL)' on fragment 2153036, Comuna Racova 2139786 holds CUI 4455226.
const racova = (over: Partial<FragmentHolder> = {}): FragmentHolder => ({
  holderId: '2153036', targets: ['2139786'], prefixes: ['4455226'], groups: [6462], raws: ['4455226 COMUNA RACOVA(CONSILIUL LOCAL)'],
  planned: 70, liveRows: 0, holder: { cuiValid: false, cui: null, foreignId: null, isForeign: false }, sicap: ['authority:4455226'],
  authorityRows: 70, otherRoles: false, holderRedirect: null, holderIsTarget: false, targetRedirected: false,
  holderUat: 24711, targetUat: 24711, prefixInDimension: false, ...over,
});
const reason = (h: FragmentHolder) => { const o = planFragment(h); return o.outcome === 'skipped' ? o.reason : o.outcome; };

describe('legacy authority fragments led by the exact CUI of the target (owner, 4 November 2026)', () => {
  it('merges a key-less fragment whose only SICAP id is the fabricated prefix', () => {
    expect(planFragment(racova())).toEqual({ holderId: '2153036', targetId: '2139786', prefix: '4455226', rows: 70, groups: [6462],
      raws: ['4455226 COMUNA RACOVA(CONSILIUL LOCAL)'], outcome: 'merge', uat: 'same' });
  });

  it('moves the UAT mapping only when the target has none, and never across two codes', () => {
    expect(planFragment(racova({ targetUat: null }))).toMatchObject({ outcome: 'merge', uat: 'move' });
    expect(planFragment(racova({ holderUat: null }))).toMatchObject({ outcome: 'merge', uat: 'none' });
    expect(reason(racova({ targetUat: 1 }))).toBe('uat-conflict');
  });

  it('never merges a holder with a key, other roles, live rows or rows outside the plan', () => {
    expect(reason(racova({ holder: null }))).toBe('holder-missing');
    expect(reason(racova({ holder: { cuiValid: true, cui: '4455226', foreignId: null, isForeign: false } }))).toBe('holder-has-key');
    expect(reason(racova({ holder: { cuiValid: false, cui: null, foreignId: 'X1', isForeign: true } }))).toBe('holder-has-key');
    expect(reason(racova({ authorityRows: 71 }))).toBe('not-fully-evacuated');
    expect(reason(racova({ liveRows: 1 }))).toBe('live-rows');
    expect(reason(racova({ otherRoles: true }))).toBe('other-roles');
  });

  it('needs one target, one prefix and the fabricated SICAP id as the only key', () => {
    expect(reason(racova({ targets: ['2139786', '1'] }))).toBe('several-targets');
    expect(reason(racova({ prefixes: ['4455226', '4455227'] }))).toBe('several-targets');
    expect(reason(racova({ sicap: ['authority:23600'] }))).toBe('sicap-not-fabricated');
    expect(reason(racova({ sicap: ['authority:4455226', 'supplier:1'] }))).toBe('sicap-not-fabricated');
    // A prefix that is a real SICAP participant id in the original dimension is not fabricated.
    expect(reason(racova({ prefixInDimension: true }))).toBe('prefix-is-sicap-id');
  });

  it('keeps redirects direct and terminal', () => {
    expect(reason(racova({ holderRedirect: '2139786' }))).toBe('redirected-elsewhere');
    expect(reason(racova({ holderIsTarget: true }))).toBe('holder-is-redirect-target');
    expect(reason(racova({ targetRedirected: true }))).toBe('target-redirected');
  });

  it('pins Tibucani as a reviewed mistyped prefix, off until the owner approves it', () => {
    expect(PINNED_FRAGMENTS).toEqual([expect.objectContaining({ prefix: '2164244', holderId: '2151208', targetId: '2205736', targetCui: '2614244', approved: true })]);
  });
});
