import PageTransition from "@/components/motion/PageTransition";

// The page cross-fade one level down (app/template.tsx explains it): a template only remounts when its own child
// segment changes, so moves between the methodology and its exclusions need their own.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
