"use client";

import { useState } from "react";
import { countWords } from "../../../lib/ask/answer-text";
import { KIND_WORDS, focalRole, type QuestionSpec } from "../../../lib/ask/question-ui";
import {
  PEER_MINIMUM, peerCountWords, peerKey, peerRowState, peerTicks, togglePeerRow, writePeerTicks, type PeerDialogData, type PeerRowId,
} from "../../../lib/ask/peer-groups-shared";
import { formatInt } from "../../../lib/format";
import OptionList from "./pickers/OptionList";
import type { KitOption } from "./kit-types";
import type { PeerDialogState } from "./use-peer-dialog";
import "../distribution.css";

/*
 * "Față de cine?" (plan §4.11, final distribution §3.1; kit component 9 with
 * checkboxes): the rows depend on the entity, each names its concrete group
 * and, unticked, "→ N", the size after ticking it. A row that does not fit
 * with the ticks replaces them ("în locul „Spitale”"); one with fewer than 5
 * alone is disabled with its reason. No "Aplică": a tick changes the group at
 * once and × only closes. An old link's other county or kind stays applied,
 * shown apart with its ×. The builder's phrase and the answer's "Schimbă
 * grupul" open the same window.
 */

export interface PeersWindowProps {
  spec: QuestionSpec;
  state: PeerDialogState;
  /** The question after a tick (its peers and county), with the note of a replacement. */
  onChange: (next: QuestionSpec, note: string | null) => void;
}

const entityId = (spec: QuestionSpec, role: "authority" | "supplier") => String(spec.filters[role === "authority" ? "authorityId" : "supplierId"] ?? "");

/** The window's data when it is about the spec's entity (the last answer stays while another entity's comes). */
export function peerDataFor(spec: QuestionSpec, state: PeerDialogState): PeerDialogData | null {
  const role = focalRole(spec);
  return state.data && state.data.facts.role === role && state.data.facts.entityId === entityId(spec, role) ? state.data : null;
}

export default function PeersWindow({ spec, state, onChange }: PeersWindowProps) {
  const [note, setNote] = useState<string | null>(null);
  const role = focalRole(spec);
  const data = peerDataFor(spec, state);
  if (!entityId(spec, role)) return <p className="qb-search-status">Alege întâi instituția sau firma.</p>;
  if (!data) return <p className="qb-search-status" role="status">{state.error ?? "Caut grupurile…"}</p>;
  const { facts } = data;
  if (!data.profile)
    return <p className="qb-search-status">{facts.name} are {countWords(facts.nDas, "achiziție directă", "achiziții directe")}. Comparația începe de la 10.</p>;
  const ticks = peerTicks(spec, facts);
  const label = (id: PeerRowId) => data.rows.find((r) => r.id === id)?.label ?? id;
  const options: KitOption[] = data.rows.map((row) => {
    const now = peerRowState(data, ticks, row.id);
    return {
      value: row.id, label: row.label, detail: row.rule,
      ...(now.kind === "add" ? { count: `→ ${formatInt(now.size)}`, ...(now.replaces.length ? { swap: `în locul ${now.replaces.map((id) => `„${label(id)}”`).join(", ")}` } : {}) } : {}),
      ...(now.kind === "disabled" ? { disabled: now.short } : {}),
    };
  });
  const size = data.sizes[peerKey(ticks)];
  const legacyKind = data.legacy.authorityKind ? KIND_WORDS[data.legacy.authorityKind]?.the ?? data.legacy.authorityKind : null;
  const remove = (key: "county" | "authorityKind") => {
    const next = structuredClone(spec);
    delete next.filters[key];
    onChange(next, null);
  };
  return <>
    <p className="pw-for">Grupul pentru {facts.name}</p>
    {(data.legacy.county || legacyKind) && <div className="pw-legacy" aria-label="Din link">
      {data.legacy.county && <span className="qb-chip qb-chip--legacy"><span className="qb-chip-main">Din link: {/^bucure/i.test(data.legacy.county) ? "București" : `Județul ${data.legacy.county}`}</span>
        <button type="button" className="qb-chip-x" aria-label={`Scoate «${data.legacy.county}»`} onClick={() => remove("county")}>×</button></span>}
      {legacyKind && <span className="qb-chip qb-chip--legacy"><span className="qb-chip-main">Din link: {legacyKind}</span>
        <button type="button" className="qb-chip-x" aria-label={`Scoate «${legacyKind}»`} onClick={() => remove("authorityKind")}>×</button></span>}
    </div>}
    <OptionList label="Față de cine" multiple options={options} values={ticks}
      onChange={(id) => {
        const next = togglePeerRow(spec, data, id as PeerRowId);
        setNote(next.note);
        if (next.spec !== spec) onChange(next.spec, next.note);
      }} />
    {note && <p className="pw-note" role="status">{note}</p>}
    <div className="qb-pop-foot">
      <span aria-live="polite">Grup: {size === undefined ? "—" : ticks.length || data.legacy.county || legacyKind
        ? <b>{peerCountWords(size, spec, role, facts)}</b> : <>toată țara · <b>{peerCountWords(size, spec, role, facts)}</b></>}
        {size !== undefined && size < PEER_MINIMUM && <> · prea puține pentru comparație</>}</span>
      {ticks.length > 0 && <button type="button" className="qb-link" onClick={() => { setNote(null); onChange(writePeerTicks(spec, [], facts), null); }}>Șterge</button>}
    </div>
  </>;
}
