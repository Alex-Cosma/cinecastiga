import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminSession, allAccounts } from "@/lib/admin/accounts";
import { ACCOUNT_COLUMNS, ACCOUNT_READERS, type AccountRow } from "@/lib/admin/table-columns";
import { readFilters } from "@/lib/table-filters/codec";
import { filterRows } from "@/lib/table-filters/memory";
import { UrlFilterBand, UrlFunnel } from "@/components/table-filters/UrlFilters";
import AccountActions from "./AccountActions";
import { date } from "../model";
import AccountDraftGuard from "./AccountDraftGuard";
import CreateAccount from "./CreateAccount";
import { Flash, Outcome } from "./controls";
import { counted, errorOf, successText } from "./messages";

const PAGE_SIZE = 10;

/**
 * Conturi, the second half of Oameni (owner, 7 November 2026): the accounts with their column funnels (owner,
 * 4 November 2026, over every account read once, lib/admin/accounts.ts), the new-account form and each row's commands.
 * A command's outcome arrives as ?ok= / ?err= (../actions.ts, ./messages.ts).
 */
export default async function Accounts({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const h = await headers();
  const session = await adminSession(h);
  if (!session) redirect("/login");
  const sp = await searchParams;
  const page = Math.min(100000, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  // New on every server render: the client parts close a finished command and show a repeated outcome again.
  const rev = crypto.randomUUID();
  const ok = successText(sp.ok);
  const error = errorOf(sp.err);

  const filters = readFilters(ACCOUNT_COLUMNS, (key) => sp[key]);
  const everyone = await allAccounts(h);
  const shown = filterRows(ACCOUNT_READERS, everyone, filters);
  const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = Object.keys(filters).length > 0;
  // A page link keeps the funnels' filters (never a one-off outcome).
  const pageHref = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] !== undefined && !["ok", "err", "la"].includes(e[0])));
    q.set("page", String(p));
    return `/admin/oameni?${q.toString()}#conturi-lista`;
  };
  if (page > 1 && (page - 1) * PAGE_SIZE >= shown.length) {
    redirect(pageHref(Math.max(1, Math.ceil(shown.length / PAGE_SIZE))).replace("#conturi-lista", ""));
  }
  const total = counted(everyone.length, "cont", "conturi", "niciun cont");
  // Where the focus goes after a command (the page is mounted anew by the redirect).
  const row = sp.la && rows.some((u) => u.id === sp.la) ? sp.la : null;
  const focus = !ok && !error ? null
    : sp.ok === "creat" ? ".people-create > summary"
      : error?.at === "create" ? "#cont-nou-email"
        : row ? `[data-account="${row.replace(/[^\w-]/g, "")}"] :is(summary, button)`
          : "#conturi-lista";

  return (
    <AccountDraftGuard>
      <section className="people-section people-accounts" aria-labelledby="conturi-lista">
        <div className="people-heading">
          <h2 id="conturi-lista" tabIndex={-1}>Conturi</h2>
          <span className="subtle">{filtered ? `${shown.length.toLocaleString("ro-RO")} din ${total}` : total}</span>
        </div>
        <p className="section-description">Fiecare intrare cere parola și un cod primit pe email.</p>
        <Flash text={ok} rev={rev} />
        <CreateAccount error={error?.at === "create" ? error.text : null} created={sp.ok === "creat"} rev={rev} />
        <div className="people-alert-slot">
          {error?.at === "list" && <p key={rev} className="people-alert" role="alert">{error.text}</p>}
        </div>
        <UrlFilterBand table="conturi" />
        <table className="people-table">
          <thead>
            <tr>
              <th scope="col"><UrlFunnel table="conturi" column="cont" label="Email" /></th>
              <th scope="col"><UrlFunnel table="conturi" column="rol" label="Rol" /></th>
              <th scope="col"><UrlFunnel table="conturi" column="stare" label="Stare" /></th>
              <th scope="col"><UrlFunnel table="conturi" column="creat" label="Creat" align="end" /></th>
              <th scope="col" className="people-th-actions">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u: AccountRow) => {
              const self = u.id === session.user.id;
              return (
                <tr key={u.id} className={u.banned ? "is-banned" : undefined} data-account={u.id}>
                  <th scope="row" className="people-account">
                    <span className="people-email">{u.email}</span>
                    {u.name && u.name !== u.email && <span className="people-name">{u.name}</span>}
                  </th>
                  <td data-label="Rol">{u.role === "admin" ? "Admin" : "Watchdog"}</td>
                  <td data-label="Stare">
                    <span className={u.banned ? "badge neutral" : "badge"}>{u.banned ? "Dezactivat" : "Activ"}</span>
                  </td>
                  <td data-label="Creat">
                    <time dateTime={new Date(u.createdAt).toISOString()}>
                      {date(u.createdAt)}
                    </time>
                  </td>
                  <td className="people-actions-cell">
                    {self
                      ? <p className="people-self">Contul tău · <Link href="/cont">schimbă parola din pagina contului</Link></p>
                      : <AccountActions userId={u.id} email={u.email} banned={!!u.banned} rev={rev} />}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="people-none">{filtered ? "Niciun cont nu corespunde filtrelor." : "Niciun cont."}</td>
              </tr>
            )}
          </tbody>
        </table>
        {shown.length > PAGE_SIZE && (
          <nav className="queue-pagination" aria-label="Paginile conturilor">
            <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, shown.length)} din {shown.length}</span>
            {page > 1 && <Link className="button" href={pageHref(page - 1)}>Înapoi</Link>}
            {page * PAGE_SIZE < shown.length && <Link className="button" href={pageHref(page + 1)}>Următoarele</Link>}
          </nav>
        )}
        <Outcome rev={rev} focus={focus} />
      </section>
    </AccountDraftGuard>
  );
}
