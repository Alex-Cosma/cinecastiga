import Link from "next/link";
import { getHeadline, getFlagInstanceCount, getRiskLeaderboard } from "@/lib/marts";
import { FLAG_META, criBand } from "@/lib/flags";
import { formatRon, formatInt, cleanName } from "@/lib/format";
import AskPanel from "./intreaba/AskPanel";

// Data comes from the batch-built marts and changes only on rebuild; render at
// request time (cache via CDN headers) rather than prerendering at build.
export const dynamic = "force-dynamic";

const TILES = [
  { href: "/semnale", glyph: "⚑", title: "Semnale de risc", hint: "13 indicatori pe achiziții directe, contracte, bilanț și ONRC" },
  { href: "/harta", glyph: "▧", title: "Hartă pe județe", hint: "cheltuială pe autorități sau pe furnizori" },
  { href: "/domenii", glyph: "◫", title: "Domenii CPV", hint: "unde se duc banii, pe categorii" },
  { href: "/supra-prag", glyph: "◎", title: "Supra-prag (TED)", hint: "atribuiri mari, firme străine, ofertant unic" },
];

export default async function HomePage() {
  const [headline, flagCount, top] = await Promise.all([
    getHeadline(),
    getFlagInstanceCount(),
    getRiskLeaderboard("authority", 4),
  ]);

  return (
    <div className="home-page">
      <div className="home-hero">
        <p className="eyebrow">achiziții publice · România · 2018–2026</p>
        <h1 className="home-q">
          Cine <em>câștigă</em> banii publici — și cum?
        </h1>
        <p>
          Caută orice primărie, consiliu județean, spital sau firmă. Vezi contractele, partenerii și semnalele de risc,
          cu dovada la un click distanță.
        </p>
        <AskPanel withSearch initialMode="search" />
      </div>

      <div className="stat-strip" data-reveal="1">
        <div className="sstat">
          <div className="v num">{formatInt(headline.suppliers)}</div>
          <div className="l">furnizori</div>
        </div>
        <div className="sstat">
          <div className="v num">{formatInt(headline.authorities)}</div>
          <div className="l">autorități contractante</div>
        </div>
        <div className="sstat">
          <div className="v num">{formatRon(headline.totalSpend)}</div>
          <div className="l">
            contractați <span className="era">2018–2026</span>
          </div>
        </div>
        <div className="sstat">
          <div className="v num">{formatInt(flagCount)}</div>
          <div className="l">semnale de risc</div>
        </div>
      </div>

      <div className="home-lead" data-reveal="2">
        <div className="card pad lead-card">
          <div className="lead-head">
            <h3>Autorități cu cele mai multe semnale</h3>
            <Link href="/semnale">toate semnalele →</Link>
          </div>
          {top.map((e) => {
            const band = criBand(e.cri);
            return (
              <div className="lead-row" key={e.entityId}>
                <div>
                  <Link href={`/entitati/${e.entityId}`}>{cleanName(e.name)}</Link>
                  <small>
                    {e.county ? `${e.county} · ` : ""}
                    {e.flags.map((f) => FLAG_META[f]?.title.toLowerCase() ?? f).join(", ")}
                  </small>
                </div>
                <span className={`cri-pill ${band.className}`}>{e.cri.toFixed(2).replace(".", ",")}</span>
              </div>
            );
          })}
          <p className="note">
            Indice compus de risc: ponderea semnalelor declanșate. Semnal, nu dovadă —{" "}
            <Link href="/metodologie">metodologie</Link>.
          </p>
        </div>
        <div className="tiles">
          {TILES.map((t) => (
            <Link key={t.href} href={t.href} className="tile card lift">
              <span className="g" aria-hidden>
                {t.glyph}
              </span>
              <b>{t.title}</b>
              <span>{t.hint}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
