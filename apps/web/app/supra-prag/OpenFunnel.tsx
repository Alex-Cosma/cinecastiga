"use client";

/**
 * „Toate țările” beside the country chips (UX audit Z6-10): opens the table's „Țara” funnel, which lists every country,
 * after bringing the table's head into view. The funnel is the header's own button (ColumnFilter), found by its label.
 */
export default function OpenFunnel({ label, children }: { label: string; children: React.ReactNode }) {
  return <button type="button" className="tp-all-countries" onClick={() => {
    const button = document.querySelector<HTMLButtonElement>(`#atribuiri-lista button[aria-label^="${label}"]`);
    if (!button) return;
    button.closest("table")?.scrollIntoView({ block: "start" });
    button.click();
  }}>{children}</button>;
}
