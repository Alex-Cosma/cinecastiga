"use client";
import { createContext, useContext } from "react";
import type { AskSpec } from "@/lib/ask/spec";
import type { EvidenceScope } from "@/lib/ask/evidence";
export const AnswerEvidence = createContext<{
  open: (spec?: AskSpec, scope?: EvidenceScope, title?: string) => void;
} | null>(null);
export const useAnswerEvidence = () => useContext(AnswerEvidence);
