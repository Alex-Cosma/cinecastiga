"use client";

/*
 * The short link of a site address in the browser (owner, 9 November 2026): cinecastiga.ro/l/k7Qm2xPa instead of
 * the question's spec in base64. When it cannot be made (a limit, the server updating, offline), the long address is
 * used: the reader always gets a working link.
 */

const made = new Map<string, Promise<string>>();

async function request(path: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch("/api/short-links", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: path }), signal: controller.signal,
    });
    const data = await response.json().catch(() => null) as { path?: unknown } | null;
    return response.ok && typeof data?.path === "string" && data.path.startsWith("/l/") ? data.path : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/** The absolute short link of a path of the site (a question of „Întreabă”), or its absolute long address. */
export function shortLink(path: string): Promise<string> {
  const known = made.get(path);
  if (known) return known;
  const pending = request(path).then((short) => {
    if (!short) made.delete(path); // a failure is not remembered: the next click asks again
    return new URL(short ?? path, window.location.origin).href;
  });
  made.set(path, pending);
  return pending;
}

/** Starts making the link when a press begins, so the click finds it ready (the phone's share sheet needs it at once). */
export function prepareShortLink(path: string): void { void shortLink(path); }

/** Copies the short link. Safari keeps the click's permission only for a write started in the click: it gets the pending text. */
export async function copyShortLink(path: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const pending = shortLink(path).then((url) => new Blob([url], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": pending })]);
    return;
  }
  await navigator.clipboard.writeText(await shortLink(path));
}
