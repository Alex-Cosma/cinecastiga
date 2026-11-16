import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEntityProfile } from "@/lib/marts";
import { cleanName } from "@/lib/format";
import PeersExplorer from "./PeersExplorer";
import "./peers.css";
import { parseRoleParam } from "@/lib/role-param";
import { townHallPlace } from "@/lib/map-search";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compară în context" };

export default async function PeersPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  await redirectCanonicalEntity(id,"/comparatii",await searchParams);
  if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const profile = await getEntityProfile(id);
  if (!profile) notFound();
  const initial = Object.fromEntries(Object.entries(await searchParams).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  // A role the entity does not have (a town hall asked as a supplier) opens its own, as its page does (UX audit: the
  // comparison showed „Perioadă nealeasă”, „CPV null” and „firmă” for a town hall).
  const asked = parseRoleParam(initial.rol);
  const role = (asked && profile.roles.some((r) => r.role === asked) ? asked : profile.roles[0]?.role) ?? "authority";
  // A town hall's place on the map (UX audit Z4-26, Z4-39): the comparison links to it, even when the group cannot load.
  const place = role === "authority" ? townHallPlace(profile.name, profile.county) : null;
  return <PeersExplorer key={`${id}:${role}`} entityId={id} entityName={cleanName(profile.name)} county={profile.county} role={role} initial={initial} place={place} />;
}
