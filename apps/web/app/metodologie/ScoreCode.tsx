import { countWords } from "@/lib/ask/answer-text";
import CodeListing from "./CodeListing";
import { SCORE_CODE } from "./score-code.generated";

/**
 * The score's source on /metodologie, one closed section per file (owner, 9 November 2026: shown, not linked). The
 * text itself loads when a section opens (CodeListing), so the page doesn't carry it for every reader.
 */
export default function ScoreCode() {
  return (
    <div className="mt-codes">
      {SCORE_CODE.map((file) => {
        const name = file.path.slice(file.path.lastIndexOf("/") + 1);
        const src = `/metodologie/cod/${name}`;
        const count = countWords(file.source.replace(/\n$/, "").split("\n").length, "linie", "linii");
        return (
          <details suppressHydrationWarning className="mt-code" id={file.id} key={file.id}>
            <summary>
              <span className="mt-code-t">{file.title}</span>
              <code className="mt-code-p">{file.path}</code>
              <span className="mt-code-n">{count}</span>
            </summary>
            <CodeListing src={src} label={`${file.path}, ${count}`} />
            <p className="mt-code-raw"><a href={src}>Fișierul ca text</a></p>
          </details>
        );
      })}
    </div>
  );
}
