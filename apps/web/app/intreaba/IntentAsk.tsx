"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { IntentResult } from "@/lib/intent/types";
import { countWords } from "@/lib/ask/answer-text";
import { ASK_EXAMPLE_GROUPS, FALLBACK_EXAMPLES, type AskExample } from "./ask-examples";
import type { IntentChoice, UnderstoodLine } from "./intent-line";
import DiscoveryIcon from "../DiscoveryIcon";
import AskExampleArt from "./AskExampleArt";
import RowMenu from "./answer/RowMenu";
import { AskSuggestList, useAskSuggest } from "./AskSuggest";
import type { SuggestPin } from "./ask-suggest";

export type { IntentChoice } from "./intent-line";

export const MAX_QUESTION_CHARS = 300;
/** From here the box counts its characters (UX audit Z2-32). */
const COUNT_FROM = 250;

export function AskBox({ value, onChange, onSubmit, loading, inputRef, hidden = false, onBuild }: {
  value: string;
  onChange: (value: string) => void;
  /** `pin`: the firm or institution picked from the suggestions, while its exact name is in the words (Z2-08). */
  onSubmit: (value: string, pin: SuggestPin | null) => void;
  loading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  /** An answer on screen folds the box into „Întreabă altceva…” (AskPanel). */
  hidden?: boolean;
  /** Opens the step-by-step builder; absent while it is open. Its door is here, under the box (owner, 16 November 2026). */
  onBuild?: (() => void) | undefined;
}) {
  const suggest = useAskSuggest(value, onChange, inputRef);
  // A paste longer than the box keeps its first 300 characters, and says so until the next keystroke (Z2-32).
  const [cut, setCut] = useState(false);
  return (
    <form className="ia-ask" role="search" hidden={hidden} onSubmit={(event) => { event.preventDefault(); suggest.close(); onSubmit(value, suggest.pin.current); }}>
      <div className="ia-row">
        <div className="ia-field">
          <input
            id="ia-question"
            ref={inputRef}
            value={value}
            onChange={(event) => {
              const input = event.target;
              onChange(input.value);
              suggest.onInput(input.value, input.selectionEnd === input.value.length);
            }}
            placeholder="de exemplu: cine face iluminatul în Buzău și cât costă"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={MAX_QUESTION_CHARS}
            aria-describedby="ia-help"
            {...suggest.inputProps}
            onPaste={(event) => {
              const input = event.currentTarget, pasted = event.clipboardData.getData("text");
              setCut(input.value.length - ((input.selectionEnd ?? 0) - (input.selectionStart ?? 0)) + pasted.length > MAX_QUESTION_CHARS);
            }}
            onKeyDown={(event) => { setCut(false); suggest.inputProps.onKeyDown(event); }}
          />
          {value.length >= COUNT_FROM && <span className="ia-count" aria-hidden="true">{value.length}/{MAX_QUESTION_CHARS}</span>}
          {!hidden && !loading && <AskSuggestList suggest={suggest} />}
        </div>
        <button type="submit" disabled={loading || value.trim().length < 2}>{loading ? "Citesc întrebarea…" : "Întreabă"}</button>
      </div>
      {cut && <p className="ia-cut" role="status">Am păstrat primele {MAX_QUESTION_CHARS} de caractere.</p>}
      <p id="ia-help" className="ia-help">Scrie ce, unde, când.{onBuild && <> · <button type="button" className="ia-build-link" onClick={onBuild}>sau construiește pas cu pas →</button></>}</p>
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

/**
 * Nothing usable was understood: say what, and offer a way on (UX audit Z2-10). First the words searched in the
 * purchases' titles (/cauta, which has its own empty state), then questions that work; the builder's door is the link
 * right above, under the box. A question, not an error: the panel is neutral, not amber.
 */
export function IntentUnknown({ result, onPick }: { result: IntentResult; onPick: (example: AskExample) => void }) {
  const words = result.interpretation.leftover;
  const phrase = (words.length ? words.join(" ") : result.interpretation.text).trim();
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
      {phrase && <p className="ia-unknown-ways">
        <a className="ia-unknown-search" href={`/cauta?q=${encodeURIComponent(phrase)}`}>Caută „{phrase}” în titlurile achizițiilor →</a>
      </p>}
      <p className="ia-try">Exemple:</p>
      <div className="ia-fallback">
        {FALLBACK_EXAMPLES.map((example) => <ExampleButton key={example.text} example={example} onPick={onPick} />)}
      </div>
    </section>
  );
}

/**
 * What the namesakes are, for the line under the list (UX audit Z2-09): firms, institutions, people, from the readings
 * offered; „potriviri” when they mix.
 */
export function namesakeNoun(result: IntentResult): readonly [string, string] {
  const choices = result.alternatives.filter((alt) => alt.kind !== "intent");
  if (choices.length && choices.every((alt) => alt.kind === "person")) return ["persoană", "persoane"];
  const f = (alt: (typeof choices)[number]) => alt.spec.filters as { supplierId?: unknown; authorityId?: unknown };
  if (choices.length && choices.every((alt) => f(alt).supplierId !== undefined && f(alt).authorityId === undefined)) return ["firmă", "firme"];
  if (choices.length && choices.every((alt) => f(alt).authorityId !== undefined && f(alt).supplierId === undefined)) return ["instituție", "instituții"];
  return ["potrivire", "potriviri"];
}

/**
 * Several readings and none chosen (namesakes, same-named institutions or firms, localities of the same name). With
 * more namesakes than shown, one question and one line (UX audit Z2-09): „Care „Dacia”?”, the choices, „6 din 51 de
 * firme · Caută toate „Dacia” →”; the count is not said a third time in a note.
 */
export function IntentChoose({ result, onAdopt }: { result: IntentResult; onAdopt: (choice: IntentChoice) => void }) {
  const partial = result.interpretation.choicesPartial;
  const choices = result.alternatives.filter((alt) => alt.kind !== "intent");
  const notes = partial ? result.interpretation.notes.filter((note) => !/ se potrivesc? cu „/.test(note)) : result.interpretation.notes;
  const noun = namesakeNoun(result);
  return (
    <section className="ia-panel ia-choose" aria-labelledby="ia-result-title">
      <h2 id="ia-result-title" tabIndex={-1}>{partial ? <>Care „{partial.search}”?</> : result.problem}</h2>
      {result.interpretation.placeNote && <p className="ia-note">{result.interpretation.placeNote}</p>}
      {notes.map((note, i) => <p key={i} className="ia-note">{note}</p>)}
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
          {partial.shown} din {countWords(partial.total, noun[0], noun[1])} · <a href={`/cauta?q=${encodeURIComponent(partial.search)}`}>Caută toate „{partial.search}” →</a>
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

/** A clause as a sentence of its own: its first letter up, its full stop. */
const asSentence = (clause: string) => {
  const text = clause.charAt(0).toLocaleUpperCase("ro-RO") + clause.slice(1);
  return /[.!?…]$/.test(text) ? text : `${text}.`;
};

/**
 * The line's "›" beside its short clauses (UX audit Z2-11): the words left out and the notes too long for the line,
 * in a box under it. A press elsewhere or Escape closes it.
 */
function UnderstoodMore({ ignored, more, first }: { ignored: readonly string[]; more: readonly string[]; first: boolean }) {
  const [open, setOpen] = useState(false);
  const [end, setEnd] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null), button = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  // Past the page's right edge, the box hangs from the button's right side instead.
  useLayoutEffect(() => {
    if (!open || !box.current) { setEnd(false); return; }
    setEnd(box.current.getBoundingClientRect().right > document.documentElement.clientWidth - 8);
  }, [open]);
  const words = ignored.length ? `am ignorat ${countWords(ignored.length, "cuvânt", "cuvinte")}` : "detalii";
  return (
    <span className="cq-understood-more" ref={root}
      onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); } }}>
      <button ref={button} type="button" className="cq-understood-alt" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        {first ? words.charAt(0).toLocaleUpperCase("ro-RO") + words.slice(1) : words}<span aria-hidden="true">›</span>
      </button>
      <div id={id} ref={box} className={`cq-understood-pop${end ? " cq-understood-pop--end" : ""}`} hidden={!open}>
        {ignored.length > 0 && <p>Am ignorat {ignored.map((word) => `„${word}”`).join(", ")}.</p>}
        {more.map((note, i) => <p key={i}>{asSentence(note)}</p>)}
      </div>
    </span>
  );
}

