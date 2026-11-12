import { describe, expect, it } from "vitest";
import { TOUR_DOTS, TOUR_TOPICS, contractDots, readFigures, splitLine, tourEntry, tourPercent, tourPlace, tourQuery, tourQueryAlternatives } from "./tour";

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
