import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countWords } from "../lib/ask/answer-text";

/*
 * Home page figures (owner, 1 November 2026): one unit for «înregistrări» (the
 * strip's total counts both streams, as the map readout does per county), the
 * Romanian «de» on every count, the caveat opened from the strip and shown once,
 * and phone text no smaller than 12px (all-caps eyebrows 11px).
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("./page.tsx");
const map = read("./DiscoveryMap.tsx");
const guide = read("./guide.css");

/** `{formatInt(n)} înregistrări`, `${n} contracte`: a count written next to its noun without countWords. */
const HAND_COUNT = /(\$\{[^{}]*\}|\{[^{}]*\})\s+(?:de\s+)?(înregistrări|contracte|achiziții|instituții|firme)(?![\wăâîșț])/g;

describe("home counts", () => {
  it("take «de» from 20 up, as Întreabă writes them", () => {
    expect(countWords(21_244_587, "înregistrare", "înregistrări")).toBe("21.244.587 de înregistrări");
    expect(countWords(1_146_439, "înregistrare", "înregistrări")).toBe("1.146.439 de înregistrări");
    expect(countWords(95, "contract", "contracte")).toBe("95 de contracte");
    expect(countWords(14, "înregistrare", "înregistrări")).toBe("14 înregistrări");
  });

  it("go through countWords on the page and the map (readout and county names)", () => {
    const hand = [page, map].flatMap((text) => [...text.matchAll(HAND_COUNT)].filter((m) => !m[1]!.includes("countWords")).map((m) => m[0]));
    expect(hand).toEqual([]);
    expect(map.match(/countWords\(\w+\.count, "înregistrare", "înregistrări"\)/g)).toHaveLength(2);
  });

  it("label the strip with every record in both streams, the unit the map counts", () => {
    expect(page).toContain("const records = headline.directRecords + headline.contractRecords;");
    expect(page).toContain('<small>{countWords(records, "înregistrare", "înregistrări")} · {coverage}</small>');
    expect(page).not.toContain("Înregistrări din");
    // The contract item keeps its deliberate label: a consortium is one row per winner.
    expect(page).toContain(">înregistrări contract–furnizor</Term>");
  });
});

describe("what the figures include", () => {
  it("opens from the strip, once on the page", () => {
    const strip = page.slice(page.indexOf('<section className="d-national-strip"'), page.indexOf("</section>", page.indexOf('<section className="d-national-strip"')));
    expect(strip).toContain('<CoverageDisclosure summary={<>Ce include? <span aria-hidden="true">›</span></>}>');
    expect(page.match(/<CoverageDisclosure/g)).toHaveLength(1);
    expect(read("../components/CoverageDisclosure.tsx")).toContain('<summary>{summary ?? (spec ? "Datele și calculul" : "Ce date includ aceste cifre?")}</summary>');
  });

  it("is a one-line trigger under the strip items, its chevron outside the underline", () => {
    expect(guide).toContain(".d-national-strip>.coverage-disclosure{grid-column:1/-1;");
    expect(guide).toContain(".d-national-strip>.coverage-disclosure>summary::-webkit-details-marker{display:none}");
    expect(guide).toContain(".d-national-strip>.coverage-disclosure>summary>span{display:inline-block;");
    // The details is now the strip's last child: the third item is found by type.
    expect(guide).not.toMatch(/\.d-national-item:last-child/);
  });
});

describe("phone text sizes", () => {
  const phone = guide.slice(guide.indexOf("/* ---- Readable microcopy at every width"), guide.indexOf("@media(min-width:901px){.hdr-right"));

  it("apply the readable floor at every width, phones included", () => {
    expect(guide).not.toContain("Phones keep their tuned sizes");
    expect(phone).not.toContain("@media(min-width:701px)");
    expect(phone).toContain(".discovery-page .d-hero-eyebrow{font-size:11px!important}");
    expect(phone).toContain(".discovery-page .eyebrow,.d-map-head .eyebrow,.d-question-top,.d-dialog-head .eyebrow{font-size:11px}");
    expect(phone).toContain(".hdr-right .user-nav{font-size:12px}");
    expect(phone).toContain(".site-footer .wrap{font-size:13px}");
  });

  it("give the strip labels and the map readout 13px, the search field 16px on phones", () => {
    const small = phone.slice(phone.indexOf("@media(max-width:700px){"));
    expect(small).toContain(".discovery-page .d-map-current{font-size:13px!important}");
    expect(small).toContain(".d-national-item>small{font-size:13px}");
    expect(small).toContain(".d-map-legend{font-size:12px}");
    expect(small).toContain(".d-search input{font-size:16px;");
    expect(guide).toContain('@media(max-width:380px){.hdr-right .user-nav a[href="/login"]:after{font-size:12px}}');
  });

  it("read the map legend and readout in ink2 on the mint card", () => {
    expect(phone).toContain(".d-map-legend,.discovery-page .d-map-current{color:var(--ink2)}");
  });
});
