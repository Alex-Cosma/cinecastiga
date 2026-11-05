"use client";

import { useEffect } from "react";

// The behaviour of the /metodologie page (MethodologyStory's static markup): the three lanes, the four-step stage,
// the chapter 4 ledger, the score mixer, the folded rules and the copy buttons. Every query is scoped to the page
// root (.mt) and everything mount() adds (listeners, timers, observers, the "Link la" anchors) is undone on unmount,
// so a client navigation or React's double effect in development leaves no trace.

// rf-2026.22 (packages/db/src/profile-flags.ts): a family is its strongest pattern plus 0.4 × the others (caps:
// threshold avoidance 4, relation 2, December 1.25); score = 100 × (1 − Π(1 − 0.2·F)). The points of each pattern are
// split as on the entity page (scorePoints): each family's share of −ln(1 − 0.2·F), split inside the family by what each
// pattern adds, rounded by the largest remainders. The levels are Comuna Exemplara's.
type Code = "split" | "round" | "above" | "dec" | "rel";
type On = Partial<Record<Code, boolean>>;
const X: Record<Code, number> = { split: 1.5232, round: 1.0, above: 1.0, dec: 0.8333, rel: 2.0 };
const ORD: Code[] = ["split", "round", "above", "dec", "rel"];
const FAM: Record<Code, "A" | "C" | "R"> = { split: "A", round: "A", above: "A", dec: "C", rel: "R" };
const NAMES: Record<Code, string> = {
  split: "Adunate, trec de plafon",
  round: "Multe sume imediat sub plafon",
  above: "Declarate directe, peste plafon",
  dec: "Mulți bani contractați în decembrie",
  rel: "O firmă primește mare parte din bani",
};
const STEPS: Code[][] = [["split"], ["split", "round"], ["split", "round", "above"], ["split", "round", "above", "dec"]];
const SINGLE: Partial<Record<Code, number>> = { split: 30, round: 20, above: 20 };
const LANE_NAME: Record<string, string> = { scurt: "Pe scurt", poveste: "Povestea", reguli: "Regulile" };

function parts(on: On) {
  const avoid = (["split", "round", "above"] as Code[]).filter((k) => on[k]).map((k) => X[k]).sort((a, b) => b - a);
  const A = avoid.length ? Math.min(4, Math.min(3, avoid[0]!) + 0.4 * avoid.slice(1).reduce((a, b) => a + b, 0)) : 0;
  return { A, C: on.dec ? Math.min(1.25, X.dec) : 0, R: on.rel ? Math.min(2, X.rel) : 0 };
}

function score(on: On) {
  const p = parts(on);
  return Math.round(100 * (1 - (1 - 0.2 * p.A) * (1 - 0.2 * p.C) * (1 - 0.2 * p.R)));
}

