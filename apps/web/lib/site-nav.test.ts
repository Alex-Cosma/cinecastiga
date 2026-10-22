import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { navItems, type NavContext } from "./site-nav";
import { countyBreakdownHref, countyBreakdownSpec } from "./discovery-links";
import { decodeSpec } from "./ask/permalink";
import { validateSpec } from "./ask/spec";

const base: NavContext = { pathname: "/", storiesPublished: false, admin: false, signedIn: false };
const labels = (ctx: Partial<NavContext>) => navItems({ ...base, ...ctx }).map(item => item.label);
const active = (pathname: string) => navItems({ ...base, signedIn: true, pathname }).filter(item => item.active).map(item => item.label);

describe("main navigation", () => {
  it("calls the question page „Întreabă” and keeps its target", () => {
    const ask = navItems(base).find(item => item.href === "/intreaba");
    expect(ask?.label).toBe("Întreabă");
    expect(labels({})).not.toContain("Explorează");
  });

  it("hides the private investigations item and its dot from anonymous visitors", () => {
    expect(labels({})).toEqual(["Descoperă", "Întreabă", "Ghid"]);
    const signedIn = navItems({ ...base, signedIn: true });
    expect(signedIn.map(item => item.label)).toEqual(["Descoperă", "Întreabă", "Anchete", "Ghid"]);
    expect(signedIn.find(item => item.href === "/anchete")?.dot).toBe(true);
  });

  it("lists unpublished stories only for admins", () => {
    expect(labels({ admin: true, signedIn: true })).toEqual(["Descoperă", "Întreabă", "Ce bate la ochi", "Anchete", "Ghid"]);
    expect(labels({ storiesPublished: true })).toContain("Ce bate la ochi");
  });

  it("keeps the active-state rules", () => {
    expect(active("/")).toEqual(["Descoperă"]);
    for (const path of ["/intreaba", "/cauta", "/entitati/12", "/semnale", "/harta", "/domenii", "/supra-prag", "/contracte/1", "/anunturi/2", "/achizitii/3"]) expect(active(path)).toEqual(["Întreabă"]);
    expect(active("/anchete/abc")).toEqual(["Anchete"]);
    expect(active("/urmariri")).toEqual(["Anchete"]);
    expect(active("/ghid")).toEqual(["Ghid"]);
    expect(active("/ghidaj")).toEqual([]);
  });

  it("marks the guide item as the narrow-screen replacement of the header link", () => {
    expect(navItems(base).find(item => item.href === "/ghid")?.className).toBe("d-nav-guide");
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
    const anonymous = renderToStaticMarkup(createElement(SiteNav, { storiesPublished: false }));
    expect(anonymous).not.toContain("/anchete");
    expect(anonymous).not.toContain("d-nav-dot");
    expect(anonymous).not.toContain("Ce bate la ochi");
    expect(anonymous).toContain(">Întreabă<");
    const hinted = renderToStaticMarkup(createElement(SiteNav, { storiesPublished: false, sessionHint: true }));
    expect(hinted).toContain("href=\"/anchete\"");
    expect(hinted).not.toContain("fixture@example.invalid");
  });
});
