"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function AcceptInvite({ token }: { token: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""); const router = useRouter();
  async function accept() {
    setBusy(true); setError("");
    try { const response = await fetch(`/api/anchete/invites/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Invitația nu a putut fi acceptată."); router.replace(`/anchete/${result.id}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Încearcă din nou."); setBusy(false); }
  }
  return <>{error && <p role="alert" className="iw-error">{error}</p>}<button className="iw-primary" disabled={busy} type="button" onClick={() => void accept()}>{busy ? "Se deschide dosarul…" : "Acceptă invitația"}</button></>;
}
