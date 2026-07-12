import { describe, expect, it } from "vitest";
import { redactPayload } from "../src/scrape/redact.js";
import { contentHash } from "../src/scrape/hash.js";

describe("redactPayload", () => {
  it("removes denylisted keys deeply", () => {
    const payload = {
      directAcquisitionID: 7,
      assignedCAUser: { name: "Ion Popescu", email: "ion@primarie.ro" },
      nested: {
        assignedSupplierUser: { phone: "0722" },
        keep: "yes",
        list: [{ email: "x@y.ro", value: 1 }],
      },
      contactPerson: "Maria",
      phone: "021",
    };

    const redacted = redactPayload(payload, "da-detail:v1") as Record<
      string,
      unknown
    >;

    expect(redacted).not.toHaveProperty("assignedCAUser");
    expect(redacted).not.toHaveProperty("contactPerson");
    expect(redacted).not.toHaveProperty("phone");
    expect((redacted["nested"] as Record<string, unknown>)["keep"]).toBe("yes");
    expect(redacted["nested"]).not.toHaveProperty("assignedSupplierUser");
    const listItem = (
      (redacted["nested"] as Record<string, unknown>)["list"] as Record<
        string,
        unknown
      >[]
    )[0]!;
    expect(listItem).not.toHaveProperty("email");
    expect(listItem["value"]).toBe(1);
    expect(redacted["directAcquisitionID"]).toBe(7);
  });

  it("is idempotent", () => {
    const payload = { a: 1, email: "x", nested: { phone: "y", b: 2 } };
    const once = redactPayload(payload, "v1");
    const twice = redactPayload(once, "v1");
    expect(twice).toEqual(once);
  });

  it("keeps organization-level fields", () => {
    const payload = {
      contractingAuthority: "Primăria Cluj-Napoca",
      supplier: "SRL X",
      fiscalNumber: "RO123",
    };
    expect(redactPayload(payload, "v1")).toEqual(payload);
  });
});

describe("contentHash", () => {
  it("is stable under key reordering", () => {
    const a = { x: 1, y: { b: 2, a: [1, 2, { k: "v", j: null }] } };
    const b = { y: { a: [1, 2, { j: null, k: "v" }], b: 2 }, x: 1 };
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it("differs on value change and array order", () => {
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
    expect(contentHash({ a: [1, 2] })).not.toBe(contentHash({ a: [2, 1] }));
  });

  it("handles romanian diacritics deterministically", () => {
    const h1 = contentHash({ title: "100 Bucăți hârtie" });
    const h2 = contentHash({ title: "100 Bucăți hârtie" });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });
});
