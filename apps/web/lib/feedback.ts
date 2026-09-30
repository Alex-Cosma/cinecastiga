import { createHmac } from "node:crypto";
import { createDb, type DbSql } from "@seap/db";
import type { FeedbackInput, FeedbackPage } from "./feedback-shared";

const globalDb = globalThis as unknown as { feedbackSql?:DbSql };
export const feedbackDb = () => globalDb.feedbackSql ??= createDb().sql;
export class FeedbackLimitError extends Error {}
export class FeedbackConflictError extends Error {}

export function feedbackClientKey(request:Request, secret:string, production:boolean, now = new Date()):string {
  // Caddy overwrites this header using its trusted client address. Never use a caller's X-Forwarded-For.
  const address = production ? request.headers.get("x-feedback-client-ip") || "unknown" : "local";
  return createHmac("sha256",secret).update(`feedback:${now.toISOString().slice(0,13)}:${address.slice(0,128)}`).digest("hex");
}

export function feedbackStore(q:DbSql = feedbackDb()) {
  return {
    async submit(input:FeedbackInput, clientKey:string):Promise<void> {
      await q.begin(async tx => {
        // One tiny serialized transaction enforces limits across app instances and duplicate requests.
        await tx`select pg_advisory_xact_lock(864029301)`;
        const [existing] = await tx`select category,message,source_path from app.feedback where id=${input.id}::uuid`;
        if (existing) {
          if (existing.category !== input.category || existing.message !== input.message || existing.source_path !== input.sourcePath) throw new FeedbackConflictError();
          return;
        }
        await tx`delete from app.feedback_limits where expires_at <= now()`;
        for (const [key,maximum,seconds] of [[`client:${clientKey}`,5,600],["global",100,3600]] as const) {
          const [row] = await tx`insert into app.feedback_limits(key,count,expires_at) values (${key},1,now()+${seconds}*interval '1 second')
            on conflict(key) do update set count=app.feedback_limits.count+1 returning count`;
          if (Number(row!.count)>maximum) throw new FeedbackLimitError();
        }
        await tx`insert into app.feedback(id,category,message,source_path) values (${input.id}::uuid,${input.category},${input.message},${input.sourcePath})`;
      });
    },
    async list(requestedPage:number):Promise<FeedbackPage> {
      return q.begin("isolation level repeatable read read only", async tx => {
        const [count] = await tx`select count(*)::int total from app.feedback`;
        const total = Number(count!.total), pages = Math.max(1,Math.ceil(total/10)), page = Math.min(requestedPage,pages);
        const rows = await tx`select id,category,message,source_path,created_at from app.feedback order by created_at desc,id desc limit 10 offset ${(page-1)*10}`;
        return { total,page,pages,items:rows.map(row => ({ id:String(row.id),category:row.category as FeedbackInput["category"],message:String(row.message),sourcePath:row.source_path === null ? null : String(row.source_path),createdAt:new Date(row.created_at).toISOString() })) };
      });
    },
    async remove(id:string):Promise<void> { await q`delete from app.feedback where id=${id}::uuid`; },
  };
}
