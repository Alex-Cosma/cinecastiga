import type { Metadata } from "next";
import { notFound } from "next/navigation";
import KitDemo from "./KitDemo";

// The filter kit's demo (F1a): every component of the kit in its states, for
// review in both themes and at phone widths. Development only.
export const metadata: Metadata = { title: "Trusa de filtre", robots: { index: false, follow: false } };

export default function KitDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitDemo />;
}
