/*
 * The last answers this tab received, so that "Înapoi" (or a question asked again a moment later) shows its answer
 * at once instead of asking the server (owner, 1 November 2026). Memory only: a reload, a closed tab or another
 * window starts empty. At most KEPT_ANSWERS keys, each for KEPT_MINUTES; an older answer is asked again, so a
 * nightly run's new data reaches the page within that time without any data version in the answer.
 */

export const KEPT_ANSWERS = 10;
export const KEPT_MINUTES = 30;

const kept = new Map<string, { value: unknown; at: number }>();

/** The answer kept under this key, while it is fresh. */
export function recallAnswer<T>(key: string, now = Date.now()): T | undefined {
  const hit = kept.get(key);
  if (!hit) return undefined;
  if (now - hit.at > KEPT_MINUTES * 60_000) {
    kept.delete(key);
    return undefined;
  }
  return hit.value as T;
}

/** Keeps one answer under its keys (the question asked, the question the engine ran); the oldest go first. */
export function keepAnswer(keys: readonly string[], value: unknown, now = Date.now()): void {
  for (const key of new Set(keys)) {
    kept.delete(key);
    kept.set(key, { value, at: now });
  }
  for (const oldest of kept.keys()) {
    if (kept.size <= KEPT_ANSWERS) break;
    kept.delete(oldest);
  }
}

export function forgetAnswers(): void {
  kept.clear();
}
