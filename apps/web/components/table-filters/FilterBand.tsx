"use client";

import { chipsOf, type Labels } from "@/lib/table-filters/describe";
import type { FilterState, TableColumns } from "@/lib/table-filters/types";
import "./table-filters.css";

/**
 * What is left above a table once its filters live in its column funnels (owner, 4 November 2026): the applied
 * filters, each with its ✕, and „Scoate toate”. Nothing when nothing filters.
 */
export default function FilterBand({
  columns,
  state,
  labels,
  onChange,
}: {
  columns: TableColumns;
  state: FilterState;
  labels: Labels;
  onChange: (state: FilterState) => void;
}) {
  const chips = chipsOf(columns, state, labels);
  if (chips.length === 0) return null;
  return (
    <div className="tf-band" role="group" aria-label="Filtre aplicate">
      <span className="tf-band-lab">Filtrat:</span>
      {chips.map((chip) => (
        <span key={chip.id} className="tf-chip">
          {chip.lead && <>{chip.lead} </>}<b>{chip.value}</b>
          <button type="button" aria-label={`Scoate ${chip.lead ? `${chip.lead} ` : ""}${chip.value}`} onClick={() => onChange(chip.without)}>✕</button>
        </span>
      ))}
      {chips.length > 1 && <button type="button" className="tf-band-all" onClick={() => onChange({})}>Scoate toate</button>}
    </div>
  );
}
