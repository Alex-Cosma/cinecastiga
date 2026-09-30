import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createDb } from "@seap/db";
const mail=vi.hoisted(()=>({send:vi.fn()}));
vi.mock("./mail",()=>({sendAuthCode:mail.send}));
const url=process.env.TEST_DATABASE_URL;
if(url && !/^seap_test_local_auth_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))) throw Error("Dedicated local auth fixture database required");
const connection=url ? createDb(url) : null;
afterAll(async()=>{await connection?.sql.end();vi.unstubAllEnvs()});
describe.runIf(!!connection)("real password login with local bypass",()=>{
  it.each(["development","production"] as const)("preserves account 2FA configuration in %s",async mode=>{
    vi.resetModules();vi.stubEnv("NODE_ENV",mode);vi.stubEnv("LOCAL_DISABLE_2FA","true");
    vi.stubEnv("BETTER_AUTH_URL","http://localhost:3129");vi.stubEnv("DATABASE_URL",url!);
    vi.stubEnv("BETTER_AUTH_SECRET","synthetic-local-auth-secret-with-at-least-32-characters");
    const globals=globalThis as unknown as {__seapAuthDb?:NonNullable<typeof connection>["db"]};
    globals.__seapAuthDb=connection!.db;
    const {auth,forceTwoFactor}=await import("./auth");const ctx=await auth.$context;ctx.rateLimit.enabled=false;
    const id=randomUUID(), email=`${id}@example.invalid`,password=`fixture-${randomUUID()}`;
    const hash=await ctx.password.hash(password);
    await connection!.sql`insert into auth.users(id,name,email,email_verified,role) values(${id},'Local auth fixture',${email},false,'admin')`;
    await connection!.sql`insert into auth.accounts(id,account_id,provider_id,user_id,password) values(${randomUUID()},${id},'credential',${id},${hash})`;
    try {
      await forceTwoFactor(id);
      const signIn=(value:string)=>auth.handler(new Request('http://localhost:3129/api/auth/sign-in/email',{method:'POST',headers:{origin:'http://localhost:3129','content-type':'application/json'},body:JSON.stringify({email,password:value})}));
      expect((await signIn('incorrect-password')).status).toBe(401);
      const response=await signIn(password);expect(response.status).toBe(200);const data=await response.json();
      if(mode==='development') {
        expect(data.user.id).toBe(id);expect(data.twoFactorRedirect).toBeUndefined();
        const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
        const session=await auth.api.getSession({headers:new Headers({cookie})});expect(session?.user.id).toBe(id);
      } else expect(data.twoFactorRedirect).toBe(true);
      const [user]=await connection!.sql`select two_factor_enabled,email_verified from auth.users where id=${id}`;
      expect(user).toMatchObject({two_factor_enabled:true,email_verified:false});
      expect(mail.send).not.toHaveBeenCalled();
    } finally { await connection!.sql`delete from auth.verifications where value=${id}`;await connection!.sql`delete from auth.users where id=${id}`;delete globals.__seapAuthDb;vi.unstubAllEnvs(); }
  },20000);
});
