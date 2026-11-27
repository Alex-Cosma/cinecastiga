import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { publicFact } from "@/lib/facts";
import FactCard from "../FactCard";
import "../stiati-ca.css";

export const dynamic = "force-dynamic";
const fact = cache((id: string) => publicFact(id));
/** The fact in one line, for the tab and for what a shared link shows. */
const line = (f: { figure: string; unit: string | null; statement: string }) => `${f.figure}${f.unit ? ` ${f.unit}` : ""} ${f.statement}`;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const f = await fact((await params).id);
  if (!f) return { title: "Știați că" };
  const text = line(f);
  return {
    title: text.length > 70 ? `${text.slice(0, 69)}…` : text,
    description: [text, f.context].filter(Boolean).join(" "),
    alternates: { canonical: `/stiati-ca/${f.id}` },
  };
}

/** /stiati-ca/<număr>: one published fact at its own address. */
export default async function FactPage({ params }: { params: Promise<{ id: string }> }) {
  const f = await fact((await params).id);
  if (!f) notFound();
  return <div className="wrap facts-page is-one">
    <p className="facts-back"><Link href="/stiati-ca">← Știați că</Link></p>
    <FactCard fact={f} page />
    <p className="facts-more"><Link href="/stiati-ca">Vezi și celelalte fapte</Link></p>
  </div>;
}
