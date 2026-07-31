import Link from "next/link";
import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import { listInvestigations } from "@/lib/anchete";
import { createAncheta } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  activa: "activă",
  publicata: "publicată",
  inchisa: "închisă",
};

export default async function AnchetePage() {
  const uid = await sessionUserId();
  if (!uid) redirect("/login");
  const list = await listInvestigations(uid);

  return (
    <>
      <h1 className="page-title">Anchetele mele</h1>
      <p className="page-sub">
        Dosare private de investigație: strânge entități, contracte, interogări și note —
        fiecare probă cu instantaneul și sursa ei.
      </p>

      <section className="section">
        <h2>Anchetă nouă</h2>
        <form className="auth-form auth-form-row" action={createAncheta}>
          <label>
            Titlu
            <input type="text" name="title" required maxLength={200} placeholder="ex.: Lemne de foc Topalu" />
          </label>
          <label>
            Descriere
            <input type="text" name="description" placeholder="(opțional)" />
          </label>
          <button type="submit">Creează</button>
        </form>
      </section>

      <section className="section">
        <h2>Dosare ({list.length})</h2>
        {list.length === 0 ? (
          <p className="hint">
            Nimic încă. Creează o anchetă, apoi folosește butonul „Adaugă la anchetă" de pe
            paginile de entități, contracte și rezultate de căutare.
          </p>
        ) : (
          <table className="rank">
            <thead>
              <tr>
                <th>Anchetă</th>
                <th>Status</th>
                <th className="num" style={{ textAlign: "right" }}>Probe</th>
                <th>Actualizată</th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <Link href={`/anchete/${inv.id}`}>{inv.title}</Link>
                    {inv.description && <div className="county">{inv.description}</div>}
                  </td>
                  <td>{STATUS_LABEL[inv.status] ?? inv.status}</td>
                  <td className="num">{inv.nClips}</td>
                  <td className="county">
                    {new Date(inv.updatedAt).toLocaleDateString("ro-RO")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
