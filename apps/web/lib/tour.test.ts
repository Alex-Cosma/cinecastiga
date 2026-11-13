import { describe, expect, it } from "vitest";
import { TOUR_DOTS, TOUR_SEEN_SHARE, TOUR_TOPICS, contractDots, guessContractDots, guessVerdict, readFigures, splitLine, tourEntry, tourPercent, tourPlace, tourQuery, tourQueryAlternatives, tourRestHidden } from "./tour";

const roads = TOUR_TOPICS.find((topic) => topic.key === "drumuri")!;

describe("the welcome tour (owner, 12 November 2026)", () => {
  it("opens on the home page at a first visit and invites on any other page", () => {
    const first = { forced: false, seen: false, signedIn: false, automated: false };
    expect(tourEntry({ ...first, pathname: "/" })).toBe("tour");
    expect(tourEntry({ ...first, pathname: "/entitati/123" })).toBe("invite");
    expect(tourEntry({ ...first, pathname: "/semnale" })).toBe("invite");
  });

  it("stays away once seen, for a signed-in visitor, for an automated browser and on quiet pages", () => {
    const first = { pathname: "/", forced: false, seen: false, signedIn: false, automated: false };
    expect(tourEntry({ ...first, seen: true })).toBe("none");
    expect(tourEntry({ ...first, signedIn: true })).toBe("none");
    expect(tourEntry({ ...first, automated: true })).toBe("none");
    for (const pathname of ["/login", "/admin/trafic", "/cont", "/anchete/7", "/urmariri", "/l/abcd1234"]) expect(tourEntry({ ...first, pathname })).toBe("none");
    // „/login” is quiet, a page that only starts with the same letters is not
    expect(tourEntry({ ...first, pathname: "/licitatii" })).toBe("invite");
  });

  it("opens again from the footer's link, whoever asks", () => {
    expect(tourEntry({ pathname: "/", forced: true, seen: true, signedIn: true, automated: false })).toBe("tour");
  });

  it("reads a county's figures: totals and the direct awards' share by count and by value", () => {
    const reading = readFigures([2281, 162_497_751, 753, 4_294_123_348, 312])!;
    expect(reading.count).toBe(3034);
    expect(reading.value).toBe(4_456_621_099);
    expect(reading.authorities).toBe(312);
    expect(tourPercent(reading.shareByCount)).toBe("75%");
    expect(tourPercent(reading.shareByValue)).toBe("4%");
    expect(splitLine(reading)).toBe("Cele mai multe achiziții sunt directe, dar cei mai mulți bani trec prin licitații.");
  });

  it("has nothing to say about a county and subject without acquisitions", () => {
    expect(readFigures(undefined)).toBeNull();
    expect(readFigures([0, 0, 0, 0, 0])).toBeNull();
  });

  it("never rounds a small share to nothing or a large one to everything", () => {
    expect(tourPercent(0.004)).toBe("sub 1%");
    expect(tourPercent(0.996)).toBe("peste 99%");
    expect(tourPercent(0)).toBe("0%");
    expect(tourPercent(1)).toBe("100%");
  });

  it("keeps both kinds of dots visible at any share", () => {
    expect(contractDots(0.75)).toBe(50);
    expect(contractDots(1)).toBe(1);
    expect(contractDots(0)).toBe(TOUR_DOTS - 1);
  });

  it("shows the visitor's own guess on the dots, from none direct to all direct", () => {
    expect(guessContractDots(30)).toBe(140);
    expect(guessContractDots(50)).toBe(100);
    expect(guessContractDots(0)).toBe(TOUR_DOTS);
    expect(guessContractDots(100)).toBe(0);
  });

  it("tells the visitor how close the guess was", () => {
    expect(guessVerdict(73, 0.75)).toBe("Ai spus 73 din 100. Aproape exact: 75% sunt directe.");
    expect(guessVerdict(60, 0.75)).toBe("Ai spus 60 din 100. Pe aproape: 75% sunt directe.");
    expect(guessVerdict(30, 0.75)).toBe("Ai spus 30 din 100. Sunt mai multe: 75% sunt directe.");
    expect(guessVerdict(90, 0.4)).toBe("Ai spus 90 din 100. Sunt mai puține: 40% sunt directe.");
  });

  it("on a narrow screen shows the rest of a step before going on (owner, 13 November 2026)", () => {
    // a step of 1,000 px in a screen of 700: 300 px to scroll
    expect(tourRestHidden(0, 1000, 700)).toBe(true);
    expect(tourRestHidden(284, 1000, 700)).toBe(true);
    // 95% of the way down is enough, and so is the bounce past the end
    expect(tourRestHidden(285, 1000, 700)).toBe(false);
    expect(tourRestHidden(300, 1000, 700)).toBe(false);
    expect(tourRestHidden(312, 1000, 700)).toBe(false);
    // a step that fits, or overflows only by its bottom padding, hides nothing
    expect(tourRestHidden(0, 700, 700)).toBe(false);
    expect(tourRestHidden(0, 724, 700)).toBe(false);
    expect(tourRestHidden(0, 725, 700)).toBe(true);
    expect(TOUR_SEEN_SHARE).toBe(0.95);
  });

  it("names the place as people do", () => {
    expect(tourPlace("cluj", "Cluj")).toBe("județul Cluj");
    expect(tourPlace("bucuresti", "București")).toBe("București");
  });

  it("leaves a question the search understands, and offers two other ways to ask", () => {
    expect(tourQuery(roads, "Cluj")).toBe("cine câștigă cei mai mulți bani din drumuri în Cluj");
    expect(tourQueryAlternatives(roads, "Cluj", 2025)).toEqual(["drumuri în Cluj în 2025", "drumuri peste 1 milion de lei"]);
  });

  it("gives every subject its own divisions", () => {
    const all = TOUR_TOPICS.flatMap((topic) => topic.cpv2);
    expect(new Set(all).size).toBe(all.length);
    expect(TOUR_TOPICS).toHaveLength(8);
  });
});
