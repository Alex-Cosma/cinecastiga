import type { Metadata } from "next";
import RecordNotFound from "@/components/record/RecordNotFound";
import "@/components/record/record-pages.css";

export const metadata: Metadata = { title: "Achiziție negăsită" };

export default function AcquisitionNotFound() {
  return <RecordNotFound none="Nu avem această achiziție directă în date" noun="achiziția directă" placeholder="Instituția, firma sau codul DA"
    hint="ID-ul vine din SEAP. Caută după instituție, după firmă sau după codul achiziției (DA…)." />;
}
