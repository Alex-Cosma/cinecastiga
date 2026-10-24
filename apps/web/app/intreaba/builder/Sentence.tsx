import type { ReactNode } from "react";
import type { SentenceToken } from "./kit-types";

/*
 * Component 1, the sentence (P1): what is counted, as editable phrases.
 * 1b, the fixed phrase: a word that cannot change here, drawn as text.
 * P5, the presentation line ("Arată [primele 10], după [...]"), uses the same
 * tokens. No × in the sentence (R4): a phrase goes back to its default from
 * the first row of its window. The subject looks like any phrase (kit §5.39).
 */

interface TokenProps {
  tokens: readonly SentenceToken[];
  /** Opens the window of a phrase; the trigger is where focus returns. */
  onOpen?: (id: string, trigger: HTMLButtonElement) => void;
  /** The id of the phrase whose window is open (aria-expanded). */
  openId?: string | null;
}

export interface SentenceProps extends TokenProps {
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
}

/** An editable phrase: a button named "{slot}: {value}" ("Perioada: 2025"). */
export function Phrase({ token, open, onOpen }: { token: Extract<SentenceToken, { kind: "slot" }>; open: boolean; onOpen?: TokenProps["onOpen"] }) {
  return <button
    type="button"
    className={`fk-phrase${token.className ? ` ${token.className}` : ""}`}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={`${token.slot}: ${token.value}`}
    onClick={event => onOpen?.(token.id, event.currentTarget)}
  ><span>{token.value}</span><i className="fk-chev" aria-hidden="true" /></button>;
}

const LEADING_PUNCTUATION = /^([?!.,;:…»”)]+)(.*)$/s;

/**
 * The tokens as nodes. A comma or question mark after a phrase stays on the
 * phrase's line, and the last two words before the closing "?" stay
 * together (kit §9: short phrases are not split across lines).
 */
export function sentenceNodes({ tokens, onOpen, openId }: TokenProps): ReactNode[] {
  const nodes: ReactNode[] = [];
  tokens.forEach((token, index) => {
    const key = `t${index}`;
    if (token.kind === "text") {
      const previous = tokens[index - 1];
      let text = token.text;
      const glued = previous && previous.kind !== "text" ? LEADING_PUNCTUATION.exec(text) : null;
      if (glued) {
        const last = nodes.pop();
        nodes.push(<span className="fk-nowrap" key={`${key}g`}>{last}{glued[1]}</span>);
        text = glued[2] ?? "";
      }
      const closing = index === tokens.length - 1 && /\S\s+\S+\?$/.test(text) ? /^(.*?)(\S+\s+\S+\?)$/s.exec(text) : null;
      if (closing) nodes.push(closing[1], <span className="fk-nowrap" key={`${key}c`}>{closing[2]}</span>);
      else if (text) nodes.push(text);
      return;
    }
    if (token.kind === "fixed") nodes.push(<span className="fk-phrase fk-phrase--fixed" key={key}><span>{token.text}</span></span>);
    else nodes.push(<Phrase key={key} token={token} open={openId === token.id} {...(onOpen ? { onOpen } : {})} />);
  });
  return nodes;
}

export default function Sentence({ as: Tag = "h2", className, ...tokens }: SentenceProps) {
  return <Tag className={`fk-sentence${className ? ` ${className}` : ""}`}>{sentenceNodes(tokens)}</Tag>;
}

/** P5: how many rows and in what order, when that changes the query. */
export function Presentation(props: TokenProps) {
  return <p className="fk-present">{sentenceNodes(props)}</p>;
}
