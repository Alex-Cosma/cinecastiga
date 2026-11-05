/**
 * A per-process cap on concurrent heavy exports (the full-result CSV of an
 * answer). Each export can hold a database connection for up to its statement
 * timeout and buffer up to CSV_MAX_ROWS rows, and the route is anonymous, so a
 * handful of parallel requests could take the Ask pool. Beyond the cap the
 * route answers 429 with a Retry-After instead of queueing.
 */

export const EXPORT_SLOTS = 2;
export const EXPORT_RETRY_AFTER_SECONDS = 30;
export const EXPORT_BUSY_MESSAGE = "Se pregătesc deja alte exporturi. Încearcă din nou peste un minut.";

type SlotState = { busy: number };

const g = globalThis as unknown as { __seapExportSlots?: SlotState };

function state(): SlotState {
  if (!g.__seapExportSlots) g.__seapExportSlots = { busy: 0 };
  return g.__seapExportSlots;
}

/** Takes a slot, or returns null when all are in use. The release is idempotent. */
export function acquireExportSlot(max: number = EXPORT_SLOTS): (() => void) | null {
  const s = state();
  if (s.busy >= max) return null;
  s.busy += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    s.busy = Math.max(0, s.busy - 1);
  };
}

/** For tests: how many slots are taken. */
export function exportSlotsInUse(): number {
  return state().busy;
}
