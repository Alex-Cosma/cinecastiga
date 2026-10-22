/**
 * Example questions written as a person would ask them, grouped by what they
 * want to find out. Each one is understood by the rules interpreter
 * (lib/intent); `fill` examples put a half-written question in the box for
 * the person to finish.
 */
export interface AskExample {
  text: string;
  /** Put this in the box and let the person finish it, instead of asking. */
  fill?: string;
}

export interface AskExampleGroup {
  id: string;
  title: string;
  note?: string;
  examples: AskExample[];
}

export const ASK_EXAMPLE_GROUPS: AskExampleGroup[] = [
  {
    id: "money",
    title: "Unde se duc banii",
    examples: [
      { text: "Pe ce cheltuie primăria din Râmnicu Sărat?" },
      { text: "Cât au costat medicamentele spitalelor din Cluj în 2024?" },
      { text: "Cum au evoluat achizițiile de lemne de foc ale comunelor din Vaslui?" },
    ],
  },
  {
    id: "winners",
    title: "Cine câștigă",
    examples: [
      { text: "Cine face iluminatul în Buzău și cât costă?" },
      { text: "Ce firme câștigă contractele de drumuri din Prahova?" },
      { text: "Cine vinde laptopuri școlilor din Iași?" },
    ],
  },
  {
    id: "entity",
    title: "O firmă sau instituție anume",
    examples: [
      { text: "Ce cumpără Spitalul Județean de Urgență Buzău?" },
      { text: "De la cine cumpără primăria Buzău?" },
      { text: "Cu ce instituții lucrează firma …", fill: "Cu ce instituții lucrează firma " },
    ],
  },
  {
    id: "signals",
    title: "Ce merită verificat",
    note: "Semnalele sunt piste de verificat, nu dovezi.",
    examples: [
      { text: "Ce instituții din județul Buzău ies din tipar?" },
      { text: "Care spital are cel mai ridicat indice de risc?" },
      { text: "Contracte cu un singur ofertant în județul Vaslui" },
    ],
  },
];

/** One example per goal, for the "not understood" answer. */
export const FALLBACK_EXAMPLES: AskExample[] = ASK_EXAMPLE_GROUPS.map((group) => group.examples.find((e) => !e.fill)!);
