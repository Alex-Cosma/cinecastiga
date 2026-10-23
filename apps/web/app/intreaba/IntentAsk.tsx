"use client";

import type { RefObject } from "react";
import type { AskSpec } from "@/lib/ask/spec";
import type { IntentResult } from "@/lib/intent/types";
import { ASK_EXAMPLE_GROUPS, FALLBACK_EXAMPLES, type AskExample } from "./ask-examples";

/** The interpretation the builder was seeded with: the main one or an alternative. */
export interface IntentChoice {
  spec: AskSpec;
  sentence: string;
  label?: string;
}

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
      <label htmlFor="ia-question" className="ia-label">Scrie întrebarea ta</label>
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
      <small aria-hidden="true">{example.fill ? "completează →" : "întreabă →"}</small>
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
        Încearcă să spui <strong>ce</strong> s-a cumpărat (asfalt, medicamente, iluminat), <strong>unde</strong> (un județ sau o localitate) sau numele unei instituții ori al unei firme.
      </p>
      {result.interpretation.notes.map((note, i) => <p key={i} className="ia-note">{note}</p>)}
      <p className="ia-try">Poți porni de la una dintre aceste întrebări:</p>
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
          Lista arată {partial.shown} din {partial.total} potriviri. Dacă nu găsești ce cauți, <a href={`/cauta?q=${encodeURIComponent(partial.search)}`}>caută „{partial.search}”</a>. {partial.hint ?? "Scrie numele complet, cu localitatea ori anul nașterii."}
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

export function IntentIntro({ result }: { result: IntentResult }) {
  return (
    <div className="ia-intro">
      <h2 id="ia-understood" className="ia-eyebrow" tabIndex={-1}>Am înțeles așa <span>· apasă pe un cuvânt evidențiat ca să-l schimbi</span></h2>
      <p className="ia-asked">Ai întrebat: <q>{result.q}</q></p>
    </div>
  );
}

/** Under the run button: what we assumed, what we did not understand, other readings. */
export function IntentOutro({ result, chosen, onAdopt }: { result: IntentResult; chosen: IntentChoice; onAdopt: (choice: IntentChoice) => void }) {
  const words = result.interpretation.leftover;
  const main: IntentChoice | null = result.spec && result.sentence ? { spec: result.spec, sentence: result.sentence, label: "Cum am înțeles la început" } : null;
  const key = (spec: AskSpec) => JSON.stringify(spec);
  const options = [
    ...(main && key(main.spec) !== key(chosen.spec) ? [main] : []),
    ...result.alternatives.filter((alt) => key(alt.spec) !== key(chosen.spec)).map((alt) => ({ spec: alt.spec, sentence: alt.sentence, label: alt.label })),
  ];
  // the reason for the main place choice only describes the main reading
  const isMain = !!main && key(main.spec) === key(chosen.spec);
  const notes = [...(isMain && result.interpretation.placeNote ? [result.interpretation.placeNote] : []), ...result.interpretation.notes];
  if (!words.length && !options.length && !notes.length) return null;
  return (
    <div className="ia-outro">
      {words.length > 0 && (
        <p className="ia-leftover">
          Nu am înțeles: {words.map((w, i) => <span key={i}>{i > 0 ? ", " : ""}<q>{w}</q></span>)}. Răspunsul nu ține cont de {words.length === 1 ? "acest cuvânt" : "aceste cuvinte"}. Le poți <a href={`/cauta?q=${encodeURIComponent(words.join(" "))}`}>căuta în titlurile achizițiilor</a>.
        </p>
      )}
      {notes.map((note, i) => <p key={i} className="ia-note">{note}</p>)}
      {options.length > 0 && (
        <div className="ia-alts">
          <h3 className="ia-alts-title">Sau întreabă altfel:</h3>
          <ul>
            {options.map((option, i) => (
              <li key={i}>
                <button type="button" onClick={() => onAdopt(option)}>
                  <strong>{option.label}</strong>
                  <small>{option.sentence}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
