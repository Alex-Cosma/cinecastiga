import "./table-filters.css";

/**
 * A column header's funnel as a ghost draws it (route ghosts of tables with URL filters): the same box and glyph,
 * hidden from readers and out of the tab order; put the ghost's header in an `inert` row so it cannot be clicked.
 */
export default function FunnelGhost({ label }: { label?: string }) {
  return (
    <span className="th-filter">
      {label}
      <button type="button" className="tf-fun" tabIndex={-1} aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 3h12l-4.5 5.5V13L6.5 14V8.5z" />
        </svg>
      </button>
    </span>
  );
}