/**
 * Under the answer's title (owner, 1 November 2026): what was assumed, the other readings (each answered at once)
 * and the words left out, one muted line; a part with nothing to say is left out. At most two short clauses stay on
 * the line; the words left out and the long notes wait behind „am ignorat N cuvinte ›” (UX audit Z2-11).
 */
export function IntentLine({ line, onAdopt }: { line: UnderstoodLine; onAdopt: (choice: IntentChoice) => void }) {
  // On phones "am ales" drops out of the place clause so the line stays one line (owner, 2 November 2026).
  const clause = (note: string) => note.startsWith("am ales ") ? <><span className="cq-understood-verb">am ales </span>{note.slice(8)}</> : note;
  const parts = [
    ...(line.notes.length ? [<>Am înțeles: {line.notes.map((note, i) => <Fragment key={i}>{i > 0 && " · "}{clause(note)}</Fragment>)}</>] : []),
    ...(line.ignored.length || line.more.length ? [<UnderstoodMore ignored={line.ignored} more={line.more} first={!line.notes.length} />] : []),
    ...(line.titles ? [<a href={line.titles.href}>caută „{line.titles.words}” în titluri<span className="cq-understood-wide">{line.titles.where ? `, la ${line.titles.where}` : ""}{line.titles.period ? `, ${line.titles.period}` : ""}</span></a>] : []),
    ...(line.options.length ? [<span className="cq-understood-more"><RowMenu
      name="Alte lecturi ale întrebării"
      trigger={{ text: <>Altfel ({line.options.length})<span aria-hidden="true">›</span></>, className: "cq-understood-alt", label: `Altfel: ${countWords(line.options.length, "altă lectură", "alte lecturi")} ale întrebării` }}
      actions={line.options.map((option, i) => ({ id: String(i), label: option.label ?? option.sentence, glyph: "›" as const, onSelect: () => onAdopt(option) }))}
    /></span>] : []),
  ];
  // A div, not a p: the open menu is a div, which a paragraph cannot hold.
  return <div className="cq-understood">{parts.map((part, i) => <Fragment key={i}>{i > 0 && " · "}{part}</Fragment>)}</div>;
}
