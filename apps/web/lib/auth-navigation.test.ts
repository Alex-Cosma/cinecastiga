import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ data: null as null | { user: { email: string; role: string } }, isPending: true }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => session } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/entitati/2146107/radiografie" }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as string) }));
import HeaderUserNav from "../app/HeaderUserNav";
import FooterAuthLink from "../app/FooterAuthLink";

describe("streamed authentication navigation", () => {
  it.each([null, { user: { email: "fixture@example.invalid", role: "admin" } }])("keeps the server snapshot stable when a sibling already resolved the session: %j", data => {
    session.data = null; session.isPending = true;
    const header = renderToStaticMarkup(createElement(HeaderUserNav));
    const footer = renderToStaticMarkup(createElement(FooterAuthLink));
    session.data = data; session.isPending = false;
    expect(renderToStaticMarkup(createElement(HeaderUserNav))).toBe(header);
    expect(renderToStaticMarkup(createElement(FooterAuthLink))).toBe(footer);
    expect(header).not.toContain("/admin");
    expect(footer).toContain("/login");
  });
});
