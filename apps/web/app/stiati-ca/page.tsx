import type { Metadata } from "next";
import Link from "next/link";
import { publicFacts } from "@/lib/facts";
import FactsBoard from "./FactsBoard";
import { firstDraw } from "./draw";
import "./stiati-ca.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Știați că",
  description: "Fapte din achizițiile publice din România, scoase din datele SEAP: proporții, sume mari și numere mari, fiecare cu drumul spre înregistrările din spatele ei.",
  alternates: { canonical: "/stiati-ca" },
};

/**
 * /stiati-ca (owner, 26–27 November 2026): a board of the published facts. Every visit opens another draw of them in
 * another arrangement, and „Alte fapte” deals again (FactsBoard); there is no list of them all.
 */
export default async function FactsPage() {
  const facts = await publicFacts();
  return <div className="wrap facts-page">
    {facts.length === 0
      ? <>
        <header className="facts-head"><h1>Știați că…</h1></header>
        <p className="facts-empty">Primele fapte apar aici în curând. <Link href="/">Înapoi la prima pagină</Link></p>
      </>
      : <FactsBoard facts={facts} first={firstDraw(facts, Math.random)} />}
  </div>;
}
