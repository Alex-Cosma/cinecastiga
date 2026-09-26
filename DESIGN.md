---
name: "cinecâștigă?"
description: "The existing forest-green and ivory procurement investigation interface."
colors:
  paper: "#f7f8f2"
  surface: "#fffefa"
  sunk: "#edf0e5"
  ink: "#243a30"
  ink-secondary: "#3f5043"
  muted: "#6c746b"
  line: "#dfe3d8"
  line-strong: "#cbd4c3"
  accent: "#204c3c"
  accent-ink: "#173e2e"
  accent-soft: "#e6eddd"
  accent-line: "#b8c9a8"
  on-accent: "#fffefa"
  orange: "#c7522d"
  risk: "#c0311c"
  risk-soft: "#fbe4df"
  amber-soft: "#fbefd6"
  dark-paper: "#111d18"
  dark-surface: "#18271f"
  dark-sunk: "#203328"
  dark-ink: "#e7eddf"
  dark-ink-secondary: "#ccd8c4"
  dark-muted: "#a5b39e"
  dark-line: "#314437"
  dark-line-strong: "#456047"
  dark-accent: "#c0d8ad"
  dark-accent-ink: "#d1e6bf"
  dark-accent-soft: "#263e2b"
  dark-accent-line: "#526c47"
  dark-on-accent: "#18271f"
  dark-orange: "#ec9672"
  dark-risk: "#ff8a75"
  dark-risk-soft: "#3a1b16"
  dark-amber-soft: "#382a10"
typography:
  display:
    fontFamily: "Bricolage Grotesque, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "clamp(48px, 5vw, 70px)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-3.1px"
  headline:
    fontFamily: "Bricolage Grotesque, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "36px"
    lineHeight: 1.15
    letterSpacing: "-.025em"
  title:
    fontFamily: "Bricolage Grotesque, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "24px"
    lineHeight: 1.15
    letterSpacing: "-.02em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  technical:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    lineHeight: 1.7
rounded:
  message: "6px"
  monitoring-control: "7px"
  workspace-control: "8px"
  surface: "10px"
  discovery-card: "13px"
  large-surface: "15px"
spacing:
  control-gap: "8px"
  field-gap: "12px"
  row-gap: "16px"
  section-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.monitoring-control}"
    padding: "11px 18px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.monitoring-control}"
    padding: "9px 15px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.message}"
    padding: "11px 12px"
  status-chip:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    padding: "3px 9px"
  evidence-panel:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.workspace-control}"
    padding: "16px 18px"
---

# Design System: cinecâștigă?

## Overview

The incumbent interface uses forest-green text and actions on ivory paper, with Bricolage headings and IBM Plex reading text. Open sections, thin separators, direct source links, and preserved-evidence panels give procurement records a clear reading order.

This records the built system rather than a new brand proposal. Color and font values come from the cascade of `globals.css` followed by `approved.css`; the latter supplies the approved forest/ivory overrides. Component examples come from the investigation workspace and monitoring extension. No creative metaphor or new palette was introduced.

Sources: [approved.css](apps/web/app/approved.css), [globals.css](apps/web/app/globals.css), [font loading](apps/web/app/layout.tsx), [workspace.css](apps/web/app/anchete/workspace.css), and [monitoring.css](apps/web/app/urmariri/monitoring.css). The frontmatter records existing reusable values; CSS remains the implementation authority when this record and a later build differ. The sidecar at [.impeccable/design.json](.impeccable/design.json) provides the extracted component examples and behavior tokens.

## Colors

The palette uses one primary forest accent and neutral paper/surface layers. Orange is an incumbent identity/detail accent, not a second monitoring action color. Risk text and amber cautions convey exceptional conditions together with explicit wording.

Paper supplies the page ground; surface supplies form and control backgrounds; sunk separates scope summaries and preserved evidence. Ink and ink-secondary handle reading text, while muted is reserved for supporting labels and dates. Line and line-strong separate sections and controls. Accent-soft supports quiet state and after-version surfaces without overpowering source content.

Dark-prefixed frontmatter values are the existing dark-theme overrides of the corresponding light roles. The app honors system color scheme and an explicit light/dark preference. Components reference theme variables so contrast roles follow the active theme.

## Typography

