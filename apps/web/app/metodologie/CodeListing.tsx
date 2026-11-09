"use client";

import { useEffect, useRef, useState } from "react";
import { codeLines, type CodePiece } from "./code-lines";

/**
 * One source file of the score, read from /metodologie/cod/<file> the first time its section opens (by a click, by
 * "Codul scorului" or by a #cod-… link), then shown as numbered, coloured lines.
 */
export default function CodeListing({ src, label }: { src: string; label: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [lines, setLines] = useState<CodePiece[][] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const details = ref.current?.closest("details");
    if (!details) return;
    let started = false;
    let live = true;
    const load = () => {
      if (!details.open || started) return;
      started = true;
      setFailed(false);
      fetch(src)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then((text) => { if (live) setLines(codeLines(text)); })
        .catch(() => { started = false; if (live) setFailed(true); });
    };
    load();
    details.addEventListener("toggle", load);
    return () => { live = false; details.removeEventListener("toggle", load); };
  }, [src]);

  return (
    <pre ref={ref} className="mt-code-pre" tabIndex={0} aria-label={label} aria-busy={!lines && !failed}>
      {lines ? (
        <code>
          {lines.map((line, i) => (
            <span className="mt-code-l" key={i}>
              {line.map((piece, j) => (piece.kind ? <span className={`mt-k-${piece.kind}`} key={j}>{piece.text}</span> : piece.text))}
              {"\n"}
            </span>
          ))}
        </code>
      ) : (
        <span className="mt-code-wait">{failed ? "Codul nu s-a încărcat. Închide și redeschide secțiunea." : "Se încarcă…"}</span>
      )}
    </pre>
  );
}
