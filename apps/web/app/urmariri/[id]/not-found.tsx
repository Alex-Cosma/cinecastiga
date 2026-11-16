import PrivateMissing from "@/components/private/PrivateMissing";

export const metadata = { title: "Urmărirea nu este disponibilă", robots: { index: false, follow: false } };

/** A watch that does not exist or is someone else's (audit Z8-22); the layout gives the private tabs. */
export default function WatchMissing() {
  return <PrivateMissing tab="urmariri" shell={false} hint="Verifică adresa. Urmăririle sunt doar ale contului care le-a creat; versiunile copiate într-un dosar rămân acolo." title="Urmărirea nu există sau a fost ștearsă." back={{ href: "/urmariri?view=watches", label: "Urmăririle mele" }} />;
}
