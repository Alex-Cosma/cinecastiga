import { cloneQuestion } from "../../question-ui";
import { READ_AHEAD_KEYS } from "../../spec";
import type { AnswerForm, EngineLevel, FilterDef, FilterSpec, Scope, SpecPath } from "../types";

/** The spec as a plain object, for the block options addressed by name. */
const loose = (spec: FilterSpec) => spec as unknown as Record<string, unknown>;

/** The spec after `change`, with nothing shared with `spec` (cloneQuestion copies at every depth). */
export function edited(spec: FilterSpec, change: (next: FilterSpec) => void): FilterSpec {
  const next = cloneQuestion(spec);
  change(next);
  return next;
}

/** QuestionBuilder updateFilter: an empty value removes the key. */
export function setFilters(spec: FilterSpec, values: Record<string, string | number | boolean | undefined>): FilterSpec {
  return edited(spec, (next) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === "") delete next.filters[key];
      else next.filters[key] = value;
    }
  });
}

export const levels = (forms: readonly AnswerForm[], level: EngineLevel): Partial<Record<AnswerForm, EngineLevel>> =>
  Object.fromEntries(forms.map((form) => [form, level]));

export const alwaysScope = (scope: Scope) => (): Scope => scope;

/**
 * A key read ahead of the engine (F0a): offered nowhere, applied nowhere, until
 * its stage implements it. Its sample is the well-formed value the contract
 * tests parse on `block` and expect the engine to refuse as newer.
 */
export function readAhead<V>(def: {
  id: FilterDef["id"]; keys: readonly (SpecPath & keyof typeof READ_AHEAD_KEYS)[]; placement: FilterDef["placement"]; control: FilterDef["control"];
  label: string; windowTitle?: string; scope: Scope; sample: NonNullable<FilterDef<V>["sample"]>;
}): FilterDef<V> {
  // One key: its value. Several (newSince with newScope): an object of their sub-keys.
  const paths = def.keys.map((key) => key.split(".") as [string, string]);
  const get = (spec: FilterSpec, [head, sub]: [string, string]): unknown =>
    head === "filters" ? spec.filters[sub] : (loose(spec)[head] as Record<string, unknown> | undefined)?.[sub];
  const put = (next: FilterSpec, [head, sub]: [string, string], value: unknown) => {
    if (head === "filters") {
      if (value === undefined) delete next.filters[sub];
      else next.filters[sub] = value as string | number | boolean;
      return;
    }
    const options = { ...(loose(next)[head] as Record<string, unknown> | undefined) };
    if (value === undefined) delete options[sub];
    else options[sub] = value;
    if (Object.keys(options).length) loose(next)[head] = options;
    else delete loose(next)[head];
  };
  return {
    id: def.id, keys: def.keys, placement: def.placement, control: def.control, label: def.label,
    ...(def.windowTitle ? { windowTitle: def.windowTitle } : {}),
    engine: {}, scope: alwaysScope(def.scope), stage: READ_AHEAD_KEYS[def.keys[0]!],
    read: (spec) => {
      if (paths.length === 1) return get(spec, paths[0]!) as V | undefined;
      const value = Object.fromEntries(paths.map((path) => [path[1], get(spec, path)]).filter(([, v]) => v !== undefined));
      return (Object.keys(value).length ? value : undefined) as V | undefined;
    },
    write: (spec, value) => edited(spec, (next) => {
      if (paths.length === 1) { put(next, paths[0]!, value); return; }
      for (const path of paths) put(next, path, (value as Record<string, unknown> | undefined)?.[path[1]]);
    }),
    choices: () => [],
    sample: def.sample,
  };
}
