import Link from "next/link";
import { notFound } from "next/navigation";
import { getEntityProfile, getEntityFlags, type EntityRole } from "@/lib/marts";
import { formatRonFull } from "@/lib/format";
import { FLAG_META, criBand } from "@/lib/flags";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<EntityRole["role"], string> = {
  supplier: "Furnizor",
  authority: "Autoritate contractantă",
};

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [profile, entityFlags] = await Promise.all([getEntityProfile(id), getEntityFlags(id)]);
  // entity_profile (2020 aggregates) may miss DA-only participants that entity_flags
  // has — render from whichever exists.
  if (!profile && entityFlags.length === 0) notFound();

  const name = profile?.name ?? entityFlags[0]?.name ?? "(fără nume)";
  const county = profile?.county ?? entityFlags[0]?.county ?? null;
  const roles = profile?.roles ?? [];
  // Roles present only in the DA-flag data (not in entity_profile).
  const extraRoles = entityFlags.filter((ef) => !roles.some((r) => r.role === ef.role));

  return (
    <>
      <Link href="/" className="back">
        ← Înapoi
      </Link>
      <div className="profile-head">
        <h1>{name}</h1>
        <div>
          {(roles.length > 0 ? roles.map((r) => r.role) : entityFlags.map((e) => e.role)).map(
            (role) => (
              <span className="badge" key={role}>
                {ROLE_LABEL[role]}
              </span>
            ),
          )}
          {county ? <span className="note">{county}</span> : null}
        </div>
      </div>

      {entityFlags.length > 0 ? (
        <div className="flags-panel">
          {entityFlags.map((ef) => {
            const band = criBand(ef.cri);
            return (
              <div className="flags-role" key={ef.role}>
                <div className="flags-role-head">
                  <span className={`cri-pill ${band.className}`}>CRI {ef.cri.toFixed(2)}</span>
                  <span className="note">
                    ca {ROLE_LABEL[ef.role].toLowerCase()} · risc {band.label.toLowerCase()} ·{" "}
                    {ef.nDas} achiziții directe
                  </span>
                </div>
                <div className="flag-badges">
                  {ef.flags.map((f) => (
                    <span className="flag-badge" key={f} title={FLAG_META[f]?.short}>
                      {FLAG_META[f]?.title ?? f}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="note">
            Semnale de risc — indicii, nu dovezi. Vezi{" "}
            <Link href="/metodologie">metodologia</Link>.
          </p>
        </div>
      ) : null}

      {roles.map((r) => (
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

      {extraRoles.map((ef) => (
        <div className="role-card" key={ef.role}>
          <h3>{ROLE_LABEL[ef.role]}</h3>
          <div className="kv">
            <div>
              <div className="k">Achiziții directe</div>
              <div className="v">{ef.nDas.toLocaleString("ro-RO")}</div>
            </div>
            <div>
              <div className="k">Valoare achiziții directe</div>
              <div className="v">{formatRonFull(ef.totalRon)}</div>
            </div>
          </div>
        </div>
      ))}

      <p className="note">
        Instantaneu 2020. Valorile reflectă achiziții directe și contracte atribuite.
      </p>
    </>
  );
}
