/** Explicit opt-in, usable only by next dev with loopback app and database URLs. */
export function localPasswordOnlyLogin(env:Readonly<Record<string,string | undefined>> = process.env):boolean {
  if (env.NODE_ENV !== "development" || env.LOCAL_DISABLE_2FA !== "true") return false;
  const loopback = (host:string) => ["localhost","127.0.0.1","[::1]"].includes(host);
  try {
    const app = new URL(env.BETTER_AUTH_URL ?? "http://localhost:3000");
    const db = new URL(env.DATABASE_URL ?? "postgres://localhost/seap");
    return ["http:","https:"].includes(app.protocol) && loopback(app.hostname) && ["postgres:","postgresql:"].includes(db.protocol) && loopback(db.hostname);
  } catch { return false; }
}

/** Keep OTP endpoints and email verification intact; skip only the local email-login challenge. */
export function localLoginTwoFactor<T extends { hooks:{ after:Array<{ matcher:(context:any)=>boolean }> } }>(plugin:T):T {
  if (!localPasswordOnlyLogin()) return plugin;
  return { ...plugin,hooks:{ ...plugin.hooks,after:plugin.hooks.after.map(hook => ({ ...hook,matcher:(context:any) => context.path !== "/sign-in/email" && hook.matcher(context) })) } };
}
