import PrivateTrail from "@/components/private/PrivateTrail";
import "./monitoring.css";
export const metadata = { title: "Urmăriri", robots: { index: false, follow: false } };
export default function MonitoringLayout({ children }: { children: React.ReactNode }) {
  return <div className="private-shell mon-shell"><PrivateTrail current="urmariri" />{children}</div>;
}
