"use client";

import { useEffect, useState } from "react";
import { useViewer } from "../../lib/use-viewer";
import { countWords } from "../../lib/ask/answer-text";
import { LOCAL_QUESTIONS_EVENT, LOCAL_QUESTIONS_KEY, localQuestionStorage, readLocalQuestionStore } from "../../lib/ask/local-questions";

/**
 * How many questions the reader has kept (UX audit Z2-27): those of this browser, and those of the account when signed
 * in (one list request after the page is drawn; nothing waits for it). Null until known or when it cannot be read.
 */
export function useSavedCount(enabled: boolean): number | null {
  const viewer = useViewer();
  const [count, setCount] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const again = (event: Event) => { if (!(event instanceof StorageEvent) || event.key === LOCAL_QUESTIONS_KEY || event.key === null) setRefresh((n) => n + 1); };
    window.addEventListener("storage", again); window.addEventListener(LOCAL_QUESTIONS_EVENT, again);
    return () => { window.removeEventListener("storage", again); window.removeEventListener(LOCAL_QUESTIONS_EVENT, again); };
  }, []);
  useEffect(() => {
    if (!enabled || !viewer.ready) return;
    let local = 0;
    try { local = readLocalQuestionStore(localQuestionStorage()).questions.length; } catch { /* no storage: nothing kept here */ }
    setCount(local);
    if (!viewer.userId) return;
    const controller = new AbortController();
    fetch("/api/recipes", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? ((await response.json()) as { recipes?: unknown[] }).recipes?.length ?? 0 : 0)
      .then((account) => { if (!controller.signal.aborted) setCount(local + account); })
      .catch(() => { /* the device's count stays */ });
    return () => controller.abort();
  }, [enabled, viewer.ready, viewer.userId, refresh]);
  return count;
}

/** „Întrebările tale salvate (2) ›”, under the box of the empty page: one tap to the list (Z2-27). */
export function SavedEntry({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <p className="ia-saved-entry">
      <button type="button" className="ia-build-link" aria-haspopup="dialog" aria-label={`Întrebările tale salvate: ${countWords(count, "întrebare", "întrebări")}`} onClick={onOpen}>
        Întrebările tale salvate ({count}) ›
      </button>
    </p>
  );
}
