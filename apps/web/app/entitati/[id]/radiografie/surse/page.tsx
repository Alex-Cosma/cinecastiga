import Link from "next/link";
import { createDb } from "@seap/db";
import { readRadiografieEvidence } from "@/lib/radiografie-evidence";
import SourceEvidenceView from "@/components/SourceEvidenceView";

export const dynamic = "force-dynamic";
export default async function RadiografieSources({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tip?: string; furnizor?: string; tipar?: string; fingerprint?:string; p?: string }>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const selection = search.tip === "slicing" ? { type: "slicing", supplierId: search.furnizor } : { type: "pattern", patternId: search.tipar, ...(search.fingerprint?{expectedFingerprint:search.fingerprint}:{}) };
  const { sql } = createDb();
  const evidence = await sql.begin("isolation level repeatable read read only", async tx => {
    await tx`set local statement_timeout = '30s'`;
    return readRadiografieEvidence(tx as unknown as typeof sql, id, selection);
  }).finally(() => sql.end());
  if(!evidence)return <><Link href={`/entitati/${id}/radiografie`} className="back">← Înapoi la Radiografie</Link><h1 className="page-title">Tiparul nu mai corespunde selecției</h1><p>Datele au fost recalculate sau sursele nu mai sunt disponibile. Deschide Radiografia actuală pentru a alege și verifica un tipar nou.</p></>;
  const binding=evidence.context.sourceBinding as {fingerprint?:string}|undefined;
  const boundSelection=selection.type==="pattern"?{...selection,expectedFingerprint:binding?.fingerprint}:selection;
  const query = new URLSearchParams(search.tip === "slicing" ? { tip: "slicing", furnizor: search.furnizor ?? "" } : { tip: "pattern", tipar: search.tipar ?? "" });
  if(binding?.fingerprint)query.set("fingerprint",binding.fingerprint);
  return <><Link href={`/entitati/${id}/radiografie`} className="back">← Înapoi la Radiografie</Link><h1 className="page-title">Datele din spatele tiparului</h1>
    <SourceEvidenceView evidence={evidence} href={`/entitati/${id}/radiografie/surse?${query}`} page={Number(search.p ?? 0)} kind="radiografie" refId={id} spec={boundSelection} /></>;
}
