/* A proportional, keyboard-accessible atlas for the domain mockups. */
const NS = "http://www.w3.org/2000/svg";
const XHTML = "http://www.w3.org/1999/xhtml";
const mounted = new WeakMap();
let tooltipSequence = 0;
const palette = ["#315b47", "#52775b", "#8aa17a", "#b2bf97", "#668c82", "#bd916f", "#d5dbc0", "#78946e"];
const money = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
const exactMoney = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 });

function el(name, attributes = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function compactMoney(value) {
  if (value >= 1e9) return `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(value / 1e9)} mld. lei`;
  if (value >= 1e6) return `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 }).format(value / 1e6)} mil. lei`;
  return `${money.format(value)} lei`;
}

function labelColor(color) {
  // Canvas resolves ordinary CSS colors to RGB without external dependencies.
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return "#fffef5";
  context.fillStyle = "#315b47";
  context.fillStyle = color;
  const resolved = context.fillStyle;
  let rgb;
  if (resolved.startsWith("#")) {
    let hex = resolved.slice(1);
    if (hex.length === 3) hex = [...hex].map((character) => character + character).join("");
    rgb = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
  } else {
    rgb = (resolved.match(/[\d.]+/g) || [49, 91, 71]).slice(0, 3).map(Number);
  }
  const luminance = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  return 1.05 / (luminance + 0.05) > (luminance + 0.05) / 0.087 ? "#fffef5" : "#203c2f";
}

/** Squarified layout. Small categories retain their true allocated area. */
function squarify(nodes, width, height) {
  const total = nodes.reduce((sum, node) => sum + node.value, 0);
  if (!total || width <= 0 || height <= 0) return [];
  const pending = nodes.map((node) => ({ node, area: node.value / total * width * height }));
  const tiles = [];
  let remaining = { x: 0, y: 0, width, height };
  const worst = (items, side) => {
    const areas = items.map((item) => item.area);
    const sum = areas.reduce((a, b) => a + b, 0);
    return Math.max(side * side * Math.max(...areas) / (sum * sum), sum * sum / (side * side * Math.min(...areas)));
  };
  let index = 0;
  while (index < pending.length) {
    const side = Math.min(remaining.width, remaining.height);
    const row = [pending[index]];
    let end = index + 1;
    while (end < pending.length && worst([...row, pending[end]], side) <= worst(row, side)) row.push(pending[end++]);
    const area = row.reduce((sum, item) => sum + item.area, 0);
    if (remaining.width >= remaining.height) {
      const column = area / remaining.height;
      let y = remaining.y;
      for (const item of row) {
        const h = item.area / column;
        tiles.push({ node: item.node, x: remaining.x, y, width: column, height: h });
        y += h;
      }
      remaining.x += column;
      remaining.width = Math.max(0, remaining.width - column);
    } else {
      const line = area / remaining.width;
      let x = remaining.x;
      for (const item of row) {
        const w = item.area / line;
        tiles.push({ node: item.node, x, y: remaining.y, width: w, height: line });
        x += w;
      }
      remaining.y += line;
      remaining.height = Math.max(0, remaining.height - line);
    }
    index = end;
  }
  return tiles;
}

/**
 * Mount an atlas and return its cleanup function. Calling again on the same
 * container disposes the previous observer. options: height, ariaLabel,
 * shareLabel, animate, onDetails(code). Tile bodies call onSelect(code); the
 * independent corner buttons call onDetails(code). A companion list represents
 * even the tiniest cells, whose areas are never inflated to fit controls.
 */
export function renderAtlas(container, nodes, onSelect, options = {}) {
  mounted.get(container)?.();
  const data = nodes.filter((node) => Number.isFinite(Number(node.value)) && Number(node.value) > 0)
    .map((node, index) => ({ ...node, value: Number(node.value), color: node.color || palette[index % palette.length] }))
    .sort((a, b) => b.value - a.value);
  const total = data.reduce((sum, node) => sum + node.value, 0);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const containerHeight = () => {
    const style = window.getComputedStyle(container);
    return Math.max(0, container.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0));
  };
  const initialHeight = containerHeight();
  const fallbackHeight = Number(options.height) || initialHeight || 440;
  const svg = el("svg", {
    role: "group",
    "aria-label": options.ariaLabel || "Domeniile achizițiilor. Suprafața fiecărei zone reprezintă ponderea valorii. Alege o zonă pentru subdomenii sau săgeata pentru detalii.",
    preserveAspectRatio: "none",
  });
  svg.style.cssText = `display:block;width:100%;height:${fallbackHeight}px;overflow:visible;isolation:isolate`;
  svg.classList.add("domains-atlas-svg");
  container.replaceChildren(svg);
  const tooltip = document.createElement("div");
  tooltip.id = `domains-atlas-tooltip-${++tooltipSequence}`;
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  tooltip.style.cssText = "position:fixed;z-index:10000;box-sizing:border-box;width:310px;max-width:calc(100vw - 24px);padding:17px 19px;border:1px solid #ced8c6;border-radius:12px;background:#fffef8;color:#203c2f;box-shadow:0 12px 38px #18302526;pointer-events:none;font-family:inherit;font-size:12px;line-height:1.5;text-align:left;overflow:hidden";
  document.body.append(tooltip);
  let hovered = null;
  let focused = null;
  let dismissed = null;
  let tooltipOwner = null;
  let pointer = null;
  let hoveredAction = null;
  let currentGroups = [];
  const actionFor = (node) => node.children?.length ? "Explorează subdomeniile" : "Deschide detaliile";

  function hideTooltip() {
    tooltip.hidden = true;
    tooltipOwner?.removeAttribute("aria-describedby");
    tooltipOwner = null;
  }
  function positionTooltip(item, usePointer) {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
    tooltip.style.maxWidth = `${Math.max(0, width - 24)}px`;
    tooltip.style.maxHeight = `${Math.max(0, height - 24)}px`;
    const box = item.group.getBoundingClientRect();
    const x = usePointer && pointer ? pointer.x : box.left + box.width / 2;
    const y = usePointer && pointer ? pointer.y : box.top;
    const tip = tooltip.getBoundingClientRect();
    let targetY = y - tip.height - 16;
    if (targetY < top + 12) targetY = (usePointer && pointer ? y : box.bottom) + 16;
    tooltip.style.left = `${Math.max(left + 12, Math.min(x + 16, left + width - tip.width - 12))}px`;
    tooltip.style.top = `${Math.max(top + 12, Math.min(targetY, top + height - tip.height - 12))}px`;
  }
  function refreshInteraction() {
    const active = hovered || focused;
    for (const item of currentGroups) {
      item.group.style.opacity = active && active !== item ? ".42" : "1";
      item.outline.setAttribute("opacity", active === item ? "1" : "0");
      item.arrowFace?.setAttribute("fill-opacity", active === item ? ".18" : ".07");
      item.arrowFace?.setAttribute("stroke-opacity", focused === item && document.activeElement === item.arrow ? "1" : ".14");
    }
    if (!active || dismissed === active) { hideTooltip(); return; }
    const { node, share } = active;
    const owner = focused === active && active.group.contains(document.activeElement) ? document.activeElement : active.body;
    if (tooltipOwner !== owner) {
      tooltipOwner?.removeAttribute("aria-describedby");
      tooltipOwner = owner;
      owner.setAttribute("aria-describedby", tooltip.id);
    }
    const description = node.isOther ? `${node.children?.length || ""} domenii grupate` : `CPV ${node.code}`;
    const hint = owner === active.arrow || (active === hovered && hoveredAction === "details") ? "Deschide detaliile și contractele" : actionFor(node);
    const rows = [
      [node.name, "font-size:16px;font-weight:600;line-height:1.3;letter-spacing:-.25px"],
      ...(node.officialName && node.officialName !== node.name ? [[node.officialName, "margin-top:5px;font-size:11px;color:#687561"]] : []),
      [description, "margin-top:9px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:#687561"],
      [`${exactMoney.format(node.value)} lei`, "margin-top:8px;font-size:17px;font-weight:550;font-variant-numeric:tabular-nums;letter-spacing:-.3px"],
      [`${percent.format(share)}% ${options.shareLabel || "din selecție"}`, "margin-top:1px;color:#687561"],
      [`${hint} →`, "margin-top:12px;padding-top:10px;border-top:1px solid #e2e7db;font-weight:550;font-size:11px"],
    ];
    tooltip.replaceChildren(...rows.map(([text, style]) => {
      const row = document.createElement("div"); row.textContent = text; row.style.cssText = style; return row;
    }));
    tooltip.hidden = false;
    positionTooltip(active, active === hovered);
  }
  const dismissTooltip = (event) => {
    if (event.key !== "Escape" || tooltip.hidden) return;
    dismissed = hovered || focused;
    hideTooltip();
    event.preventDefault();
    event.stopPropagation();
  };
  const hideOnViewportChange = () => { hovered = null; pointer = null; refreshInteraction(); };
  document.addEventListener("keydown", dismissTooltip, true);
  window.addEventListener("scroll", hideOnViewportChange, true);
  window.visualViewport?.addEventListener("resize", hideOnViewportChange);
  let disposed = false;
  let observer;
  let frame;
  let firstDraw = true;
  let widthBefore = 0;
  let heightBefore = 0;

  function draw() {
    if (disposed || !svg.isConnected) return;
    const height = Number(options.height) || containerHeight() || fallbackHeight;
    svg.style.height = `${height}px`;
    const box = svg.getBoundingClientRect();
    const width = box.width || container.clientWidth || 960;
    if (width === widthBefore && height === heightBefore) return;
    widthBefore = width;
    heightBefore = height;
    const focusedCode = document.activeElement?.getAttribute("data-atlas-code");
    const focusedAction = document.activeElement?.getAttribute("data-atlas-action");
    hideTooltip(); hovered = null; focused = null; dismissed = null;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.replaceChildren();
    const groups = [];
    const tiles = squarify(data, width, height);
    currentGroups = groups;
    for (const [index, tile] of tiles.entries()) {
      const { node } = tile;
      const share = node.value / total * 100;
      const ink = labelColor(node.color);
      const group = el("g", { "data-atlas-tile": node.code });
      group.style.cssText = `transition:${motion.matches ? "none" : "opacity 170ms ease"}`;
      const body = el("g", {
        role: "button", tabindex: "0", "data-atlas-code": node.code, "data-atlas-action": "explore",
        "aria-label": `${node.name}. ${actionFor(node)}.`,
      });
      body.style.cssText = "cursor:pointer;outline:none";
      group.append(body);
      // The invisible hit area follows the exact layout; painted rectangles
      // have a shared four-pixel gutter, without inflating small categories.
      body.append(el("rect", { x: tile.x, y: tile.y, width: tile.width, height: tile.height, fill: "transparent" }));
      const w = Math.max(0, tile.width - 4), h = Math.max(0, tile.height - 4);
      const face = el("rect", { x: tile.x + 2, y: tile.y + 2, width: w, height: h, rx: Math.min(6, w / 2, h / 2), fill: node.color });
      body.append(face);
      const outline = el("rect", { x: tile.x + 4, y: tile.y + 4, width: Math.max(0, w - 4), height: Math.max(0, h - 4), rx: 4, fill: "none", stroke: ink, "stroke-width": 1.6, opacity: 0, "pointer-events": "none" });
      outline.style.transition = motion.matches ? "none" : "opacity 170ms ease";
      body.append(outline);
      const hasArrow = w >= 70 && h >= 64;
      const roomy = w >= 210 && h >= 150;
      const hasLabel = w >= 108 && h >= 67;
      if (hasLabel) {
        const compact = !roomy && (w < 165 || h < 115);
        const padding = roomy ? 20 : compact ? 8 : 14;
        const nameSize = roomy ? Math.min(23, Math.max(18, w / 18)) : compact ? 12 : 13;
        // Give the title the full tile width above the arrow target. Values can
        // use the remaining space beside it; do not discard a whole bottom row.
        const nameLines = roomy ? 3 : Math.max(1, Math.min(2, Math.floor((h - (hasArrow ? 49 : padding) - padding) / (nameSize * 1.2))));
        const content = el("foreignObject", { x: tile.x + 2 + padding, y: tile.y + 2 + padding, width: Math.max(0, w - 2 * padding), height: Math.max(0, h - 2 * padding), "pointer-events": "none", "aria-hidden": "true" });
        const label = document.createElementNS(XHTML, "div");
        label.style.cssText = `display:flex;flex-direction:column;gap:${roomy ? 9 : 5}px;height:100%;overflow:hidden;color:${ink};font-family:inherit;line-height:1.35;text-align:left;box-sizing:border-box`;
        if (roomy) {
          const code = document.createElementNS(XHTML, "span");
          code.textContent = node.isOther ? `${node.children?.length || ''} DOMENII GRUPATE` : `CPV ${node.code}`;
          code.style.cssText = "font-size:10px;letter-spacing:1.1px;opacity:.75;flex:none";
          label.append(code);
        }
        const name = document.createElementNS(XHTML, "strong");
        name.textContent = node.name;
        name.style.cssText = `font-size:${nameSize}px;line-height:${roomy ? 1.35 : 1.2};font-weight:500;letter-spacing:${roomy ? "-.45px" : "-.1px"};display:-webkit-box;-webkit-line-clamp:${nameLines};-webkit-box-orient:vertical;overflow:hidden;flex-shrink:0`;
        label.append(name);
        if (roomy || h >= 120 || (w >= 170 && h >= 94)) {
          const value = document.createElementNS(XHTML, "span");
          value.textContent = compactMoney(node.value);
          value.style.cssText = `font-size:${roomy ? 18 : 12}px;font-variant-numeric:tabular-nums;letter-spacing:-.25px;opacity:.88;flex:none`;
          if (hasArrow && !roomy) value.style.maxWidth = `${Math.max(0, w - 2 * padding - 44)}px`;
          label.append(value);
        }
        if (roomy) {
          const foot = document.createElementNS(XHTML, "span");
          foot.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:auto;padding-top:12px;font-size:11px;opacity:.8;flex:none";
          const amount = document.createElementNS(XHTML, "span");
          amount.textContent = `${percent.format(share)}% ${options.shareLabel || "din selecție"}`;
          foot.style.paddingRight = "38px";
          foot.append(amount);
          label.append(foot);
        }
        content.append(label);
        body.append(content);
      }
      const item = { group, body, outline, node, share, arrow: null, arrowFace: null };
      const activate = (event, callback) => {
        event.preventDefault(); event.stopPropagation(); hideTooltip();
        callback(String(node.code));
      };
      body.addEventListener("click", (event) => activate(event, onSelect));
      body.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          activate(event, onSelect);
        } else if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? groups.length - 1 : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + groups.length) % groups.length;
          groups[next]?.body.focus();
        }
      });
      if (hasArrow) {
        const size = 44, x = tile.x + tile.width - size - 7, y = tile.y + tile.height - size - 7;
        const arrow = el("g", {
          role: "button", tabindex: "0", "data-atlas-code": node.code, "data-atlas-action": "details",
          "aria-label": `Detalii și contracte — ${node.name}`,
        });
        arrow.style.cssText = "cursor:pointer;outline:none";
        const arrowFace = el("rect", { x: x + 6, y: y + 6, width: 32, height: 32, rx: 9, fill: ink, "fill-opacity": ".07", stroke: ink, "stroke-opacity": ".14", "stroke-width": 1.4 });
        arrow.append(el("rect", { x, y, width: size, height: size, fill: "transparent" }), arrowFace, el("path", { d: `M${x + 16} ${y + 28}l12-12m-11 0h11v11`, fill: "none", stroke: ink, "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round", "pointer-events": "none" }));
        arrow.addEventListener("pointerdown", (event) => event.stopPropagation());
        arrow.addEventListener("click", (event) => activate(event, options.onDetails || onSelect));
        arrow.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") activate(event, options.onDetails || onSelect);
        });
        group.append(arrow); item.arrow = arrow; item.arrowFace = arrowFace;
      }
      group.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "touch") return;
        hovered = item; dismissed = null; hoveredAction = event.target.closest?.("[data-atlas-action]")?.getAttribute("data-atlas-action");
        pointer = { x: event.clientX, y: event.clientY }; refreshInteraction();
      });
      group.addEventListener("pointermove", (event) => {
        if (event.pointerType === "touch") return;
        pointer = { x: event.clientX, y: event.clientY };
        const action = event.target.closest?.("[data-atlas-action]")?.getAttribute("data-atlas-action");
        if (action !== hoveredAction) { hoveredAction = action; refreshInteraction(); }
        if (!tooltip.hidden && hovered === item) positionTooltip(item, true);
      });
      group.addEventListener("pointerleave", () => { if (hovered === item) hovered = null; refreshInteraction(); });
      group.addEventListener("focusin", () => { focused = item; dismissed = null; refreshInteraction(); });
      group.addEventListener("focusout", (event) => {
        if (group.contains(event.relatedTarget)) return;
        if (focused === item) focused = null;
        refreshInteraction();
      });
      groups.push(item);
      svg.append(group);
      if (firstDraw && !motion.matches && options.animate !== false && group.animate) {
        group.animate([{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 250, delay: Math.min(index * 18, 180), easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" });
      }
    }
    if (focusedCode) {
      const item = groups.find((item) => String(item.node.code) === focusedCode);
      (focusedAction === "details" && item?.arrow ? item.arrow : item?.body)?.focus();
    }
    firstDraw = false;
  }
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(schedule);
    observer.observe(container);
  } else window.addEventListener("resize", schedule);
  draw();
  const cleanup = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    document.removeEventListener("keydown", dismissTooltip, true);
    window.removeEventListener("scroll", hideOnViewportChange, true);
    window.visualViewport?.removeEventListener("resize", hideOnViewportChange);
    hideTooltip(); tooltip.remove(); currentGroups = [];
    window.removeEventListener("resize", schedule);
    if (mounted.get(container) === cleanup) mounted.delete(container);
  };
  mounted.set(container, cleanup);
  return cleanup;
}
