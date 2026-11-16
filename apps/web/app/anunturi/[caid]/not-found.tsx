import type { Metadata } from "next";
import RecordNotFound from "@/components/record/RecordNotFound";
import "@/components/record/record-pages.css";

export const metadata: Metadata = { title: "Anunț negăsit" };

export default function NoticeNotFound() {
  return <RecordNotFound none="Nu avem acest anunț în date" noun="anunțul de atribuire" placeholder="Instituția sau nr. anunțului"
    hint="ID-ul vine din SEAP. Caută după instituție sau după numărul anunțului (CAN…, SCNA…)." />;
}
