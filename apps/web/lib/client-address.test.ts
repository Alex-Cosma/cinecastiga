import { describe, expect, it } from "vitest";
import { addressBucket, limitAddress } from "./client-address";

describe("the address a limit counts (launch audit M2, 12 November 2026)", () => {
  it("keeps an IPv4 address and counts an IPv6 one by its /64", () => {
    expect(addressBucket("203.0.113.5")).toBe("203.0.113.5");
    expect(addressBucket("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(addressBucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(addressBucket("2001:0db8:0001:0002:0000:0000:0000:0001")).toBe("2001:db8:1:2::/64");
    expect(addressBucket("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(addressBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(addressBucket("[2001:DB8:1:2::ff]")).toBe("2001:db8:1:2::/64");
    expect(addressBucket("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("gives every address of one /64 the same bucket, and another /64 another", () => {
    const one = ["2001:db8:1:2::1", "2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2:1234::9"].map(addressBucket);
    expect(new Set(one).size).toBe(1);
    expect(addressBucket("2001:db8:1:3::1")).not.toBe(one[0]);
  });

  it("leaves what it cannot parse as it is", () => {
    for (const raw of ["unknown", "1::2::3", "2001:db8:zz::1", ""]) expect(addressBucket(raw)).toBe(raw);
  });

  it("reads only the header Caddy sets, and nothing outside production", () => {
    const req = (headers: Record<string, string>) => new Request("https://cinecastiga.ro/", { headers });
    expect(limitAddress(req({ "x-feedback-client-ip": "2001:db8:1:2::7", "x-forwarded-for": "198.51.100.1" }), true)).toBe("2001:db8:1:2::/64");
    expect(limitAddress(req({ "x-forwarded-for": "198.51.100.1" }), true)).toBe("unknown");
    expect(limitAddress(req({ "x-feedback-client-ip": "203.0.113.5" }), false)).toBe("local");
  });
});
