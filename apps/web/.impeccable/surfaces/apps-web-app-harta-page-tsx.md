---
version: 1
slug: "apps-web-app-harta-page-tsx"
primary_target: "apps/web/app/harta/page.tsx"
related_targets: ["apps/web/app/harta/MapExplorer.tsx","apps/web/app/harta/harta.css"]
---

# Hartă (/harta)

Mode: Operate. A new top-level page that replaces „Ce bate la ochi” in the navigation and the old county map at /harta (owner, 6 November 2026; the stories are deleted). Owner brief: the contracted value per inhabitant, by CPV category; first the whole country by county with a CPV filter (all selected by default), coloured by intensity directly proportional to the value; a click on a county zooms in nicely and elegantly and brings the county forward split into its UATs, coloured the same way.

Owner decisions: institutions = local administrations first (a UAT's own town hall; a county = its town halls + the county council), with a visible institution-type filter that will gain hospitals, schools… later; period = the whole period, one year or several years (multi-select); geometry from ANCPI + INS SIRUTA (CC BY 4.0, attribution on the page); București: sectors show their own town hall, the city hall (PMB) apart over the whole city's population; a county is divided by the population whose administration is identified (coverage shown under 90%). Values are contracted, not payments. Data: lib/map-capita*.ts, /api/map, /api/map/options, public/geo/romania.json + public/geo/judete/*.json.

Approved sketch: apps/web/.impeccable/mocks/decision/harta/clasament.html (card „Harta și clasamentul”, owner: „varianta 3”).

## Direction contract

THESIS: the map and the ranking side by side, lit together: lei per inhabitant of the local administrations, county by county, then UAT by UAT after a click that zooms into the county. It refuses the old static choropleth of total sums with a top-12 table, where the biggest cities always win.

OWN-WORLD: the incumbent forest and ivory system: Bricolage headings, IBM Plex text, Plex Mono figures; the choropleth green as one continuous intensity (fill-opacity of --choro-4 over the surface, proportional to lei per inhabitant from 0 to the level's maximum), the hovered area outlined in ink, unknown areas hatched, the city hall of București as its own quiet box; thin rules, flat surfaces; filters are buttons opening the site's short windows (Popover + OptionList checkboxes).

STORY: the reader sees the country and the national average, scans the ranking, hovers a county and sees it lit in both, narrows institutions, years, CPV domains or channel (applied at once), clicks a county and watches the map glide into it while the list becomes its UATs, reads coverage where it is partial, steps back with the breadcrumb.

FIRST VIEWPORT: nav with „Hartă” active; „Lei pe locuitor, pe județe” (inside a county: „Lei pe locuitor în {județ}”) with a one-line lede (who counts, period, domains, the average); one row of filter buttons (Instituții, Perioada, Domenii CPV, a Toate/Directe/Proceduri segment); the stage on the left (~62%): breadcrumb România › județ, the map with its hover card, the ramp legend from 0 to the maximum, the attribution; the ranking on the right: rank, name, an intensity bar, lei per inhabitant, coverage mark, scrolling inside its column, hover linked to the map, a click on a county row zooming like a click on the map. Signature interaction: the glide, the SVG viewBox easing from the country to the county box in about half a second while the county's UATs fade in and the other counties fall back; reduced motion jumps. On a phone the filters wrap two per row, the map takes the full width and the ranking follows it.

FORM: Harta și clasamentul, position 1 of 7 on the ranked list (dealt; the lead was the filter rail). seed:032e85904fc69aec

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
