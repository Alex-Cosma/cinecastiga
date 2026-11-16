import PrivateMissing from "@/components/private/PrivateMissing";

export const metadata = { title: "Fișa de probă nu este disponibilă", robots: { index: false, follow: false } };

/** An evidence sheet that does not exist, is not complete or is not the reader's (audit Z8-22). */
export default function SheetMissing() {
  return <PrivateMissing tab="anchete" title="Fișa de probă nu există sau nu ai acces la ea." back={{ href: "/anchete", label: "Anchetele mele" }} />;
}
