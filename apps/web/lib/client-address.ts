/**
 * The address a limit of the site counts (launch audit M2, 12 November 2026). Caddy overwrites X-Feedback-Client-IP
 * with the client address of the trusted proxy chain (infra/prod/Caddyfile), never a caller's own X-Forwarded-For.
 * An IPv6 visitor is counted by its /64, the block one host or rented server usually holds, as better-auth does for
 * sign-in: by full address, one server with a /64 counted as thousands of visitors and filled the global caps.
 */
export function limitAddress(request: Request, production: boolean): string {
  if (!production) return "local";
  return addressBucket((request.headers.get("x-feedback-client-ip") || "unknown").trim().slice(0, 128));
}

/** An IPv4 address as it is (an IPv4-mapped IPv6 one too), an IPv6 address as its /64; anything else unchanged. */
export function addressBucket(raw: string): string {
  const a = raw.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]!;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
  if (mapped) return mapped[1]!;
  if (!a.includes(":")) return a;
  const compressed = a.indexOf("::");
  if (compressed !== a.lastIndexOf("::")) return a;
  let groups: string[];
  if (compressed < 0) groups = a.split(":");
  else {
    const left = a.slice(0, compressed) ? a.slice(0, compressed).split(":") : [];
    const right = a.slice(compressed + 2) ? a.slice(compressed + 2).split(":") : [];
    groups = [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  }
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return a;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
