import * as React from "react";
import type { ReactNode } from "react";

/*
 * The page cross-fade (owner, 6 November 2026: "cross-fade scurt" between pages, header still, Back not animated).
 * React's <ViewTransition> exists in the React that the App Router runs (Next's own canary build); the installed
 * react, which the unit tests render with, does not have it yet, so without it the children render as they are and
 * pages simply swap. Only the app's template uses it (app/template.tsx).
 */
type VTProps = { enter?: string; exit?: string; default?: string; children?: ReactNode };
const VT = (React as unknown as { ViewTransition?: (p: VTProps) => ReactNode }).ViewTransition;

export default function PageTransition({ children }: { children: ReactNode }) {
  if (!VT) return <>{children}</>;
  return <VT enter="page-in" exit="page-out" default="none">{children}</VT>;
}
