import type { Metadata } from "next";
import MapExplorer from "./MapExplorer";
import "./harta.css";

/*
 * /harta (owner, 6 November 2026, "Harta și clasamentul"): the value contracted per inhabitant by the local
 * administrations, county by county and, after a click, UAT by UAT, beside its ranking. It replaces the old county
 * map of total sums and, in the navigation, the stories ("Ce bate la ochi"). The data: lib/map-capita*.ts, /api/map.
 */

export const metadata: Metadata = {
  title: "Hartă",
  description: "Lei contractați pe locuitor de primării și consiliile județene, cu sau fără instituțiile lor, pe județe și pe UAT-uri; spitalele publice, cu lei pe pat pentru 2025; școlile și grădinițele publice, cu lei pe elev pentru 2025.",
};

export default async function HartaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? params[key] as string : undefined);
  return <MapExplorer initial={{ ani: one("ani"), cpv: one("cpv"), canal: one("canal"), judet: one("judet"), uat: one("uat"), inst: one("inst"), cu: one("cu") }} />;
}