function points(on: On): Partial<Record<Code, number>> {
  const p = parts(on);
  const s = score(on);
  const F = { A: p.A, C: p.C, R: p.R };
  const out: Partial<Record<Code, number>> = {};
  const codes = ORD.filter((k) => on[k]);
  if (!codes.length || !s) return out;
  const terms = codes.map((c) => {
    const mem = codes.filter((k) => FAM[k] === FAM[c]).sort((a, b) => X[b] - X[a] || codes.indexOf(a) - codes.indexOf(b));
    const adds = mem.map((k, i) => (i === 0 ? Math.min(3, X[k]) : 0.4 * X[k]));
    const sum = adds.reduce((a, b) => a + b, 0);
    return sum > 0 ? (-Math.log(1 - 0.2 * F[FAM[c]]) * adds[mem.indexOf(c)]!) / sum : 0;
  });
  const tot = terms.reduce((a, b) => a + b, 0);
  const ex = terms.map((v) => (s * v) / tot);
  const fl = ex.map((v) => Math.floor(v));
  let rest = s - fl.reduce((a, b) => a + b, 0);
  ex.map((e, i) => [e - fl[i]!, i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .forEach(([, i]) => {
      if (rest > 0) {
        fl[i]! += 1;
        rest -= 1;
      }
    });
  codes.forEach((c, i) => (out[c] = fl[i] ?? 0));
  return out;
}

const band = (s: number) => (s < 10 ? "fără semnal în scor" : s >= 68 ? "pronunțat" : s >= 40 ? "moderat" : "slab");

function mount(root: HTMLElement): () => void {
  const ac = new AbortController();
  const signal = ac.signal;
  const cleanups: Array<() => void> = [];
  const q = <T extends Element = HTMLElement>(s: string, r: ParentNode = root) => r.querySelector<T>(s);
  const qa = <T extends Element = HTMLElement>(s: string, r: ParentNode = root) => Array.from(r.querySelectorAll<T>(s));
  const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K | string, fn: (e: Event) => void, opts?: AddEventListenerOptions) =>
    el.addEventListener(type, fn, { ...opts, signal });
  const say = (text: string) => {
    const lv = q("#live");
    if (lv) lv.textContent = text;
  };
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  // The site's sticky header covers the top of the viewport; anchors, the lanes and the ledger stop below it.
  const header = document.querySelector<HTMLElement>(".site-header");
  const hdr = () => (header && getComputedStyle(header).position === "sticky" ? header.getBoundingClientRect().height : 0);
  function measure() {
    root.style.setProperty("--mt-hdr", hdr() + "px");
    const wrap = root.parentElement;
    if (wrap) root.style.setProperty("--mt-gutter", getComputedStyle(wrap).paddingLeft || "16px");
  }
  measure();
  on(window, "resize", measure, { passive: true });

  // The "Ce crezi?" questions: one answer shows its reveal and everything marked data-after.
  qa(".mt-ask").forEach((box) => {
    qa<HTMLButtonElement>(".mt-opt", box).forEach((b) =>
      on(b, "click", () => {
        qa(".mt-opt", box).forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
        qa(".mt-reveal", box).forEach((r) => {
          r.hidden = r.dataset.for !== b.dataset.a;
          if (!r.hidden) say((r.textContent ?? "").replace(/\s+/g, " ").trim());
        });
        qa("[data-after]", box).forEach((r) => (r.hidden = false));
      }),
    );
  });

  // Chapter 4: the ledger follows the four patterns of Comuna Exemplara as they scroll past.
  const P4 = points({ split: true, round: true, above: true, dec: true });
  const SPLIT4 = (["split", "round", "above", "dec"] as Code[]).map((k) => P4[k]).join(" + ");
  const LAST = STEPS.map((s) => NAMES[s[s.length - 1]!]);
  function ledger(n: number) {
    const st: On = {};
    (STEPS[n - 1] ?? []).forEach((k) => (st[k] = true));
    const s = n ? score(st) : 0;
    const tot = q("#lg-tot");
    if (!tot) return;
    tot.textContent = String(s);
    const g = q("#lg-g");
    if (g) g.style.width = s + "%";
    const b = q("#lg-band");
    if (b) b.textContent = n ? "scor " + band(s) : "niciun tipar încă";
    const last = q("#lg-last");
    if (last) last.textContent = n === 4 ? "Pe pagina comunei: " + SPLIT4 + " · " + band(s) : n ? LAST[n - 1] + " · " + band(s) : "scorul crește cu fiecare tipar găsit";
    qa(".mt-ledger li").forEach((li) => li.classList.toggle("mt-on", Number(li.dataset.l) <= n));
    q(".mt-ledger")?.classList.toggle("mt-all", n === 4);
  }
  const evs = qa(".mt-ev");
  function onScroll() {
    const y = window.innerHeight * 0.55;
    let n = 0;
    evs.forEach((e, i) => {
      if (e.getBoundingClientRect().top < y) n = i + 1;
    });
    if (n === 0 && evs.length && evs[0]!.getBoundingClientRect().top < 0) n = evs.length;
    ledger(n);
    const yr = q(".mt-year");
    const lg = q(".mt-ledger");
    if (yr && lg) lg.classList.toggle("mt-done", yr.getBoundingClientRect().bottom < hdr() + 160);
  }
  on(window, "scroll", onScroll, { passive: true });
  onScroll();

  // Chapter 5: the mixer, patterns on and off.
  const mixOn: On = { split: true, round: true, above: true, dec: true, rel: false };
  let mixReady = false;
  function mix() {
    const mx = q("#mx");
    if (!mx) return;
    const s = score(mixOn);
    const p = parts(mixOn);
    mx.textContent = String(s);
    const mb = q("#mx-b");
    if (mb) mb.textContent = band(s);
    const mk = q("#mx-mk");
    if (mk) mk.style.left = s + "%";
    const avoid = (["split", "round", "above"] as Code[]).filter((k) => mixOn[k]);
    const A = Math.round(20 * p.A);
    const lines: string[] = [];
    const fams = (avoid.length ? 1 : 0) + (mixOn.dec ? 1 : 0) + (mixOn.rel ? 1 : 0);
    if (avoid.length) lines.push("Familia plafonului, singură: " + avoid.map((k, i) => (i ? "40% din " : "") + SINGLE[k]).join(" + ") + " = <b>" + A + "</b>");
    if (mixOn.dec) lines.push("Decembrie, singur: <b>" + Math.round(20 * p.C) + "</b>");
    if (mixOn.rel) lines.push("O firmă primește mare parte din bani, singur: <b>" + Math.round(20 * p.R) + "</b>");
    lines.push((fams > 1 ? "Împreună, fiecare familie umple doar din ce a rămas gol: " : "Scor: ") + "<b>" + s + " din 100</b>");
    const pt = points(mixOn);
    const pl = ORD.filter((k) => mixOn[k] && (pt[k] ?? 0) > 0).map((k) => NAMES[k] + " " + pt[k]);
    if (pl.length > 1) lines.push("Pe pagina comunei: " + pl.join(" · "));
    const math = q("#mx-math");
    if (math) math.innerHTML = lines.map((l) => "<li>" + l + "</li>").join("");
    const mg = q("#mx-grid");
    if (mg) {
      const dd = mixOn.dec ? Math.round(0.2 * p.C * (100 - A)) : 0;
      const rr = mixOn.rel ? s - A - dd : 0;
      qa("i", mg).forEach((c, i) => (c.className = i < A ? "mt-g" : i < A + dd ? "mt-o" : i < A + dd + rr ? "mt-a" : "mt-e"));
    }
    let t: string;
    if (s === 0) t = "Fără tipare, scorul e 0. Asta nu dovedește că totul e în regulă: doar că tiparele noastre nu apar.";
    else if (fams === 1 && avoid.length > 1) t = "Toate din aceeași familie: primul intră întreg, celelalte cu 40%. De aceea scorul nu crește mult.";
    else if (fams === 1) t = "Un singur fel de tipar. Un tipar singur nu trece de 60 de puncte.";
    else if (s >= 68) t = "Tipare din mai multe familii, destul de mari: de aici începe scorul „pronunțat”.";
    else t = "Familii diferite: fiecare familie nouă umple doar o parte din pătrățelele goale, deci scorul nu trece niciodată de 100.";
    const why = q("#mx-why");
    if (why) why.textContent = t;
    const lv = q("#mx-live");
    if (lv && mixReady) lv.textContent = "Scor " + s + " din 100, " + band(s) + "." + (pl.length > 1 ? " Pe pagina comunei: " + pl.join(", ") + "." : "");
  }
  qa<HTMLButtonElement>(".mt-tg").forEach((b) =>
    on(b, "click", () => {
      const k = b.dataset.k as Code;
      mixOn[k] = !mixOn[k];
      b.setAttribute("aria-pressed", String(!!mixOn[k]));
      mix();
    }),
  );
  mix();
  mixReady = true;

  // The reading progress bar.
  const pr = q("#prog-i");
  function prog() {
    if (!pr) return;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    pr.style.width = (h > 0 ? Math.min(100, (100 * window.scrollY) / h) : 0) + "%";
  }
  on(window, "scroll", prog, { passive: true });
  prog();
  // Three lanes in one page; a link into a hidden lane opens that lane.
  const laneNav = q(".mt-lanes");
  const tabs = laneNav ? qa<HTMLButtonElement>("[role=tab]", laneNav) : [];
  const laneEls: Record<string, HTMLElement | null> = {};
  ["scurt", "poveste", "reguli"].forEach((k) => (laneEls[k] = q("#lane-" + k)));
  const laneTop = () => (laneNav ? laneNav.getBoundingClientRect().top + window.scrollY - hdr() - 8 : 0);
  function setLane(k: string, scroll: boolean) {
    if (!laneEls[k]) return;
    Object.keys(laneEls).forEach((n) => {
      const el = laneEls[n];
      if (el) el.hidden = n !== k;
    });
    tabs.forEach((t) => {
      const sel = t.dataset.lane === k;
      t.setAttribute("aria-selected", String(sel));
      t.tabIndex = sel ? 0 : -1;
    });
    if (scroll && laneNav && window.scrollY > laneTop()) window.scrollTo({ top: laneTop() });
    onScroll();
    prog();
    if (scroll) say(LANE_NAME[k] ?? "");
  }
  tabs.forEach((t, i) => {
    on(t, "click", () => setLane(t.dataset.lane ?? "", true));
    on(t, "keydown", (e) => {
      const key = (e as KeyboardEvent).key;
      const j = key === "ArrowRight" ? i + 1 : key === "ArrowLeft" ? i - 1 : -1;
      if (j < 0 || j >= tabs.length) return;
      e.preventDefault();
      tabs[j]!.focus();
      setLane(tabs[j]!.dataset.lane ?? "", true);
    });
  });
  qa("[data-go]").forEach((g) =>
    on(g, "click", () => {
      const k = g.dataset.go ?? "";
      setLane(k, false);
      if (laneNav) window.scrollTo({ top: laneTop() });
      say(LANE_NAME[k] ?? "");
    }),
  );

  // Every rule gets an id and a "Link la" anchor at the end of its body.
  qa<HTMLDetailsElement>(".mt-ref > details").forEach((d) => {
    const s = q("summary", d);
    if (!s) return;
    const title = (s.textContent ?? "").trim();
    if (!d.id)
      d.id = "r-" + title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    const body = q(".mt-body", d);
    if (body) {
      const p = document.createElement("p");
      p.className = "mt-anc";
      const a = document.createElement("a");
      a.href = "#" + d.id;
      a.textContent = "Link la: " + title;
      p.appendChild(a);
      body.appendChild(p);
      cleanups.push(() => p.remove());
    }
  });
  const oa = q<HTMLButtonElement>(".mt-openall");
  if (oa)
    on(oa, "click", () => {
      const open = oa.getAttribute("aria-pressed") !== "true";
      oa.setAttribute("aria-pressed", String(open));
      oa.textContent = open ? "Închide toate regulile" : "Deschide toate regulile";
      qa<HTMLDetailsElement>(".mt-ref details").forEach((d) => (d.open = open));
    });

  function openTarget(id: string, initial = false) {
    const el = id ? document.getElementById(id) : null;
    if (!el || !root.contains(el)) return;
    const l = el.closest<HTMLElement>(".mt-lane");
    let switched = false;
    if (l && l.hidden) {
      setLane(l.id.slice(5), false);
      switched = true;
    }
    const d = el.closest("details");
    if (el instanceof HTMLDetailsElement) el.open = true;
    if (d) d.open = true;
    if (switched && l?.id === "lane-poveste") {
      const jn = q("#jumpnote");
      const sec = el.closest<HTMLElement>(".mt-ch");
      if (jn && sec && sec.id !== "urma") {
        const hh = q("h2", sec);
        const chn = hh ? q(".mt-ch-n", hh) : null;
        const title = hh ? (hh.textContent ?? "").replace(chn?.textContent ?? "", "").trim() : "";
        jn.replaceChildren();
        const b = document.createElement("b");
        b.textContent = "Ai sărit în „Povestea”" + (chn ? ", " + (chn.textContent ?? "").toLowerCase() : "") + ":";
        const back = document.createElement("button");
        back.type = "button";
        back.textContent = "Înapoi la „Pe scurt”";
        const first = document.createElement("a");
        first.href = "#urma";
        first.textContent = "De la capitolul 1";
        jn.append(b, " " + title + " ", back, " ", first);
        jn.hidden = false;
        sec.parentNode?.insertBefore(jn, sec);
        on(back, "click", () => {
          jn.hidden = true;
          setLane("scurt", false);
          window.scrollTo({ top: laneTop() });
        });
      }
    }
    if (switched || initial) {
      const go = (focus: boolean) => {
        // On a first load the router's own hash scroll, the fonts and the coverage data can still move the target;
        // scroll again only while it is not where it should be (just under the site header).
        const top = el.getBoundingClientRect().top - hdr();
        if (top < 0 || top > 40) el.scrollIntoView({ block: "start" });
        if (!focus) return;
        const f = el instanceof HTMLDetailsElement ? q("summary", el) : el;
        if (f) {
          if (!f.hasAttribute("tabindex")) f.setAttribute("tabindex", "-1");
          f.focus({ preventScroll: true });
        }
      };
      const timers = (initial ? [60, 250, 700] : [0]).map((ms, i) => window.setTimeout(() => go(i === 0), ms));
      cleanups.push(() => timers.forEach((t) => window.clearTimeout(t)));
    }
  }
  on(window, "hashchange", () => openTarget(location.hash.slice(1)));
  on(root, "click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href^='#']");
    if (a && root.contains(a)) openTarget((a.getAttribute("href") ?? "").slice(1));
  });
  if (location.hash) openTarget(location.hash.slice(1), true);

  const all = q<HTMLButtonElement>(".mt-allcalc");
  if (all)
    on(all, "click", () => {
      const open = all.getAttribute("aria-pressed") !== "true";
      all.setAttribute("aria-pressed", String(open));
      all.textContent = open ? "Ascunde calculele" : "Arată toate calculele";
      qa<HTMLDetailsElement>("details.mt-sock").forEach((d) => {
        if (!d.classList.contains("mt-aux") && !d.classList.contains("mt-role")) d.open = open;
      });
    });
  if (window.innerWidth >= 980) qa<HTMLDetailsElement>("details.mt-tpl, .mt-brief details.mt-more").forEach((d) => (d.open = true));

  // The 100 squares fill in order, family by family.
  function fillGrid(g: HTMLElement | null, delay: number) {
    if (!g || g.classList.contains("mt-on")) return;
    let k = 0;
    let prev = "";
    qa("i", g).forEach((c) => {
      const cl = c.className;
      if (cl === "mt-e" || !cl) {
        c.style.transitionDelay = "0ms";
        return;
      }
      if (cl !== prev) {
        k += prev ? 10 : 0;
        prev = cl;
      }
      c.style.transitionDelay = (reduce ? 0 : delay * k) + "ms";
      k++;
    });
    g.classList.add("mt-on");
  }
  const g5 = q("#g5");
  if (g5) {
    if (reduce || !("IntersectionObserver" in window)) fillGrid(g5, 0);
    else {
      const io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (e.isIntersecting) {
              fillGrid(g5, 22);
              io.disconnect();
            }
          }),
        { threshold: 0.4 },
      );
      io.observe(g5);
      cleanups.push(() => io.disconnect());
    }
  }

  // The four-step stage: the steps 1–4, a swipe and the share icon (owner, 5 Nov 2026: no Play button).
  const stage = q(".mt-stage");
  if (stage) {
    const frs = qa(".mt-fr", stage);
    const dots = qa<HTMLButtonElement>(".mt-steps-n button", stage);
    const live = q(".mt-st-live", stage);
    const hnum = q("#hnum");
    let cur = 1;
    let raf = 0;
    const countUp = () => {
      if (!hnum) return;
      if (reduce) {
        hnum.textContent = "55";
        return;
      }
      const t0 = performance.now();
      hnum.textContent = "0";
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 1900);
        hnum.textContent = String(Math.round(55 * k));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      step(t0);
    };
    const show = (n: number, announce: boolean) => {
      cur = n;
      stage.dataset.fr = String(n);
      frs.forEach((f, i) => f.classList.toggle("mt-on", i + 1 === n));
      dots.forEach((d, i) => (i + 1 === n ? d.setAttribute("aria-current", "step") : d.removeAttribute("aria-current")));
      const sk = q("#st-k");
      if (sk) sk.textContent = String(n);
      if (n === 4) {
        const g = q("#hg");
        if (g && !g.classList.contains("mt-on")) {
          fillGrid(g, 22);
          countUp();
        }
      }
      if (announce && live) {
        const fc = q("figcaption", frs[n - 1]!);
        if (fc) live.textContent = "Pasul " + n + " din 4. " + (q("b", fc)?.textContent ?? "") + " " + (q("span", fc)?.textContent ?? "");
      }
    };
    dots.forEach((d, i) =>
      on(d, "click", () => show(i + 1, true)),
    );
    let tx: number | null = null;
    on(stage, "touchstart", (e) => (tx = (e as TouchEvent).touches[0]?.clientX ?? null), { passive: true });
    on(
      stage,
      "touchend",
      (e) => {
        if (tx === null) return;
        const dx = ((e as TouchEvent).changedTouches[0]?.clientX ?? tx) - tx;
        tx = null;
        if (Math.abs(dx) < 40) return;
        show(dx < 0 ? (cur < 4 ? cur + 1 : 1) : cur > 1 ? cur - 1 : 4, true);
      },
      { passive: true },
    );
    const sh = q<HTMLButtonElement>(".mt-st-share", stage);
    const toast = q(".mt-st-toast", stage);
    let tt = 0;
    const flash = (msg: string) => {
      if (live) live.textContent = msg;
      if (toast) {
        toast.textContent = msg;
        toast.hidden = false;
        window.clearTimeout(tt);
        tt = window.setTimeout(() => (toast.hidden = true), 2200);
      }
    };
    if (sh)
      on(sh, "click", () => {
        const data = { title: document.title, text: "Cum citim banii publici: scorul, în patru pași", url: location.href.split("#")[0] + "#stage-t" };
        if (navigator.share) navigator.share(data).catch(() => {});
        else
          try {
            navigator.clipboard.writeText(data.url).then(
              () => flash("Link copiat"),
              () => flash("Copiază adresa din bara browserului"),
            );
          } catch {
            flash("Copiază adresa din bara browserului");
          }
      });
    if (reduce) {
      frs.forEach((f) => f.classList.add("mt-on"));
      fillGrid(q("#hg"), 0);
    } else show(1, false);
    cleanups.push(() => {
      window.clearTimeout(tt);
      cancelAnimationFrame(raf);
    });
  }

  qa(".mt-term").forEach((b) =>
    on(b, "click", () => {
      const d = b.nextElementSibling as HTMLElement | null;
      const open = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(open));
      if (d) d.hidden = !open;
    }),
  );
  qa<HTMLButtonElement>("[data-copy]").forEach((b) =>
    on(b, "click", () => {
      const src = document.getElementById(b.dataset.copy ?? "");
      if (!src) return;
      try {
        navigator.clipboard.writeText(src.textContent ?? "").then(
          () => {
            b.textContent = "Copiat";
            say("Copiat");
          },
          () => {},
        );
      } catch {}
    }),
  );

  return () => {
    ac.abort();
    cleanups.forEach((f) => f());
  };
}

export default function MethodologyBehavior({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    return root ? mount(root) : undefined;
  }, [rootId]);
  return null;
}
