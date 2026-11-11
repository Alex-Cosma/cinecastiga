import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import { auth } from "./auth";
import { decidePriceAccess } from "./price-access-core";

/*
 * Unit prices are for administrators only until the data is complete (owner, 11 November 2026): /preturi,
 * /preturi/[produs], /api/preturi/*, the note on /achizitii/[id] and the footer link. Everyone else gets the site's
 * 404, as for an address that does not exist. Server-only. Call it before any unit-price data is read: the 15-minute
 * spread cache (unit-prices.ts) holds data, not a viewer, and sits behind this.
 */

/** Whether the request's headers carry an administrator's session. */
export function priceAdminFor(h: Headers): Promise<boolean> {
  return decidePriceAccess(getSessionCookie(h) !== null, () => auth.api.getSession({ headers: h }));
}

/** Whether the current request (a page, its metadata) is an administrator's. */
export async function priceAdmin(): Promise<boolean> {
  return priceAdminFor(await headers());
}
