/**
 * At most a few full reads of a signal's or a pattern's sources at once in the process (launch audit H2,
 * 12 November 2026). A read can load up to 200,000 records into memory, and both /semnale/[id] and
 * /api/evidence/sources are public: a script asking for the largest signals in parallel could exhaust the web's memory.
 * Others wait their turn; after `waitMs` the read is refused with EvidenceBusyError instead of piling up.
 * Paginating the read in SQL is the lasting fix.
 */
export const EVIDENCE_SLOTS = 3;
export const EVIDENCE_WAIT_MS = 15_000;
export const EVIDENCE_BUSY_MESSAGE = "Se pregătesc deja multe liste de surse. Încearcă din nou peste un minut.";

export class EvidenceBusyError extends Error {
  constructor() { super(EVIDENCE_BUSY_MESSAGE); }
}

type State = { busy: number; waiting: Array<() => void> };
const g = globalThis as unknown as { __seapEvidenceSlots?: State };
const state = (): State => (g.__seapEvidenceSlots ??= { busy: 0, waiting: [] });

/** Runs `read` in a slot, waiting for one up to `waitMs`. */
export async function withEvidenceSlot<T>(read: () => Promise<T>, max = EVIDENCE_SLOTS, waitMs = EVIDENCE_WAIT_MS): Promise<T> {
  const s = state();
  if (s.busy >= max) {
    await new Promise<void>((resolve, reject) => {
      const wake = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const i = s.waiting.indexOf(wake);
        if (i >= 0) s.waiting.splice(i, 1);
        reject(new EvidenceBusyError());
      }, waitMs);
      s.waiting.push(wake);
    });
  } else {
    s.busy += 1;
  }
  try {
    return await read();
  } finally {
    // The slot passes straight to the next in line, or is freed.
    const next = s.waiting.shift();
    if (next) next(); else s.busy = Math.max(0, s.busy - 1);
  }
}

/** For tests: slots taken and readers waiting. */
export function evidenceSlotState(): { busy: number; waiting: number } {
  const s = state();
  return { busy: s.busy, waiting: s.waiting.length };
}
