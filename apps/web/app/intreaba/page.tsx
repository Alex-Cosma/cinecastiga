import type { Metadata } from "next";
import AskPanel from "./AskPanel";
export const metadata: Metadata = {
  title: "Explorează",
  description:
    "Construiește o întrebare despre achizițiile publice. 13 feluri de a explora, de fiecare dată până la sursa SEAP.",
};
import "./explore-compact.css";

export default function IntreabaPage() {
  return <div className="explore-compact"><AskPanel initialMode="build" /></div>;
}
