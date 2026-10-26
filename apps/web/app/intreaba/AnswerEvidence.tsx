"use client";
import { createContext, useContext } from "react";
import type { AskSpec } from "@/lib/ask/spec";
import type { EvidenceFilters, EvidenceScope } from "@/lib/ask/evidence";
export const AnswerEvidence = createContext<{
  /** `filters`: the drawer opens on them (a verification's channel: "Achizițiile directe"). */
  open: (spec?: AskSpec, scope?: EvidenceScope, title?: string, filters?: EvidenceFilters) => void;
} | null>(null);
export const useAnswerEvidence = () => useContext(AnswerEvidence);
