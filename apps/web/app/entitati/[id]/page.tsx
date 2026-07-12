import Link from "next/link";
import { notFound } from "next/navigation";
import { getEntityProfile, type EntityRole } from "@/lib/marts";
import { formatRonFull } from "@/lib/format";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<EntityRole["role"], string> = {
  supplier: "Furnizor",
  authority: "Autoritate contractantă",
};

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getEntityProfile(id);
  if (!profile) notFound();

  return (
    <>
      <Link href="/" className="back">
        ← Înapoi
      </Link>
      <div className="profile-head">
        <h1>{profile.name ?? "(fără nume)"}</h1>
        <div>
          {profile.roles.map((r) => (
            <span className="badge" key={r.role}>
              {ROLE_LABEL[r.role]}
            </span>
          ))}
          {profile.county ? <span className="note">{profile.county}</span> : null}
        </div>
      </div>

      {profile.roles.map((r) => (
        <div className="role-card" key={r.role}>
          <h3>{ROLE_LABEL[r.role]}</h3>
          <div className="kv">
            <div>
              <div className="k">Total contractat (integral)</div>
              <div className="v">{formatRonFull(r.totalRonFull)}</div>
            </div>
            <div>
              <div className="k">
                {r.role === "supplier" ? "Total (împărțit pe consorții)" : "Clasament"}
              </div>
              <div className="v">
                {r.role === "supplier"
                  ? formatRonFull(r.totalRonSplit)
                  : r.rank
                    ? `#${r.rank}`
                    : "—"}
              </div>
            </div>
          </div>
          {r.role === "supplier" && r.rank ? (
            <p className="note" style={{ marginTop: 12 }}>
              Poziția #{r.rank} în clasamentul furnizorilor.
            </p>
          ) : null}
        </div>
      ))}

      <p className="note">
        Instantaneu 2020. Contorizarea contractelor și partenerii de tranzacție vor fi
        disponibili după procesarea completă a datelor de detaliu.
      </p>
    </>
  );
}
