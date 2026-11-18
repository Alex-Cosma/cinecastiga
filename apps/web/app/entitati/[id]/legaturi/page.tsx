import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getEntityProfile, getEntityTxCounts } from "@/lib/marts";
import { cleanName } from "@/lib/format";
import ConnectionsExplorer from "./ConnectionsExplorer";
import CompletOnly from "@/components/mode/CompletOnly";
import "./connections.css";
import { parseRoleParam } from "@/lib/role-param";

export const dynamic = "force-dynamic";
const loadProfile = cache(getEntityProfile);

/** Whose page the browser tab shows (UX audit Z5-36, 16 November 2026): „Legături · Municipiul Cluj-Napoca”. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const entity = /^[1-9]\d{0,15}$/.test(id) ? await loadProfile(id).catch(() => null) : null;
  return { title: entity?.name ? `Legături · ${cleanName(entity.name)}` : "Legături" };
}

export default async function ConnectionsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  await redirectCanonicalEntity(id,"/legaturi",await searchParams);
  if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const profile = await loadProfile(id);
  if (!profile) notFound();
  const raw = await searchParams;
  const initial = Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const role = parseRoleParam(initial.rol) ?? profile.roles[0]?.role ?? "authority";
  // The entity's records per channel in this role (the profile's ledger): an empty channel is not offered (UX audit Z5-38).
  const channels = await getEntityTxCounts(id, role).catch(() => null);
  // Complet's (owner, 18 November 2026): opened from a link in Esențial it shows whole, under one line that says so.
  return <CompletOnly><ConnectionsExplorer key={`${id}:${role}`} entityId={id} entityName={cleanName(profile.name)} county={profile.county} role={role}
    bothRoles={profile.roles.length > 1} channels={channels ? { da: channels.nDa, contracts: channels.nCt } : undefined} initial={initial} /></CompletOnly>;
}
