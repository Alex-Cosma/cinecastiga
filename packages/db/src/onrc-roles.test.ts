import { describe, expect, it } from 'vitest';
import { roleLinksFirms } from './onrc-roles.js';

// Every calitate in reference.company_reps on the 1 Oct 2026 snapshot (audit F31).
const LINKING = [
  'administrator', 'reprezentant al persoanei juridice', 'administrator si reprezentant',
  'reprezentant administrator persoana juridica', 'director general unic', 'reprezentant legal',
  'membru în directorat', 'administrator provizoriu', 'administrator si conducator', 'mandatar',
  'administrator repus în funcție',
];
const NOT_LINKING = [
  'membru în consiliul de supraveghere', 'lichidator judiciar', 'lichidator', 'lichidator provizoriu',
  'administrator judiciar', 'lichidator judiciar provizoriu', 'administrator special',
  'administrator judiciar provizoriu', 'administrator concordatar',
];

describe('ONRC roles that link firms in net_shared_admin', () => {
  it('keeps representation and management roles, and a missing role', () => {
    for (const role of [...LINKING, null, '']) expect(roleLinksFirms(role), String(role)).toBe(true);
  });
  it('drops supervisory-board, insolvency and liquidation roles, whatever the case', () => {
    for (const role of [...NOT_LINKING, 'ADMINISTRATOR SPECIAL', 'Lichidator Judiciar'])
      expect(roleLinksFirms(role), role).toBe(false);
  });
});
