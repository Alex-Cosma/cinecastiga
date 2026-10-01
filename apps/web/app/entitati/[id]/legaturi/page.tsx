import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEntityProfile } from "@/lib/marts";
import { cleanName } from "@/lib/format";
import ConnectionsExplorer from "./ConnectionsExplorer";
import "./connections.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cum sunt legate?" };

export default async function ConnectionsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  await redirectCanonicalEntity(id,"/legaturi",await searchParams);
  if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const profile = await getEntityProfile(id);
  if (!profile) notFound();
  const raw = await searchParams;
  const initial = Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const role = initial.rol === "furnizor" ? "supplier" : initial.rol === "autoritate" ? "authority" : profile.roles[0]?.role ?? "authority";
  return <ConnectionsExplorer key={`${id}:${role}`} entityId={id} entityName={cleanName(profile.name)} role={role} initial={initial} />;
}
