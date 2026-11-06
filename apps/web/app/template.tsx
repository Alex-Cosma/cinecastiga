import PageTransition from "@/components/motion/PageTransition";

// A template remounts on every navigation between pages, so the cross-fade runs then; search-parameter changes on the
// same page (filters, pages of a list) keep it mounted and do not fade.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
