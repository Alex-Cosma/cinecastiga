import { getHeadline, getFlagInstanceCount } from "@/lib/marts";
import { formatRon, formatInt } from "@/lib/format";
import AskPanel from "./intreaba/AskPanel";

// The former home sections (discovery cards, explore tiles, charts, top
// tables, TED callout) are parked in app/_legacy/HomeLegacy.tsx.

// Data comes from the batch-built marts and changes only on rebuild; render at
// request time (cache via CDN headers) rather than prerendering at build.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [headline, flagCount] = await Promise.all([getHeadline(), getFlagInstanceCount()]);

  return (
    <div className="home-page">
      <div className="home-hero">
        <h1>Vezi cine cheltuie banii publici — și cum</h1>
        <p>
          Caută orice autoritate sau firmă, construiește o interogare pas cu pas sau întreabă
          direct, în limbaj natural.
        </p>
        <AskPanel withSearch initialMode="search" centered />
      </div>

      <div className="home-stats">
        <div className="hstat">
          <div className="v num">{formatInt(headline.suppliers)}</div>
          <div className="l">furnizori</div>
        </div>
        <div className="hstat">
          <div className="v num">{formatInt(headline.authorities)}</div>
          <div className="l">autorități</div>
        </div>
        <div className="hstat">
          <div className="v num">{formatRon(headline.totalSpend)}</div>
          <div className="l">
            lei urmăriți <span className="era">2018–2026</span>
          </div>
        </div>
        <div className="hstat">
          <div className="v num">{formatInt(flagCount)}</div>
          <div className="l">semnale de risc</div>
        </div>
      </div>
    </div>
  );
}
