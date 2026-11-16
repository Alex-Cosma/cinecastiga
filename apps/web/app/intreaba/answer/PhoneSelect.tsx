"use client";

import { useId } from "react";
import HelpTip from "../builder/HelpTip";
import type { KitTip } from "../builder/kit-types";

/*
 * A strip's choice as one native menu on a phone (UX audit Z3-28, as the risk cloud's „Semnal”, 15 November 2026): the
 * same options and value as the segmented control beside it, which a phone hides (question-results.css). Its label and
 * its (?) stay together before the menu („Grupele, față de (?) [2025 ▾]”), the words after it follow it („firme”).
 */
export default function PhoneSelect({ label, after, tip, value, options, onChange }: {
  label: string;
  after?: string;
  tip?: KitTip;
  value: string;
  options: readonly { value: string; label: string; disabled?: boolean | string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return <span className="cq-phone-select">
    <span className="qb-strip-label" id={id}>{label}</span>
    {tip && <HelpTip tip={tip} />}
    <select aria-labelledby={id} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
      {options.map((option) => <option key={option.value} value={option.value} disabled={Boolean(option.disabled)}>{option.label}</option>)}
    </select>
    {after && <span className="qb-strip-label">{after}</span>}
  </span>;
}
