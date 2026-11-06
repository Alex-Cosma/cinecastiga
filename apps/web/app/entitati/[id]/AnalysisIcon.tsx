/** The entity's analysis pages, by their icon (owner, 6 November 2026: one group of buttons beside the tabs). */
export type AnalysisKey = "semnale" | "radiografie" | "legaturi" | "comparatii";

/** One stroke and size for the four: a flag, a scan frame, linked nodes, bars side by side. */
export default function AnalysisIcon({ name }: { name: AnalysisKey }) {
  return (
    <svg className="an-ico" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "semnale" && <path d="M3.5 14.5V2.5M3.5 3h8l-1.6 3 1.6 3h-8" />}
      {name === "radiografie" && <path d="M2 5.5V3a1 1 0 0 1 1-1h2.5M10.5 2H13a1 1 0 0 1 1 1v2.5M14 10.5V13a1 1 0 0 1-1 1h-2.5M5.5 14H3a1 1 0 0 1-1-1v-2.5M2 8h12" />}
      {name === "legaturi" && <><circle cx="4" cy="4.5" r="2" /><circle cx="12" cy="4.5" r="2" /><circle cx="8" cy="12" r="2" /><path d="M6 4.5h4M5 6.3l2 4M11 6.3l-2 4" /></>}
      {name === "comparatii" && <path d="M2 14h12M4.5 14V8M8 14V3.5M11.5 14V6" />}
    </svg>
  );
}
