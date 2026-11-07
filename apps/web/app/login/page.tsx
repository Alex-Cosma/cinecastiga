import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import { LOGIN_CONTEXT_TEXT, loginContext } from "./login-context";
import { localPasswordOnlyLogin } from "@/lib/local-auth";
import "./login.css";

export const metadata: Metadata = { title: "Autentificare", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).next;
  const context = loginContext(typeof raw === "string" ? raw : null);
  return <LoginForm twoFactorRequired={!localPasswordOnlyLogin()} context={context ? LOGIN_CONTEXT_TEXT[context] : null} />;
}
