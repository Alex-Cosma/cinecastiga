import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getEntityProfile } from "@/lib/marts";
import { cleanName } from "@/lib/format";
import PeersExplorer from "./PeersExplorer";
import "./peers.css";
import { parseRoleParam } from "@/lib/role-param";

export const dynamic = "force-dynamic";
const loadProfile = cache(getEntityProfile);

/** Whose page the browser tab shows (UX audit Z5-36, 16 November 2026): „Comparații · Municipiul Cluj-Napoca”. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const entity = /^[1-9]\d{0,15}$/.test(id) ? await loadProfile(id).catch(() => null) : null;
  return { title: entity?.name ? `Comparații · ${cleanName(entity.name)}` : "Comparații" };
}

export default async function PeersPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  await redirectCanonicalEntity(id,"/comparatii",await searchParams);
  if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const profile = await loadProfile(id);
  if (!profile) notFound();
  const initial = Object.fromEntries(Object.entries(await searchParams).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const role = parseRoleParam(initial.rol) ?? profile.roles[0]?.role ?? "authority";
  return <PeersExplorer key={`${id}:${role}`} entityId={id} entityName={cleanName(profile.name)} county={profile.county} role={role} initial={initial} />;
}
