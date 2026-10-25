import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// TB-screen (plan §2.8): „Urmărește grupa” on a trend's group; a group over the members limit stays
// visible, disabled, with how to narrow it, instead of failing on the setup page.
const viewer = vi.hoisted(() => ({ userId: "u1" as string | undefined }));
vi.mock("@/lib/use-viewer", () => ({ useViewer: () => ({ userId: viewer.userId, ready: true, error: null }) }));
vi.mock("@/lib/ask/permalink", () => import("../lib/ask/permalink"));
const { default: FollowButton } = await import("./FollowButton");

const spec = { block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "new" } } as const;
const html = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(FollowButton, { spec, ...props } as never));

describe("the follow action", () => {
  it("links to the setup with the question; a group's label says so", () => {
    const markup = html({ label: "Urmărește grupa" });
    expect(markup).toMatch(/^<a class="follow-action" href="\/urmariri\/noua\?spec=/);
    expect(markup).toContain("Urmărește grupa");
  });

  it("is disabled with its reason when the group is too large to fix", () => {
    const markup = html({ label: "Urmărește grupa", blocked: "Grupa are 17.633 de firme; restrânge perioada sau locul." });
    expect(markup).not.toContain("<a ");
    expect(markup).toMatch(/<button type="button" class="follow-action" aria-disabled="true" aria-describedby="([^"]+)">Urmărește grupa<\/button><span id="\1"/);
    expect(markup).toContain("Grupa are 17.633 de firme; restrânge perioada sau locul.");
  });

  it("is not shown to a visitor without an account", () => {
    viewer.userId = undefined;
    expect(html({ blocked: "x" })).toBe("");
    viewer.userId = "u1";
  });
});
