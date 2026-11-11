/*
 * Who may see unit prices (owner, 11 November 2026): administrators only, until the data is complete. The decision
 * itself, free of Next and of the auth server so it is tested alone (price-access.test.ts); price-access.ts feeds it
 * the request.
 */
export type SessionLookup = () => Promise<{ user: { role?: string | null | undefined } } | null | undefined>;

/**
 * True only for a signed-in administrator. Without a session cookie nothing is looked up (an anonymous visit costs no
 * query); a lookup that fails is a refusal, never an opening.
 */
export async function decidePriceAccess(hasSessionCookie: boolean, lookup: SessionLookup): Promise<boolean> {
  if (!hasSessionCookie) return false;
  try {
    const session = await lookup();
    return session?.user.role === "admin";
  } catch {
    return false;
  }
}
