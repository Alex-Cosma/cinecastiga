import { describe, expect, it } from "vitest";
import { localPasswordOnlyLogin } from "./local-auth";
const local = { NODE_ENV:"development",LOCAL_DISABLE_2FA:"true",BETTER_AUTH_URL:"http://localhost:3000",DATABASE_URL:"postgres://localhost/seap" } as const;
describe("local-only password login", () => {
  it("allows an explicit local development opt-in", () => expect(localPasswordOnlyLogin(local)).toBe(true));
  it.each([
    {NODE_ENV:"production"}, {NODE_ENV:"test"}, {LOCAL_DISABLE_2FA:"false"}, {LOCAL_DISABLE_2FA:undefined},
    {BETTER_AUTH_URL:"https://cinecastiga.ro"}, {DATABASE_URL:"postgres://production.example/seap"},
    {BETTER_AUTH_URL:"http://localhost.evil.test"}, {BETTER_AUTH_URL:"invalid"}, {DATABASE_URL:"invalid"},
  ])("keeps two-factor authentication for %j", patch => expect(localPasswordOnlyLogin({...local,...patch})).toBe(false));
});
