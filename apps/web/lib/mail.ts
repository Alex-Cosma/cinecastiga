import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound mail for auth codes. SMTP config via env (SMTP_HOST/PORT/SECURE/
 * USER/PASS/FROM); when SMTP_HOST is unset (local dev) codes are logged to
 * the server console instead of sent.
 */
const g = globalThis as unknown as { __seapMailer?: Transporter | null };

function transporter(): Transporter | null {
  if (g.__seapMailer) return g.__seapMailer;
  // Not cached when unset: next dev hot-reloads .env.local, so SMTP can be
  // configured without restarting the server.
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  g.__seapMailer = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  return g.__seapMailer;
}

export async function sendAuthCode(to: string, code: string): Promise<void> {
  const t = transporter();
  if (!t) {
    console.log(`[auth] SMTP neconfigurat — cod 2FA pentru ${to}: ${code}`);
    return;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject: `${code} — codul tău de autentificare cinecâștigă?`,
    text: `Codul tău de autentificare este: ${code}\n\nCodul expiră în câteva minute. Dacă nu ai încercat să te autentifici, ignoră acest mesaj.`,
  });
}
