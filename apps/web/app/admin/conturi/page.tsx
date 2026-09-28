import Link from 'next/link';
import AccountDraftGuard from './AccountDraftGuard';
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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
  searchParams: Promise<{ err?: string; page?: string }>;
}) {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session || (session.user as { role?: string }).role !== "admin") {
    redirect("/login");
  }
  const { err, page: pageText } = await searchParams;
  const page = Math.min(100000, Math.max(1, Number.parseInt(pageText ?? '1', 10) || 1));

  const res = (await auth.api.listUsers({
    query: { limit: 10, offset: (page-1)*10, sortBy: "createdAt", sortDirection: "desc" },
    headers: h,
  })) as { users: AdminUser[]; total: number };

  if(page>1&&(page-1)*10>=res.total)redirect(`/admin/conturi?page=${Math.max(1,Math.ceil(res.total/10))}`);
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
        <h2>Conturi ({res.total})</h2>
        <div className="admin-tablewrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Nume</th>
                <th>Rol</th>
                <th>Stare</th>
                <th>Creat</th>
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
      <nav className="queue-pagination" aria-label="Paginile conturilor"><span>{res.total ? `${Math.min((page-1)*10+1,res.total)}–${Math.min(page*10,res.total)} din ${res.total}` : 'Niciun cont'}</span>{page>1&&<Link className="button" href={`/admin/conturi?page=${page-1}`}>Înapoi</Link>}{page*10<res.total&&<Link className="button" href={`/admin/conturi?page=${page+1}`}>Următoarele</Link>}</nav>
    </AccountDraftGuard>
  );
}
