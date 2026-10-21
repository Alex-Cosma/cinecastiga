import { describe, expect, it } from 'vitest';
import { isOnrcIdentityBirthDate } from './onrc-identity.js';

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
