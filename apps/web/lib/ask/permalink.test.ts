import { describe, expect, it } from "vitest";
import { decodeSpec, encodeSpec } from "./permalink";

// The server reads links as strictly as the browser's atob + decodeURIComponent (the panel's restore()).
describe("decodeSpec on the server", () => {
  const spec = { block: "ranking", filters: { county: "Argeș", cpvTerm: "lucrări ??? >>>" } };
  it("reads what encodeSpec writes", () => expect(decodeSpec(encodeSpec(spec))).toEqual(spec));
  it("refuses base64url, which the browser rejects", () => {
    const url = encodeSpec(spec).replace(/\+/g, "-").replace(/\//g, "_");
    expect(url).toMatch(/[-_]/);
    expect(decodeSpec(url)).toBeNull();
  });
  it("refuses stray characters and invalid UTF-8", () => {
    expect(decodeSpec(`${encodeSpec(spec)}!`)).toBeNull();
    expect(decodeSpec(Buffer.from([0x7b, 0xff, 0x7d]).toString("base64"))).toBeNull();
  });
});
