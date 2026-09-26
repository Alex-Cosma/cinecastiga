import Link from "next/link";
import "./monitoring.css";
export const metadata = { title: "Urmăriri", robots: { index: false, follow: false } };
export default function MonitoringLayout({ children }: { children: React.ReactNode }) {
  return <div className="mon-shell"><nav className="monitoring-trail" aria-label="Spațiu privat"><Link href="/anchete">Anchetele mele</Link><Link href="/urmariri" aria-current="page">Urmăriri</Link></nav>{children}</div>;
}
