"use client";

import { useEffect, useState } from "react";
import { countWords } from "../../../lib/ask/answer-text";
import type { PersonFirms as Firms } from "../../../lib/ask/person-firms";
import { countyDisplay } from "../../../lib/ask/peer-groups-shared";
import { cleanName } from "../../../lib/format";
import HelpTip from "./HelpTip";
import OptionList from "./pickers/OptionList";

/*
 * "Persoane → firmele lor" in "De la cine?" at a verification (plan §4.10,
 * final fact_check §3.4): the person found by name unfolds into the firms it
 * represents today that sell to institutions, each with its CUI, county and
 * role; choosing one writes the firm (supplierId), never the person. Read
 * from POST /api/ask/person-firms once the person is chosen.
 */

export interface PersonPick { key: string; name: string; detail?: string | undefined }
/** The (?) of the section (final §3.4): one snapshot of the register, no mandate dates. */
export const PERSON_FIRMS_TIP = "Reprezentanți legali azi, din Registrul Comerțului (un singur instantaneu). Nu știm de când; nu înseamnă proprietar. Lipsesc mandatele de insolvență și lichidare.";

export default function PersonFirms({ person, onPick }: { person: PersonPick; onPick: (firm: { id: string; name: string }) => void }) {
  const [state, setState] = useState<{ data: Firms | null; error: string | null }>({ data: null, error: null });
  // The section opens where the person's row was, under a pointer at rest: its (?) waits for the pointer to move
  // before it opens on hover (a tap, a click or the keyboard open it at once).
  const [still, setStill] = useState(true);
  useEffect(() => {
    const ctrl = new AbortController();
    setState({ data: null, error: null });
    void fetch("/api/ask/person-firms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: person.key }), signal: ctrl.signal })
      .then(async (r) => { const body = await r.json() as { ok: boolean; data?: Firms; error?: string }; if (!r.ok || !body.ok || !body.data) throw new Error(body.error ?? "Eroare"); return body.data; })
      .then((data) => setState({ data, error: null }))
      .catch((error: unknown) => { if (!ctrl.signal.aborted) setState({ data: null, error: error instanceof Error ? error.message : "Eroare" }); });
    return () => ctrl.abort();
  }, [person.key]);
  const { data, error } = state;
  const others = data ? data.firms - data.suppliers.length : 0;
  const moved = () => { if (still) setStill(false); };
  return <div className={`qb-person-firms${still ? " qb-still" : ""}`} onPointerMove={moved} onPointerDown={moved}>
    <p className="qb-opt-group qb-tipwrap">Firmele reprezentate azi <HelpTip tip={{ title: "Persoane → firmele lor", text: PERSON_FIRMS_TIP }} /></p>
    {!data && !error && <p className="qb-search-status" role="status">Caut firmele…</p>}
    {error && <p className="qb-form-error" role="alert">{error}</p>}
    {data && (data.suppliers.length
      ? <OptionList label={`Firmele lui ${cleanName(person.name)}`} value={null}
        options={data.suppliers.map((f) => ({ value: f.entityId, label: cleanName(f.name),
          detail: [f.cui ? `CUI ${f.cui}` : null, countyDisplay(f.county) ?? f.county, f.role].filter(Boolean).join(" · ") }))}
        {...(others > 0 ? { rest: [{ label: `${countWords(others, "firmă", "firme")} fără achiziții publice în datele noastre` }] } : {})}
        onChange={(value, source) => { if (source !== "activate") return; const f = data.suppliers.find((s) => s.entityId === value); if (f) onPick({ id: f.entityId, name: f.name }); }} />
      : <p className="qb-search-status" role="status">{data.firms ? `${countWords(data.firms, "firmă", "firme")}, niciuna cu achiziții publice în datele noastre.` : "Nicio firmă reprezentată azi (fără mandatele de insolvență)."}</p>)}
  </div>;
}
