import type { Metadata } from "next";
import RecordNotFound from "@/components/record/RecordNotFound";
import "@/components/record/record-pages.css";

export const metadata: Metadata = { title: "Contract negăsit" };

// In the parent segment: the contract layout ([nid]/layout.tsx) answers 404 before its page, above its own boundary.
export default function ContractNotFound() {
  return <RecordNotFound none="Nu avem acest contract în date" noun="contractul" placeholder="Instituția sau nr. anunțului"
    hint="ID-ul vine din SEAP. Caută după instituție sau după numărul anunțului de atribuire (CAN…, SCNA…)." />;
}
