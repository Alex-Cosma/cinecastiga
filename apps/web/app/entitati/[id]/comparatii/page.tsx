import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import { titleName } from "@/lib/tidy-name";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getEntityProfile } from "@/lib/marts";
import { cleanName } from "@/lib/format";
import PeersExplorer from "./PeersExplorer";
import CompletOnly from "@/components/mode/CompletOnly";
import "./peers.css";
import { parseRoleParam } from "@/lib/role-param";
import { townHallPlace } from "@/lib/map-search";

export const dynamic = "force-dynamic";
const loadProfile = cache(getEntityProfile);

/** Whose page the browser tab shows (UX audit Z5-36, 16 November 2026): „Comparații · Municipiul Cluj-Napoca”. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const entity = /^[1-9]\d{0,15}$/.test(id) ? await loadProfile(id).catch(() => null) : null;
  return { title: entity?.name ? `Comparații · ${titleName(entity.name)}` : "Comparații" };
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
  // A role the entity does not have (a town hall asked as a supplier) opens its own, as its page does (UX audit: the
  // comparison showed „Perioadă nealeasă”, „CPV null” and „firmă” for a town hall).
  const asked = parseRoleParam(initial.rol);
  const role = (asked && profile.roles.some((r) => r.role === asked) ? asked : profile.roles[0]?.role) ?? "authority";
  // A town hall's place on the map (UX audit Z4-26, Z4-39): the comparison links to it, even when the group cannot load.
  const place = role === "authority" ? townHallPlace(profile.name, profile.county) : null;
  // Complet's (owner, 18 November 2026): opened from a link in Esențial it shows whole, under one line that says so.
  return <CompletOnly><PeersExplorer key={`${id}:${role}`} entityId={id} entityName={cleanName(profile.name)} titleName={titleName(profile.name)} county={profile.county} role={role} bothRoles={profile.roles.length > 1} initial={initial} place={place} /></CompletOnly>;
}
