import Link from "next/link";
import { searchEntities } from "@/lib/search";
import { formatRon } from "@/lib/format";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  supplier: "furnizor",
  authority: "autoritate",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rol?: string }>;
}) {
  const { q, rol } = await searchParams;
  const query = (q ?? "").trim();
  const role = rol === "furnizor" ? "supplier" : rol === "autoritate" ? "authority" : undefined;
  const result = query
    ? await searchEntities(query, { limit: 40, ...(role ? { role } : {}) })
    : { hits: [], total: 0 };

  const roleHref = (r: string) => {
    const p = new URLSearchParams({ q: query });
    if (r) p.set("rol", r);
    return `/cauta?${p.toString()}`;
  };

  return (
    <>
      <h1 className="page-title">Căutare entități</h1>

      <form className="search-form" action="/cauta" method="get">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Nume firmă, autoritate sau CUI…"
          autoFocus
          className="search-input"
        />
        {role ? <input type="hidden" name="rol" value={rol} /> : null}
        <button type="submit" className="search-btn">
          Caută
        </button>
      </form>

      {query ? (
        <>
          <div className="filters">
            <Link href={roleHref("")} className={!role ? "on" : ""}>
              Toate
            </Link>
            <Link href={roleHref("furnizor")} className={role === "supplier" ? "on" : ""}>
              Furnizori
            </Link>
            <Link href={roleHref("autoritate")} className={role === "authority" ? "on" : ""}>
              Autorități
            </Link>
          </div>

          <p className="page-sub">
            {result.total > 0
              ? `~${result.total} rezultate pentru „${query}”`
              : `Niciun rezultat pentru „${query}”`}
          </p>

          <table className="rank">
            <thead>
              <tr>
                <th>Entitate</th>
                <th>CUI</th>
                <th>Rol</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {result.hits.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link href={`/entitati/${h.id}`}>{h.name}</Link>
                    {h.county ? <div className="county">{h.county}</div> : null}
                  </td>
                  <td>{h.cui ?? "—"}</td>
                  <td className="county">{h.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}</td>
                  <td className="num">{formatRon(h.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="page-sub">Caută printre cele peste 180.000 de entități din SICAP.</p>
      )}
    </>
  );
}
