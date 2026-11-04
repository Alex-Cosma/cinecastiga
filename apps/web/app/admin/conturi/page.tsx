import Link from 'next/link';
import AccountDraftGuard from './AccountDraftGuard';
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminSession, allAccounts } from "@/lib/admin/accounts";
import { ACCOUNT_COLUMNS, ACCOUNT_READERS } from "@/lib/admin/table-columns";
import { readFilters } from "@/lib/table-filters/codec";
import { filterRows } from "@/lib/table-filters/memory";
import { UrlFilterBand, UrlFunnel } from "@/components/table-filters/UrlFilters";
import { createWatchdog, revokeSessions, setUserPassword, toggleBan } from "../actions";

export const dynamic = "force-dynamic";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  banned?: boolean | null;
  twoFactorEnabled?: boolean | null;
  createdAt: Date | string;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const h = await headers();
  const session = await adminSession(h);
  if (!session) redirect("/login");
  const sp = await searchParams;
  const { err, page: pageText } = sp;
  const page = Math.min(100000, Math.max(1, Number.parseInt(pageText ?? '1', 10) || 1));

  // The table's column funnels (owner, 4 November 2026), over every account read once (lib/admin/accounts.ts).
  const filters = readFilters(ACCOUNT_COLUMNS, (key) => sp[key]);
  const everyone = (await allAccounts(h)) as AdminUser[];
  const shown = filterRows(ACCOUNT_READERS, everyone, filters);
  const res = { users: shown.slice((page - 1) * 10, page * 10), total: shown.length };
  const filtered = Object.keys(filters).length > 0;
  // A page link keeps the funnels' filters (never a one-off error message).
  const pageHref = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== "err"));
    q.set("page", String(p));
    return `/admin/conturi?${q.toString()}#conturi-lista`;
  };

  if(page>1&&(page-1)*10>=res.total){
    redirect(pageHref(Math.max(1, Math.ceil(res.total / 10))).replace("#conturi-lista", ""));
  }
  return (
    <AccountDraftGuard>

      <h2 className="page-title">Conturi și acces</h2>
      <p className="page-sub">
        Conturi watchdog — creare, dezactivare, resetare parolă. Toate conturile se
        autentifică obligatoriu cu cod pe email.
      </p>

      {err && <p className="auth-err">{err}</p>}

      <details className="section account-create">
        <summary>Adaugă un cont watchdog</summary>
        <form className="auth-form auth-form-row" action={createWatchdog}>
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <label>
            Nume
            <input type="text" name="name" placeholder="(opțional)" />
          </label>
          <label>
            Parolă inițială
            <input type="text" name="password" minLength={10} required />
          </label>
          <button type="submit">Creează watchdog</button>
        </form>
        <p className="hint">
          Trimite-i emailul și parola inițială pe alt canal; îi recomandăm să o schimbe
          din pagina de cont după prima autentificare.
        </p>
      </details>

      <section className="section">
        <h2 id="conturi-lista" className="list-anchor">Conturi ({filtered ? `${res.total} din ${everyone.length}` : res.total})</h2>
        <UrlFilterBand table="conturi" />
        <div className="admin-tablewrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th><UrlFunnel table="conturi" column="cont" label="Email" /></th>
                <th>Nume</th>
                <th><UrlFunnel table="conturi" column="rol" label="Rol" /></th>
                <th><UrlFunnel table="conturi" column="stare" label="Stare" /></th>
                <th><UrlFunnel table="conturi" column="creat" label="Creat" /></th>
                <th>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {res.users.map((u) => (
                <tr key={u.id} className={u.banned ? "is-banned" : undefined}>
                  <td data-label="Email">{u.email}</td>
                  <td data-label="Nume">{u.name}</td>
                  <td data-label="Rol">{u.role ?? "watchdog"}</td>
                  <td data-label="Stare">{u.banned ? "dezactivat" : "activ"}</td>
                  <td data-label="Creat">{new Date(u.createdAt).toLocaleDateString("ro-RO")}</td>
                  <td className="admin-actions" data-label="Acțiuni">
                    {u.id === session.user.id ? (
                      <a href="/cont">contul tău — parola se schimbă aici →</a>
                    ) : (
                      <>
                        <form action={toggleBan}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="banned" value={String(!!u.banned)} />
                          <button type="submit">
                            {u.banned ? "reactivează" : "dezactivează"}
                          </button>
                        </form>
                        <form action={revokeSessions}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit">deconectează</button>
                        </form>
                        <details>
                          <summary>parolă nouă</summary>
                          <form action={setUserPassword}>
                            <input type="hidden" name="userId" value={u.id} />
                            <input
                              type="text"
                              name="newPassword"
                              minLength={10}
                              placeholder="minim 10 caractere"
                              required
                            />
                            <button type="submit">setează</button>
                          </form>
                        </details>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <nav className="queue-pagination" aria-label="Paginile conturilor"><span>{res.total ? `${Math.min((page-1)*10+1,res.total)}–${Math.min(page*10,res.total)} din ${res.total}` : 'Niciun cont'}</span>{page>1&&<Link className="button" href={pageHref(page-1)}>Înapoi</Link>}{page*10<res.total&&<Link className="button" href={pageHref(page+1)}>Următoarele</Link>}</nav>
    </AccountDraftGuard>
  );
}
