import { describe, expect, it } from 'vitest';
import { canonicalPersonKey, isOnrcIdentityBirthDate } from './onrc-identity.js';

describe('ONRC birth dates that may identify a person (audit F37)', () => {
  it('rejects the 1910 placeholders, so namesakes under them never share an identity', () => {
    expect(isOnrcIdentityBirthDate('1910-01-01', '2026-07-08')).toBe(false);
    expect(isOnrcIdentityBirthDate('1910-10-10', '2026-07-08')).toBe(false);
    expect(isOnrcIdentityBirthDate('1910-01-02', '2026-07-08')).toBe(true);
    expect(isOnrcIdentityBirthDate('1910-10-11', '2026-07-08')).toBe(true);
  });

  it('rejects the dates the site labels implausible: before 1910, future, under 16 at the snapshot', () => {
    for (const d of ['0002-06-20', '0959-03-01', '1900-01-01', '1901-01-01', '1909-12-31', '2011-01-01', '2074-09-30', '9999-01-01'])
      expect(isOnrcIdentityBirthDate(d, '2026-07-08')).toBe(false);
    expect(isOnrcIdentityBirthDate('2010-12-31', '2026-07-08')).toBe(true);
    expect(isOnrcIdentityBirthDate('1970-01-02', '2026-07-08')).toBe(true);
  });

  it('treats a missing or malformed date as no identity', () => {
    expect(isOnrcIdentityBirthDate(null, '2026-07-08')).toBe(false);
    expect(isOnrcIdentityBirthDate('', '2026-07-08')).toBe(false);
    expect(isOnrcIdentityBirthDate('01.02.1970', '2026-07-08')).toBe(false);
  });
});

describe('the person key with the name\'s punctuation and spacing folded (0090, 1 November 2026)', () => {
  it('makes the spellings of one name one key, and leaves the date and the locality as they were', () => {
    expect(canonicalPersonKey('nastasa maria-monica|1981-05-05|loc. macin')).toBe('nastasa maria monica|1981-05-05|loc. macin');
    expect(canonicalPersonKey('nastasa maria monica|1981-05-05|loc. macin')).toBe('nastasa maria monica|1981-05-05|loc. macin');
    expect(canonicalPersonKey('ionescu  maria -ana|1961-02-03|campina,prahova')).toBe('ionescu maria ana|1961-02-03|campina,prahova');
    expect(canonicalPersonKey('ana - maria popa|1982-04-12|bucuresti')).toBe('ana maria popa|1982-04-12|bucuresti');
  });
  it('leaves anything that is not a person key alone', () => {
    expect(canonicalPersonKey('not a key')).toBe('not a key');
  });
});
