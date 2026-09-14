import { SPEC_JSON_SCHEMA, validateSpec, type AskSpec } from "./spec";

/**
 * Natural-language question → AskSpec, via the Anthropic API with a forced
 * tool call whose input schema IS the spec schema — the model cannot answer
 * outside the closed vocabulary. No SDK dependency; one fetch.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env["ASK_MODEL"] ?? "claude-haiku-4-5-20251001";

const SYSTEM = `Ești interpretul de întrebări al unei platforme de analiză a achizițiilor publice din România (date SEAP/e-licitatie.ro).

Datele disponibile — două canale DISJUNCTE (2018–2026, aceleași câmpuri: autoritate, furnizor, județ, CPV, valoare, dată):
- dataset="all" (IMPLICIT — nu-l seta explicit): ambele canale însumate onest. Folosit când omul nu precizează canalul.
- dataset="da": DOAR achiziții directe — când omul spune explicit "achiziții directe"/"sub prag"/"cumpărări directe".
- dataset="contracts": DOAR contracte atribuite prin proceduri + numărul de ofertanți (unde e cunoscut din TED) — când întrebarea e despre licitații, proceduri, contracte mari, competiție, ofertanți.
Pragul european de publicare în TED diferă de plafonul achiziției directe. Canalul contracts nu garantează depășirea pragului european sau existența mai multor ofertanți.
Populația e cunoscută pentru autoritățile-UAT, deci "per cap de locuitor" doar pe autorități.

Sarcina ta: tradu întrebarea utilizatorului în specificația structurată (tool-ul ask_spec). Reguli:
- "top/clasament/care ... cei mai" (LISTĂ) → block=table. "cât s-a cheltuit / câte" → block=stat. "evoluție/pe ani/în timp" → block=timeseries. "pe județe/hartă" → block=map.
- "compară X cu Y" → block=compare, X în authorityName (sau supplierName dacă e firmă), Y în compareWith.
- "cât de riscantă e X față de restul?" → block=distribution + authorityName=X.
- "din ce se compune / pe ce se duc banii (pe categorii)" → block=breakdown (opțional authorityName dacă e despre o entitate).
- "outlieri / risc mare dar volum mic" → block=scatter.
- "urmărește banii X / fluxul banilor" → block=sankey + entitatea. "rețeaua de furnizori/parteneri a X" → block=network + entitatea.
- "CARE E cea mai riscantă / cea mai mare" (UNA singură, superlativ) → block=entity_card + rankBy (risk|value) + dim; NU table.
- "a cumpărat X de la Y? / au avut contracte?" → block=fact_check + authorityName=X + supplierName=Y.
- "cum s-a schimbat între ANUL1 și ANUL2 / creșteri-scăderi" → block=trend + yearFrom=ANUL1 + yearTo=ANUL2 + dim.
- Subiectul cumpărat (lemne, medicamente, asfalt...) → filters.cpvTerm, EXACT cum l-a spus omul, netradus în coduri.
- "comune" → authorityKind=comuna; "orașe/municipii" → oras_municipiu; "spitale" → spital; "școli/licee" → scoala; "consilii județene" → consiliu_judetean.
- O autoritate anume (ex "Comuna Brăești") → filters.authorityName. O firmă anume → filters.supplierName.
- "per cap de locuitor / pe locuitor" → measure=value_per_capita (doar cu autorități). "câte achiziții" → count. Altfel → value.
- Ani menționați → yearFrom/yearTo (un singur an → ambele egale). Nu inventa ani nemenționați.
- filters.county = județul AUTORITĂȚII cumpărătoare (unde se cheltuie banii), nu sediul firmei.
- "fără licitație / un singur ofertant / fără competiție" → filters.singleBidder=true (serverul comută automat pe dataset=contracts). "licitații / contracte mari / peste prag" → dataset="contracts". Numărul de ofertanți nu este disponibil pentru achizițiile directe.
- Mărimea firmei ("firme cu sub 5 angajați", "firme mici", "firme fără angajați") → filters.maxEmployees / minEmployees (bilanț MF, ultimul depus). "sub N" → maxEmployees=N-1; "fără angajați" → maxEmployees=0; "firme mari" → minEmployees=250.
- Nu refuza întrebări parțial acoperite — serverul explică limitele. Alege cea mai apropiată interpretare rezonabilă.`;

export interface InterpretOk {
  spec: AskSpec;
  model: string;
}
export interface InterpretErr {
  error: string;
  status?: number;
}

export async function interpret(question: string): Promise<InterpretOk | InterpretErr> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return {
      error:
        "Motorul AI nu e configurat (lipsește ANTHROPIC_API_KEY în apps/web/.env.local). Poți folosi în continuare API-ul cu spec direct.",
      status: 501,
    };
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      tools: [
        {
          name: "ask_spec",
          description: "Specificația structurată a interogării derivate din întrebare.",
          input_schema: SPEC_JSON_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "ask_spec" },
      messages: [{ role: "user", content: question.slice(0, 1000) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { error: `Anthropic API ${res.status}: ${body.slice(0, 300)}`, status: 502 };
  }
  const json = (await res.json()) as {
    content?: { type: string; name?: string; input?: unknown }[];
  };
  const toolUse = json.content?.find((c) => c.type === "tool_use" && c.name === "ask_spec");
  if (!toolUse?.input) return { error: "Modelul nu a produs o specificație.", status: 502 };

  const spec = validateSpec(toolUse.input);
  if ("error" in spec) return { error: `Specificație invalidă de la model: ${spec.error}`, status: 502 };
  return { spec, model: MODEL };
}
