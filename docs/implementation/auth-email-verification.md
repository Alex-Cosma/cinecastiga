# Email verification for private investigation invitations

Ordinary administrator-created accounts start with an unverified email address. Their existing password-and-email-code login now establishes email ownership, so an invited reporter can accept the matching private invitation immediately after signing in. Public signup remains disabled. The verified intended-email guard on invitations is unchanged.

## User flow

1. Open a private invitation while signed out. The existing login return path keeps the invitation URL.
2. Enter the account password, then the six-digit code emailed to that account.
3. Successful code verification confirms the exact delivered email address and returns to the invitation.
4. Accept the invitation. Reader/editor permissions apply normally and the owner can revoke access.

An existing signed-in account that is still unverified sees **Confirmă adresa de e-mail** directly on the invitation page. **Trimite codul de confirmare**, then **Confirmă și continuă**, confirms the address without losing the invitation. Invalid/expired codes have an inline recovery message and **Trimite un cod nou** action. No invitation content is disclosed before verification.

## Server guarantees

`apps/web/lib/auth.ts` stores a three-minute recipient proof in the existing `auth.verifications` table only after the email sender succeeds. Its HMAC identifier binds the user, pending-login/session challenge, and one-time code. The proof value is the actual server-selected delivery address; client-supplied email addresses are never used.

Only a successful `/two-factor/verify-otp` response can atomically consume this proof. The database update requires the same user ID and unchanged email address. Therefore a changed address, expired proof, failed code, unrelated challenge, or replay cannot acquire verification through this hook. OTPs are stored hashed by Better Auth. Password-only sign-in still leaves the account awaiting its mandatory second-factor challenge.

The hook relies on the installed Better Auth 1.6.25 OTP endpoint, its successful response shape, signed `two_factor` challenge cookie, and atomic `consumeVerificationValue` behavior. Rerun the integration tests when upgrading that library. Reference: [Better Auth two-factor authentication](https://better-auth.com/docs/plugins/2fa), [after hooks](https://better-auth.com/docs/1.6/concepts/hooks).

## Validation

Five real-handler integration scenarios pass in `apps/web/lib/auth-email-verification.integration.test.ts`:

- Actual admin creation → unverified account → password challenge → email code → verified session → matching invite → editor write → reader rejection → revocation.
- Wrong code, expired OTP, successful single use, and rejected challenge replay.
- Email changed after code delivery; subsequent confirmation of the new address still cannot accept an invite addressed to the old one.
- Expired recipient proof fails closed even if the OTP library succeeds; a current-session code repairs an older unverified session.
- Public signup remains unavailable.

The suite requires a disposable database named `seap_test_*`; it rejects other names, uses unique fixture accounts, and removes its own users, private cases, sessions, and verification records. The mail module is replaced by an in-memory sink, so no messages are sent or codes logged. Only the test context's rate limiter is disabled so sequential adversarial scenarios do not throttle one another; password, OTP, session and membership checks are real.

Run after preparing the disposable database schema:

```sh
TEST_DATABASE_URL=postgres://seap:seap_dev@localhost:5432/seap_test_batch3_20260919 pnpm --filter web exec vitest run lib/auth-email-verification.integration.test.ts
pnpm --filter web typecheck
```

No auth migration or account backfill is needed. Previously unverified addresses are never retroactively marked verified.

## Separate existing limitation

The pre-existing Better Auth plugin also exposes self-service second-factor disabling and trusted-device functionality, although the current UI says every login requires an emailed code. This change preserves that existing plugin configuration; enforcing the broader policy across those endpoints is a separate follow-up, not a claim of this onboarding fix.
