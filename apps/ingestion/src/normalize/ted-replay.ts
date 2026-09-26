/** Retry only errors for which PostgreSQL has rolled back the transaction. */
export function replayRetryable(error: unknown): boolean {
  let current = error;
  for (let i = 0; i < 8 && current && typeof current === "object"; i++) {
    const e = current as { code?: string; cause?: unknown };
    if (e.code === "40P01" || e.code === "40001") return true;
    current = e.cause;
  }
  return false;
}

/** PostgreSQL's primary message only: omit SQL, bind parameters and key details. */
export function replayErrorDetails(error: unknown): { code: string | null; constraint: string | null; message: string } {
  let current = error;
  let found: { code: string; constraint: string | null; message: string } | null = null;
  for (let i = 0; i < 8 && current && typeof current === "object"; i++) {
    const e = current as { code?: unknown; constraint_name?: unknown; message?: unknown; cause?: unknown };
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
      found = { code: e.code, constraint: typeof e.constraint_name === "string" ? e.constraint_name : null,
        message: typeof e.message === "string" ? e.message.split("\n")[0]!.slice(0, 500) : "PostgreSQL replay failure" };
    }
    current = e.cause;
  }
  return found ?? { code: null, constraint: null, message: "TED replay failed; current notice rolled back" };
}

export async function retryReplayTransaction<T>(run: () => Promise<T>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) {
      if (attempt >= 3 || !replayRetryable(error)) throw error;
      await wait(50 * 2 ** attempt);
    }
  }
}

/** Bounded queue; failure stops new work and waits for active atomic notices. */
export async function runReplayQueue<T>(items: T[], concurrency: number, run: (item: T) => Promise<void>) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error("Replay concurrency must be 1..4");
  let next = 0;
  let failure: unknown;
  const worker = async () => {
    while (failure == null && next < items.length) {
      const item = items[next++]!;
      try { await run(item); }
      catch (error) { failure = error ?? new Error("Replay failed"); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (failure != null) throw failure;
}
