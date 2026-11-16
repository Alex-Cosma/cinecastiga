import PrivateMissing from "@/components/private/PrivateMissing";

export const metadata = { title: "Verificarea nu este disponibilă", robots: { index: false, follow: false } };

/** A check that does not exist, or whose watch was deleted or is someone else's (audit Z8-22). */
export default function RunMissing() {
  return <PrivateMissing tab="urmariri" shell={false} hint="Verifică adresa. Urmăririle sunt doar ale contului care le-a creat; versiunile copiate într-un dosar rămân acolo." title="Verificarea nu există sau urmărirea a fost ștearsă." back={{ href: "/urmariri?view=watches", label: "Urmăririle mele" }} />;
}
