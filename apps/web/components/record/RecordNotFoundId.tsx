"use client";

import { usePathname } from "next/navigation";

const VALID_ID = /^[1-9]\d{0,17}$/;

/**
 * The missing record's title: the id from the address (a not-found page receives no params; the client reads the
 * path, as NotFoundAddress does). "Nu avem contractul cu ID-ul 999999999999 în date" (UX audit Z7-28).
 */
export default function RecordNotFoundId({ noun, none }: { noun: string; none: string }) {
  const last = (usePathname() ?? "").split("/").filter(Boolean)[1] ?? "";
  const id = VALID_ID.test(last) ? last : null;
  return <h1 className="page-title">{id ? <>Nu avem {noun} cu ID-ul <span className="nowrap">{id}</span> în date</> : none}</h1>;
}
