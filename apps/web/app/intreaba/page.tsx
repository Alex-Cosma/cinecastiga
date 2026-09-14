import type { Metadata } from "next";
import AskPanel from "./AskPanel";
export const metadata: Metadata = {
  title: "Explorează",
  description:
    "Construiește o întrebare despre achizițiile publice. 13 feluri de a explora, de fiecare dată până la sursa SEAP.",
};
export default function IntreabaPage() {
  return (
    <>
      <header className="cq-page-intro">
        <p className="cq-eyebrow">DESCOPERĂ / CONSTRUIEȘTE O ÎNTREBARE</p>
        <h1>Curiozitatea ta. Datele, la vedere.</h1>
        <p>13 feluri de a întreba. De fiecare dată, până la sursă.</p>
      </header>
      <AskPanel initialMode="build" />
    </>
  );
}
