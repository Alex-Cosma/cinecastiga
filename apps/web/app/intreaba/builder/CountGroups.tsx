"use client";

import { useId } from "react";
import HelpTip, { DisabledReason } from "./HelpTip";
import { rovingKeyDown, rovingStop } from "./keyboard";
import type { ChangeSource, KitTip } from "./kit-types";

/*
 * Component 8, the groups with counts: the question's lens word in the answer
 * ("Creșteri 28.670 · +45,3 mld"), for the kind of change (trend) and which
 * partners (network). The count and the sum are part of each group's name. A
 * click switches the list in data already fetched (the caller uses
 * history.replaceState, plan §2.3); an empty group stays, disabled. No
 * composition bar (kit §5.10): the shape of the swatch tells the groups
 * apart, never colour alone.
 */

export type GroupSwatch = "all" | "up" | "new" | "down" | "gone";

export interface CountGroup {
  value: string;
  name: string;
  /** "28.670 · +45,3 mld", formatted upstream. */
  count: string;
  swatch?: GroupSwatch;
  disabled?: boolean | string;
  /** "Toate": a whole row on phones. */
  all?: boolean;
  className?: string;
}

export interface CountGroupsProps {
  label: string;
  groups: readonly CountGroup[];
  value: string | null;
  onChange?: (value: string, source: ChangeSource) => void;
  /** "Firme în 2024 sau 2025: 96.929 (?)" above the groups. */
  head?: { text: string; total: string; tip?: KitTip };
}

export default function CountGroups({ label, groups, value, onChange, head }: CountGroupsProps) {
  const base = useId();
  const checked = groups.findIndex(group => group.value === value);
  const stop = rovingStop(checked, groups.map(group => !!group.disabled));
  return <>
    {head && <p className="fk-groups-head fk-tipwrap">{head.text} <b>{head.total}</b>{head.tip && <HelpTip tip={head.tip} />}</p>}
    <div
      className="fk-groups"
      role="radiogroup"
      aria-label={label}
      data-roving=""
      onKeyDown={event => rovingKeyDown(event, '[role="radio"]', "both", index => { const next = groups[index]; if (next) onChange?.(next.value, "move"); })}
    >
      {groups.map((group, index) => {
        const on = index === checked;
        return <button
          key={group.value}
          type="button"
          className={`fk-group${group.all ? " fk-group--all" : ""}${group.className ? ` ${group.className}` : ""}`}
          role="radio"
          aria-checked={on}
          aria-disabled={group.disabled ? true : undefined}
          aria-describedby={typeof group.disabled === "string" ? `${base}-r${index}` : undefined}
          tabIndex={index === stop ? 0 : -1}
          onClick={() => { if (!group.disabled && !on) onChange?.(group.value, "activate"); }}
        >
          <span className="fk-group-name">{group.swatch && <i className={`fk-sw fk-sw--${group.swatch}`} aria-hidden="true" />}{group.name}</span>
          <span className="fk-group-n">{group.count}</span>
        </button>;
      })}
      {groups.map((group, index) => typeof group.disabled === "string" && <DisabledReason key={`r${index}`} id={`${base}-r${index}`} reason={group.disabled} />)}
    </div>
  </>;
}
