"use client";

import { useViewer } from "@/lib/use-viewer";
import Term from "./Term";

/** The (?) beside "Salvează în anchetă": shown only to the viewers who see that button. */
export default function SourceCaptureTip() {
  return useViewer().userId ? <Term id="captura-selectie" tip /> : null;
}
