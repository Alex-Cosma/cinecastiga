"use client";
import { createContext, useContext } from "react";
import type { AskSpec } from "@/lib/ask/spec";
import type { EvidenceScope } from "@/lib/ask/evidence";
import type { EvidenceFilters } from "@/lib/ask/evidence";
/** `opts`: the drawer's own filters (a channel's part of a bar) and its first order (a bar's largest record, F3). */
export interface EvidenceOpenOpts { filters?: EvidenceFilters; sort?: "value" }
export const AnswerEvidence = createContext<{
  open: (spec?: AskSpec, scope?: EvidenceScope, title?: string, opts?: EvidenceOpenOpts) => void;
  /**
   * "Scoate din calcul" on a row (F4): the applied question without that entity, a new answer that "Înapoi"
   * undoes; `index` is the row's place, whose "⋯" takes the focus once the new answer is drawn.
   */
  exclude?: (entity: { id: string; name: string }, index: number) => void;
} | null>(null);
export const useAnswerEvidence = () => useContext(AnswerEvidence);
