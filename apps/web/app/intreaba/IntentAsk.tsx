"use client";

import { Fragment, type RefObject } from "react";
import type { IntentResult } from "@/lib/intent/types";
import { countWords } from "@/lib/ask/answer-text";
import { ASK_EXAMPLE_GROUPS, FALLBACK_EXAMPLES, type AskExample } from "./ask-examples";
import type { IntentChoice, UnderstoodLine } from "./intent-line";
import DiscoveryIcon from "../DiscoveryIcon";
import AskExampleArt from "./AskExampleArt";
import RowMenu from "./answer/RowMenu";

export type { IntentChoice } from "./intent-line";

export const MAX_QUESTION_CHARS = 300;

export function AskBox({ value, onChange, onSubmit, loading, inputRef }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  loading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <form className="ia-ask" role="search" onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
      <div className="ia-row">
        <input
          id="ia-question"
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="de exemplu: cine face iluminatul în Buzău și cât costă"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={MAX_QUESTION_CHARS}
          aria-describedby="ia-help"
        />
        <button type="submit" disabled={loading || value.trim().length < 2}>{loading ? "Citesc întrebarea…" : "Întreabă"}</button>
      </div>
      <p id="ia-help" className="ia-help">Scrie ca unui om: ce, unde, când. Îți arătăm cum am înțeles întrebarea, o poți corecta, apoi vezi răspunsul și înregistrările din spatele lui.</p>
    </form>
  );
}

function ExampleButton({ example, onPick }: { example: AskExample; onPick: (example: AskExample) => void }) {
  return (
    <button type="button" className="ia-example" onClick={() => onPick(example)}>
      <span>{example.text}</span>
      {/* A pencil puts the half-written question in the box; an arrow asks it. */}
      <span className="ia-example-go" aria-hidden="true"><DiscoveryIcon name={example.fill ? "pencil" : "arrow"} /></span>
    </button>
  );
}

export function AskExamples({ onPick }: { onPick: (example: AskExample) => void }) {
  return (
    <section className="ia-examples" aria-labelledby="ia-examples-title">
      <h2 id="ia-examples-title">Nu știi de unde să începi? Alege o întrebare</h2>
      <div className="ia-groups">
        {ASK_EXAMPLE_GROUPS.map((group) => (
          <div className="ia-group" key={group.id}>
            <AskExampleArt id={group.id} />
            <h3>{group.title}</h3>
            {group.note && <p className="ia-group-note">{group.note}</p>}
            {group.examples.map((example) => <ExampleButton key={example.text} example={example} onPick={onPick} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Nothing usable was understood: say what, and offer questions that work. */
export function IntentUnknown({ result, onPick }: { result: IntentResult; onPick: (example: AskExample) => void }) {
  const words = result.interpretation.leftover;
  return (
    <section className="ia-panel ia-unknown" aria-labelledby="ia-result-title">
      <h2 id="ia-result-title" tabIndex={-1}>Nu am înțeles întrebarea</h2>
      <p>
        {words.length
          ? <>Nu am găsit în datele noastre {words.length === 1 ? "cuvântul" : "cuvintele"} {words.map((w, i) => <span key={i}>{i > 0 ? ", " : ""}<q>{w}</q></span>)}. </>
          : <>Nu am găsit în întrebare un domeniu, un loc, o instituție sau o firmă. </>}
        Spune <strong>ce</strong>, <strong>unde</strong> sau numele unei instituții ori firme.
      </p>
      {result.interpretation.notes.map((note, i) => <p key={i} className="ia-note">{note}</p>)}
      <p className="ia-try">Exemple:</p>
      <div className="ia-fallback">
        {FALLBACK_EXAMPLES.map((example) => <ExampleButton key={example.text} example={example} onPick={onPick} />)}
      </div>
    </section>
  );
}

/** Several readings and none chosen (namesakes, same-named institutions or firms, localities of the same name). */
export function IntentChoose({ result, onAdopt }: { result: IntentResult; onAdopt: (choice: IntentChoice) => void }) {
  const partial = result.interpretation.choicesPartial;
  const choices = result.alternatives.filter((alt) => alt.kind !== "intent");
  return (
    <section className="ia-panel ia-choose" aria-labelledby="ia-result-title">
      <h2 id="ia-result-title" tabIndex={-1}>{result.problem}</h2>
      {result.interpretation.placeNote && <p className="ia-note">{result.interpretation.placeNote}</p>}
      {result.interpretation.notes.map((note, i) => <p key={i} className="ia-note">{note}</p>)}
      <ul className="ia-choices">
        {choices.map((alt, i) => (
          <li key={i}>
            <button type="button" onClick={() => onAdopt({ spec: alt.spec, sentence: alt.sentence, label: alt.label })}>
              <strong>{alt.label}</strong>
              <small>{alt.sentence}</small>
            </button>
          </li>
        ))}
      </ul>
      {partial && (
        <p className="ia-partial">
          Lista arată {partial.shown} din {countWords(partial.total, "potrivire", "potriviri")}. Dacă nu găsești ce cauți, <a href={`/cauta?q=${encodeURIComponent(partial.search)}`}>caută „{partial.search}”</a>. {partial.hint ?? "Scrie numele complet, cu localitatea ori anul nașterii."}
        </p>
      )}
    </section>
  );
}

/** One polite announcement per interpretation, kept out of the panels that hold buttons. */
export function IntentAnnouncer({ result, error }: { result: IntentResult | null; error: string | null }) {
  const text = error ? error
    : !result ? ""
    : result.spec ? `Am înțeles așa: ${result.sentence ?? ""} Răspunsul apare mai jos; poți schimba orice parte a întrebării.`
    : result.problem ?? "Nu am înțeles întrebarea.";
  return <p className="d-sr-only" role="status" aria-live="polite">{text}</p>;
}

/**
 * Under the answer's title (owner, 1 November 2026): what was assumed, the other readings (each answered at once)
 * and the words left out, one muted line; a part with nothing to say is left out.
 */
export function IntentLine({ line, onAdopt }: { line: UnderstoodLine; onAdopt: (choice: IntentChoice) => void }) {
  // On phones "am ales" drops out of the place clause so the line stays one line (owner, 2 November 2026).
  const clause = (note: string) => note.startsWith("am ales ") ? <><span className="cq-understood-verb">am ales </span>{note.slice(8)}</> : note;
  const parts = [
    ...(line.notes.length ? [<>Am înțeles: {line.notes.map((note, i) => <Fragment key={i}>{i > 0 && " · "}{clause(note)}</Fragment>)}</>] : []),
    ...(line.ignored.length ? [<>Am ignorat {line.ignored.map((word) => `„${word}”`).join(", ")} · <a href={`/cauta?q=${encodeURIComponent(line.ignored.join(" "))}`}>caută în titluri</a></>] : []),
    ...(line.options.length ? [<span className="cq-understood-more"><RowMenu
      name="Alte lecturi ale întrebării"
      trigger={{ text: <>Altfel ({line.options.length})<span aria-hidden="true">›</span></>, className: "cq-understood-alt", label: `Altfel: ${countWords(line.options.length, "altă lectură", "alte lecturi")} ale întrebării` }}
      actions={line.options.map((option, i) => ({ id: String(i), label: option.label ?? option.sentence, glyph: "›" as const, onSelect: () => onAdopt(option) }))}
    /></span>] : []),
  ];
  // A div, not a p: the open menu is a div, which a paragraph cannot hold.
  return <div className="cq-understood">{parts.map((part, i) => <Fragment key={i}>{i > 0 && " · "}{part}</Fragment>)}</div>;
}
