import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { navItems, type NavContext } from "./site-nav";
import { countyBreakdownHref, countyBreakdownSpec } from "./discovery-links";
import { decodeSpec } from "./ask/permalink";
import { validateSpec } from "./ask/spec";

const base: NavContext = { pathname: "/", signedIn: false };
const labels = (ctx: Partial<NavContext>) => navItems({ ...base, ...ctx }).map(item => item.label);
const active = (pathname: string) => navItems({ ...base, signedIn: true, pathname }).filter(item => item.active).map(item => item.label);

describe("main navigation", () => {
  it("calls the question page „Întreabă” and keeps its target", () => {
    const ask = navItems(base).find(item => item.href === "/intreaba");
    expect(ask?.label).toBe("Întreabă");
    expect(labels({})).not.toContain("Explorează");
  });

  it("hides the private investigations item and its dot from anonymous visitors", () => {
    expect(labels({})).toEqual(["Descoperă", "Întreabă", "Hartă", "Ghid"]);
    const signedIn = navItems({ ...base, signedIn: true });
    expect(signedIn.map(item => item.label)).toEqual(["Descoperă", "Întreabă", "Hartă", "Anchete", "Ghid"]);
    expect(signedIn.find(item => item.href === "/anchete")?.dot).toBe(true);
  });

  it("lists the map for everyone, in the place of the removed stories (owner, 6 November 2026)", () => {
    const map = navItems(base).find(item => item.href === "/harta");
    expect(map?.label).toBe("Hartă");
    expect(labels({})).not.toContain("Ce bate la ochi");
  });

  it("marks the section a page belongs to, in agreement with the „Descoperă / Caută” breadcrumb", () => {
    expect(active("/")).toEqual(["Descoperă"]);
    expect(active("/harta")).toEqual(["Hartă"]);
    for (const path of ["/cauta", "/entitati/12", "/entitati/12/radiografie", "/semnale", "/semnale/abc", "/domenii", "/supra-prag", "/contracte/1", "/anunturi/2", "/achizitii/3"]) expect(active(path)).toEqual(["Descoperă"]);
    expect(active("/intreaba")).toEqual(["Întreabă"]);
    expect(active("/intreabare")).toEqual([]);
    expect(active("/anchete/abc")).toEqual(["Anchete"]);
    expect(active("/urmariri")).toEqual(["Anchete"]);
    expect(active("/cont")).toEqual(["Anchete"]);
    expect(active("/contracte/9")).toEqual(["Descoperă"]);
    expect(active("/metodologie")).toEqual(["Ghid"]);
    expect(active("/metodologie/excluderi")).toEqual(["Ghid"]);
    expect(active("/ghidaj")).toEqual([]);
    expect(active("/login")).toEqual([]);
  });

  it("never highlights „Întreabă” outside the question builder", () => {
    for (const path of ["/cauta", "/semnale", "/harta", "/domenii", "/contracte/9", "/entitati/2146445"]) expect(active(path)).not.toContain("Întreabă");
  });

  it("names the guide the same way at every width", () => {
    const guide = navItems(base).find(item => item.href === "/metodologie");
    expect(guide?.label).toBe("Ghid");
    expect(guide).not.toHaveProperty("className");
  });
});

describe("home map county link", () => {
  it("opens the valid „Pe ce se duc banii?” breakdown for the county", () => {
    const spec = countyBreakdownSpec("Buzău");
    expect(spec).toEqual({ block: "breakdown", dataset: "all", measure: "value", filters: { county: "Buzău" } });
    expect(validateSpec(spec)).not.toHaveProperty("error");
    const href = countyBreakdownHref("Buzău");
    expect(href.startsWith("/intreaba?spec=")).toBe(true);
    expect(href).not.toContain("#");
    expect(decodeSpec(decodeURIComponent(href.slice("/intreaba?spec=".length)))).toEqual(spec);
  });
});

const session = vi.hoisted(() => ({ data: null as null | { user: { email: string; role: string } }, isPending: true }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => session } }));
vi.mock("@/lib/site-nav", async () => await import("./site-nav"));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as string) }));
import SiteNav from "../app/SiteNav";

describe("<SiteNav> server snapshot", () => {
  it("uses only the cookie hint before hydration and never renders the session", () => {
    session.data = { user: { email: "fixture@example.invalid", role: "admin" } }; session.isPending = false;
    const anonymous = renderToStaticMarkup(createElement(SiteNav, {}));
    expect(anonymous).not.toContain("/anchete");
    expect(anonymous).not.toContain("d-nav-dot");
    expect(anonymous).not.toContain("Ce bate la ochi");
    expect(anonymous).toContain(">Întreabă<");
    const hinted = renderToStaticMarkup(createElement(SiteNav, { sessionHint: true }));
    expect(hinted).toContain("href=\"/anchete\"");
    expect(hinted).not.toContain("fixture@example.invalid");
  });
});
