import { toNextJsHandler } from "better-auth/next-js";
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb } from "@seap/db";
import { acceptWorkspaceInvite, changeWorkspaceMember, createWorkspaceInvite, getWorkspaceMembers, mutateWorkspace, readWorkspaceInvite } from "./investigation-workspace";
import { getInvestigationAccess } from "./investigation-access";

// An isolated sink: even if the developer has SMTP configured, these tests never
// import the real sender or log a code.
const mail = vi.hoisted(() => ({ sent: new Map<string, string>() }));
vi.mock("./mail", () => ({ sendAuthCode: vi.fn(async (to: string, code: string) => { mail.sent.set(to, code); }) }));

const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Auth fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl) : null;
const origin = "http://localhost:3129";
let authModule: typeof import("./auth");
let adminId: string;
let adminCookie: string;
const userIds: string[] = [];
const challengeKeys: string[] = [];
let serial = 0;

class Browser {
  cookies = new Map<string, string>();
  async request(path: string, body?: object) {
    const response = await toNextJsHandler(authModule.auth)[body ? "POST" : "GET"](new Request(`${origin}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: { Origin: origin, "Content-Type": "application/json", Cookie: [...this.cookies].map(([k,v]) => `${k}=${v}`).join("; ") },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0]!;
      const index = pair.indexOf("=");
      if (/max-age=0/i.test(cookie)) this.cookies.delete(pair.slice(0, index));
      else this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return { status: response.status, data: await response.json() };
  }
  clone() { const other = new Browser(); other.cookies = new Map(this.cookies); return other; }
}

beforeAll(async () => {
  if (!connection) return;
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv("BETTER_AUTH_SECRET", "isolated-auth-onboarding-test-secret-with-at-least-32-characters");
  (globalThis as unknown as { __seapAuthDb: typeof connection.db }).__seapAuthDb = connection.db;
  authModule = await import("./auth");
  const context = await authModule.auth.$context;
  // Rate limits have separate library coverage; keep adversarial scenarios from
  // blocking each other while all password/OTP/session checks remain enabled.
  context.rateLimit.enabled = false;
  adminId = `auth_onboarding_admin_${randomUUID()}`;
  userIds.push(adminId);
  await connection.sql`insert into auth.users (id,name,email,email_verified,role) values (${adminId},'Synthetic administrator',${`${adminId}@example.invalid`},true,'admin')`;
  const session = await context.internalAdapter.createSession(adminId);
  const signed = `${session!.token}.${createHmac("sha256", context.secret).update(session!.token).digest("base64")}`;
  adminCookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(signed)}`;
});

afterAll(async () => {
  if (connection) {
    for (const user of userIds) {
      // Verification rows have no user FK. Delete only this fixture's proofs and
      // challenges, then let the real user cascades remove its private cases.
      await connection.sql`delete from auth.verifications where identifier like ${`seap-email-proof:${user}:%`} or value=${user}`;
    }
    if (challengeKeys.length) await connection.sql`delete from auth.verifications where identifier in ${connection.sql(challengeKeys.flatMap(key => [key, `2fa-otp-${key}`, `2fa-attempts-${key}`]))}`;
    await connection.sql`delete from auth.users where id in ${connection.sql(userIds)}`;
    delete (globalThis as unknown as { __seapAuthDb?: unknown }).__seapAuthDb;
    await connection.sql.end();
  }
  vi.unstubAllEnvs();
});

async function createAccount() {
  const email = `auth_onboarding_${process.pid}_${Date.now()}_${++serial}@example.invalid`;
  const password = `fixture-password-${randomUUID()}`;
  const browser = new Browser();
  const index = adminCookie.indexOf("="); browser.cookies.set(adminCookie.slice(0,index),adminCookie.slice(index + 1));
  const created = await browser.request("/admin/create-user", { email, name: "Synthetic invited reporter", password });
  expect(created.status).toBe(200);
  const id = String(created.data.user.id); userIds.push(id);
  await authModule.forceTwoFactor(id);
  const [row] = await connection!.sql`select email_verified,two_factor_enabled from auth.users where id=${id}`;
  expect(row).toMatchObject({ email_verified:false, two_factor_enabled:true });
  return { id, email, password };
}
async function startLogin(account: Awaited<ReturnType<typeof createAccount>>) {
  const browser = new Browser();
  const result = await browser.request("/sign-in/email", { email:account.email,password:account.password });
  expect(result.status).toBe(200); expect(result.data.twoFactorRedirect).toBe(true);
  expect((await browser.request("/get-session")).data).toBeNull();
  const pending = [...browser.cookies].find(([key]) => key.endsWith("two_factor"))!;
  const decoded = decodeURIComponent(pending[1]);
  challengeKeys.push(decoded.slice(0,decoded.lastIndexOf(".")));
  expect((await browser.request("/two-factor/send-otp", {})).status).toBe(200);
  const code = mail.sent.get(account.email)!;
  expect(typeof code).toBe("string");
  return { browser, code, challenge:challengeKeys.at(-1)! };
}
async function verified(userId: string) {
  const [row] = await connection!.sql`select email_verified from auth.users where id=${userId}`;
  return row!.email_verified;
}

describe.runIf(Boolean(connection))("email ownership during the real admin-created account login", () => {
  it("uses the emailed login code to accept the matching invite, with editor/reader enforcement and revocation", async () => {
    const account = await createAccount();
    const [investigation] = await connection!.sql`insert into app.investigations (owner_user_id,title) values (${adminId},'Synthetic onboarding case') returning id`;
    const id = String(investigation!.id);
    const invitation = await createWorkspaceInvite(adminId,id,account.email,"editor",connection!.sql);
    expect(await readWorkspaceInvite(account.id,invitation.token,connection!.sql)).toBeNull();
    const { browser,code } = await startLogin(account);
    const result = await browser.request("/two-factor/verify-otp", { code });
    expect(result.status).toBe(200); expect(result.data.user.emailVerified).toBe(true);
    expect(await verified(account.id)).toBe(true);
    expect((await browser.request("/get-session")).data.user.id).toBe(account.id);
    expect(await acceptWorkspaceInvite(account.id,invitation.token,connection!.sql)).toEqual({ id });
    const entry = { action:"create",entry:{ kind:"question",title:"Which records explain this award?",body:"",alternative:"A specialist supplier",status:"open" } };
    await mutateWorkspace(account.id,id,entry,connection!.sql);
    const member = (await getWorkspaceMembers(adminId,id,connection!.sql))!.members.find(m => m.email === account.email)!;
    await changeWorkspaceMember(adminId,id,member.id,"viewer",connection!.sql);
    await expect(mutateWorkspace(account.id,id,entry,connection!.sql)).rejects.toMatchObject({ status:403 });
    await changeWorkspaceMember(adminId,id,member.id,null,connection!.sql);
    expect(await getInvestigationAccess(account.id,id,connection!.sql)).toBeNull();
    await expect(acceptWorkspaceInvite(account.id,invitation.token,connection!.sql)).rejects.toMatchObject({ status:404 });
  });

  it("leaves wrong and expired OTPs unverified and rejects a successfully consumed challenge replay", async () => {
    const account = await createAccount();
    const { browser,code,challenge } = await startLogin(account);
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await browser.request("/two-factor/verify-otp", { code:wrong })).status).toBeGreaterThanOrEqual(400);
    expect(await verified(account.id)).toBe(false);
    await connection!.sql`update auth.verifications set expires_at=now()-interval '1 second' where identifier=${`2fa-otp-${challenge}`}`;
    expect((await browser.request("/two-factor/verify-otp", { code })).status).toBeGreaterThanOrEqual(400);
    expect(await verified(account.id)).toBe(false);
    expect((await browser.request("/two-factor/send-otp", {})).status).toBe(200);
    const fresh = mail.sent.get(account.email)!;
    const replay = browser.clone();
    expect((await browser.request("/two-factor/verify-otp", { code:fresh })).status).toBe(200);
    expect((await replay.request("/two-factor/verify-otp", { code:fresh })).status).toBeGreaterThanOrEqual(400);
    expect((await replay.request("/get-session")).data).toBeNull();
  });

  it("never verifies an address changed after delivery and keeps wrong-email invitations private", async () => {
    const account = await createAccount();
    const { browser,code } = await startLogin(account);
    const changed = `changed_${account.email}`;
    await connection!.sql`update auth.users set email=${changed} where id=${account.id}`;
    expect((await browser.request("/two-factor/verify-otp", { code })).status).toBe(200);
    expect(await verified(account.id)).toBe(false);
    const [investigation] = await connection!.sql`insert into app.investigations (owner_user_id,title) values (${adminId},'Synthetic wrong-email case') returning id`;
    const invitation = await createWorkspaceInvite(adminId,String(investigation!.id),account.email,"viewer",connection!.sql);
    expect(await readWorkspaceInvite(account.id,invitation.token,connection!.sql)).toBeNull();
    expect((await browser.request("/two-factor/send-otp", {})).status).toBe(200);
    expect((await browser.request("/two-factor/verify-otp", { code:mail.sent.get(changed)! })).status).toBe(200);
    expect(await verified(account.id)).toBe(true);
    await expect(acceptWorkspaceInvite(account.id,invitation.token,connection!.sql)).rejects.toMatchObject({ status:404 });
  });

  it("requires a live recipient proof even when the library OTP verification succeeds", async () => {
    const account = await createAccount();
    const { browser,code } = await startLogin(account);
    await connection!.sql`update auth.verifications set expires_at=now()-interval '1 second' where identifier like ${`seap-email-proof:${account.id}:%`}`;
    expect((await browser.request("/two-factor/verify-otp", { code })).status).toBe(200);
    expect(await verified(account.id)).toBe(false);
    // This is also the pre-existing-session repair path used in the invitation UI.
    expect((await browser.request("/two-factor/send-otp", {})).status).toBe(200);
    const fresh = mail.sent.get(account.email)!;
    expect((await browser.request("/two-factor/verify-otp", { code:fresh })).status).toBe(200);
    expect(await verified(account.id)).toBe(true);
    expect((await browser.request("/two-factor/verify-otp", { code:fresh })).status).toBeGreaterThanOrEqual(400);
  });

  it("keeps public signup disabled", async () => {
    const browser = new Browser();
    const response = await browser.request("/sign-up/email", { email:"no-public-signup@example.invalid",name:"Not created",password:"test-password-never-created" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await connection!.sql`select id from auth.users where email='no-public-signup@example.invalid'`).length).toBe(0);
  });
});
