import { createHmac } from "node:crypto";
import { limitAddress } from "./client-address";
import { createDb, type DbSql } from "@seap/db";
import { SHORT_CODE, shortLinkCodes } from "./short-links-shared";

const globalDb = globalThis as unknown as { __seapSql?: DbSql };
const db = () => globalDb.__seapSql ??= createDb().sql;

export class ShortLinkLimitError extends Error {}
export class ShortLinkCollisionError extends Error {}

/** New links per visitor and in all (a link already made costs nothing): enough for any reader, not for a script. */
export const SHORT_LINK_LIMITS = [["client", 60, 600], ["global", 2000, 3600]] as const;

export function shortLinkClientKey(request: Request, secret: string, production: boolean, now = new Date()): string {
  // The address Caddy established, an IPv6 one by its /64 (lib/client-address.ts).
  const address = limitAddress(request, production);
  return createHmac("sha256", secret).update(`short-link:${now.toISOString().slice(0, 13)}:${address}`).digest("hex");
}

export function shortLinkStore(q: DbSql = db()) {
  return {
    /** The code of a normalized target (shortLinkTarget): the existing one, or a new row within the limits. */
    async create(target: string, clientKey: string): Promise<string> {
      const codes = shortLinkCodes(target);
      const known = await q`select code, target from app.short_links where code in ${q(codes)}` as unknown as { code: string; target: string }[];
      const mine = known.find((row) => row.target === target);
      if (mine) return mine.code;
      const taken = new Set(known.map((row) => row.code));
      const code = codes.find((c) => !taken.has(c));
      if (!code) throw new ShortLinkCollisionError();
      return q.begin(async (tx) => {
        // The limit buckets share app.feedback_limits (its keys are "client:…" and "global"; these start with "short-link:").
        await tx`select pg_advisory_xact_lock(864029302)`;
        await tx`delete from app.feedback_limits where expires_at <= now()`;
        for (const [scope, maximum, seconds] of SHORT_LINK_LIMITS) {
          const key = scope === "client" ? `short-link:client:${clientKey}` : "short-link:global";
          const [row] = await tx`insert into app.feedback_limits(key, count, expires_at) values (${key}, 1, now() + ${seconds} * interval '1 second')
            on conflict (key) do update set count = app.feedback_limits.count + 1 returning count`;
          if (Number(row!["count"]) > maximum) throw new ShortLinkLimitError();
        }
        const [inserted] = await tx`insert into app.short_links (code, target) values (${code}, ${target}) on conflict (code) do nothing returning code`;
        if (inserted) return code;
        // Made at the same moment by another click: the same target is the same link; another one is a collision to retry.
        const [same] = await tx`select target from app.short_links where code = ${code}`;
        if (same?.["target"] === target) return code;
        throw new ShortLinkCollisionError();
      });
    },
    /** The target of a code, counted as opened; null when there is none. */
    async open(code: string): Promise<string | null> {
      if (!SHORT_CODE.test(code)) return null;
      const [row] = await q`update app.short_links set opens = opens + 1, opened_at = now() where code = ${code} returning target`;
      return row ? String(row["target"]) : null;
    },
  };
}
