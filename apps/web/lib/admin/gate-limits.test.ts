import {describe, expect, it} from 'vitest';
import {SEAP_MAX_IN_FLIGHT, SEAP_MAX_REQUESTS_PER_MINUTE} from '@seap/db';
import {GATE_MAX_IN_FLIGHT, GATE_MAX_PER_MINUTE} from './gate-limits';

describe('gate ceilings in the administration', () => {
  it('match the database package', () => {
    expect(GATE_MAX_IN_FLIGHT).toBe(SEAP_MAX_IN_FLIGHT);
    expect(GATE_MAX_PER_MINUTE).toBe(SEAP_MAX_REQUESTS_PER_MINUTE);
  });
});
