import { describe, expect, it } from "vitest";
import { requireDedicatedTestDatabase } from "./support/test-database.js";

describe("legacy integration database guard", () => {
  it.each([undefined,"invalid","postgres://localhost/seap","postgres://localhost/postgres","postgres://localhost/seap_test","https://localhost/seap_test_fixture","postgres://localhost/seap_test_%2Fseap"])("rejects unsafe target %s before connecting", value => {
    expect(() => requireDedicatedTestDatabase(value)).toThrow();
  });
  it("accepts only an explicitly named disposable test database", () => {
    const url="postgres://localhost/seap_test_da_fixture";
    expect(requireDedicatedTestDatabase(url)).toBe(url);
  });
});