Display and section headings use Bricolage Grotesque; body copy and actions use IBM Plex Sans; optional technical records use IBM Plex Mono. Latin and Latin Extended subsets support Romanian content. The font declarations and fallbacks remain shared.

The display role describes the discovery headline; it is not a required size for tool pages. Investigation headings use the recorded headline role. Monitoring uses a responsive headline of 34–52px, smaller 30–42px watch titles, and the recorded title role for sections. Body text retains a comfortable reading line height. Metadata may be smaller but cannot replace the readable source values or main explanation. Numeric comparisons use tabular numerals and preserve exact values.

## Layout

The shared application shell has an approved maximum width of 1256px. Investigation tools use a 1120px content maximum; monitoring uses 1050px. These are existing surface choices, not a rule that every future route must use the same width.

Open sections and record rows are the normal tool structure. Scope, form, and preserved-evidence surfaces provide local grouping. The header's mobile arrangement changes below 700px; workspace and monitoring split layouts collapse below 760px. Long data tables scroll within their own focusable region instead of widening the whole page. Reading order and action order remain meaningful when columns stack.

## Elevation & Depth

Investigation and monitoring surfaces are flat and use tonal layering with thin boundaries. Discovery cards and search overlays use the existing soft shadow vocabulary where elevation communicates hover or an overlay. This record does not impose a global ban on shadows or on the incumbent navigation underline.

The exact light and dark shadow values, motion timings, and responsive boundaries are carried in the sidecar rather than invented frontmatter token groups.

## Shapes

Corners are gently rounded. Compact fields/messages, controls, larger surfaces, and discovery cards use the recorded existing sizes. Thin borders define controls and separate record sections; the active navigation underline remains a distinct incumbent convention. Native checkboxes, selects, and disclosure triangles keep familiar operation. Do not reproduce decorative labels or isolated text glyphs as a required design motif.

## Components

**Buttons.** Filled accent buttons identify the immediate committing action; surface buttons carry secondary actions. Monitoring uses a 44px primary minimum height and a 42px secondary minimum. The investigation workspace has the same family with 8px corners. Hover changes the surface/border or primary fill. Disabled controls visibly reduce emphasis and cannot fire actions.

**Inputs.** Fields use a surface background, ink text, a thin line-strong border, and a visible label. Focus remains explicit. The workspace and monitoring focus treatment is a 2px accent outline with a 4px offset; the shared application also defines an orange focus treatment. Preserve the appropriate visible treatment rather than removing it.

**Navigation.** The shared header and private-workspace destination links retain the approved typography and active underline. Active state is exposed semantically as well as visually. Responsive navigation changes arrangement rather than inventing a separate mobile identity.

**Status chips.** Small accent-soft labels communicate source-change or review state with text. Color is reinforcement, not the only cue.

**Preserved evidence.** A sunk panel separates the frozen record action from live comparison links. Clear source counts and “before” / “after” wording identify what will open. This is a signature investigative component already present in the Batch 2 workspace and extended by monitoring.

**Motion and feedback.** Control transitions are short and limited to state changes. Monitoring source entries use a brief opacity/movement transition; reduced-motion styles remove it and the monitoring button transitions. Loading, errors, and success are readable text states, using semantic status/alert markup where implemented. Component snippets retain keyboard focus and reduced-motion behavior.

## Do's and Don'ts

### Do

- Do reuse the approved theme variables and shared font families.
- Do keep record/source text and numeric comparisons readable at desktop and mobile widths.
- Do use filled primary actions for the immediate committing step and surface buttons for secondary actions.
- Do preserve visible focus, semantic state labels, and reduced-motion support.

### Don't

- Don't turn a task-specific width, decorative page label, or glyph mark into a global design requirement.
- Don't replace actual source content with decorative statistics, invented evidence, or ornamental dashboards.
- Don't use color alone to distinguish before/after, errors, or selected state.
- Don't modify the shared identity as a side effect of adding a workflow.

Not canonized: older discovery kickers, isolated glyph decoration, and differences between historical base CSS tokens and the approved overriding palette. These are not a new design vocabulary or an authorization to redesign existing pages. Batch-specific workflow and review details remain in [batch3-design.md](docs/implementation/batch3-design.md).
