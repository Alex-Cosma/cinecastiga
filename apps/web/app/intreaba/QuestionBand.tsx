"use client";

import { useEffect, useState } from "react";
import type { AskSpec } from "../../lib/ask/spec";
import { questionGist } from "./question-band";

/**
 * On a phone, the question at hand after its title has scrolled away (UX audit Z2-37, 16 November 2026): an opaque
 * 48 px band under the header, shown only while the header is condensed (scrolling down, SiteNav's data-condensed),
 * so header and band stay under 108 px together, and only while the answer's title is above the header. „Schimbă ›”
 * opens the builder, as „Schimbă întrebarea” does.
 */
export default function QuestionBand({ spec, cpvName, title, onChange }: { spec: AskSpec; cpvName?: string | undefined; title: string; onChange: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const phone = window.matchMedia("(max-width: 700px)");
    const header = document.querySelector<HTMLElement>(".site-header");
    let frame = 0;
    const check = () => {
      frame = 0;
      const heading = document.getElementById("raspuns-titlu");
      if (!phone.matches || !header || !heading) { setShown(false); return; }
      setShown(header.dataset.condensed === "true" && heading.getBoundingClientRect().bottom < header.getBoundingClientRect().bottom);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(check); };
    const watch = header ? new MutationObserver(queue) : null;
    if (header) watch!.observe(header, { attributes: true, attributeFilter: ["data-condensed"] });
    window.addEventListener("scroll", queue, { passive: true });
    phone.addEventListener("change", queue);
    check();
    return () => { cancelAnimationFrame(frame); watch?.disconnect(); window.removeEventListener("scroll", queue); phone.removeEventListener("change", queue); };
  }, []);
  /**
   * The builder opens and comes into view under the whole header: going up brings the header's logo row back, so the
   * builder's title is placed under the header's full height, not its condensed one.
   */
  const change = () => {
    onChange();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const heading = document.getElementById("ia-builder-title"), header = document.querySelector<HTMLElement>(".site-header");
      if (!heading) return;
      const whole = (header?.getBoundingClientRect().height ?? 0) + (parseFloat(header?.style.getPropertyValue("--site-header-fold") ?? "") || 0);
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
      window.scrollTo({ top: Math.max(0, heading.getBoundingClientRect().top + window.scrollY - whole - 12), behavior });
      heading.focus({ preventScroll: true });
    }));
  };
  const gist = questionGist(spec, cpvName) ?? { lead: title, rest: [] };
  return (
    <div className="ia-qband" hidden={!shown} role="region" aria-label="Întrebarea">
      <p className="ia-qband-q"><strong>{gist.lead}</strong>{gist.rest.length > 0 && <span> · {gist.rest.join(" · ")}</span>}</p>
      {/* Esențial (lib/view-mode.ts): it opens the builder, Complet's; the question stays in the band. */}
      <button type="button" className="ia-qband-go" onClick={change} data-only="complet">Schimbă<span aria-hidden="true">›</span></button>
    </div>
  );
}
