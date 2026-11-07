import Accounts from "./Accounts";
import FeedbackInbox from "./FeedbackInbox";
import "./oameni.css";
import "./feedback-admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Oameni · Administrare" };

/** Oameni (owner, 7 November 2026): the visitors' messages („Mesaje”), then the accounts („Conturi”). */
export default function AdminPeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <div className="admin-people">
    <FeedbackInbox />
    <Accounts searchParams={searchParams} />
  </div>;
}
