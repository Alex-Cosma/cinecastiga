import PrivateMissing from "@/components/private/PrivateMissing";

export const metadata = { title: "Dosarul nu este disponibil", robots: { index: false, follow: false } };

/** A dossier that does not exist or is not shared with the reader (audit Z8-22): the same words for both. */
export default function DossierMissing() {
  return <PrivateMissing tab="anchete" title="Dosarul nu există sau nu ai acces la el." back={{ href: "/anchete", label: "Anchetele mele" }} />;
}
