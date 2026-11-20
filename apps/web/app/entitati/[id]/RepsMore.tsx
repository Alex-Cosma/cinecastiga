"use client";

import { useState, type ReactNode } from "react";
import { countWords } from "@/lib/ask/answer-text";

/**
 * „Conducere” on a phone (UX audit Z5-26, 16 November 2026): the first persons, then „Încă N persoane”, which shows the
 * rest in place. On wider screens every row is shown and the button is not.
 */
export default function RepsMore({ hidden, children }: { hidden: number; children: ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <div className={`reps${all ? " reps-all" : ""}`}>
      {children}
      {hidden > 0 && !all && (
        <button type="button" className="reps-more" onClick={() => setAll(true)}>
          {hidden === 1 ? "Încă o persoană" : `Încă ${countWords(hidden, "persoană", "persoane")}`}
        </button>
      )}
    </div>
  );
}
