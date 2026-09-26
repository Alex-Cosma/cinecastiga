## verdict

1. Resolved — source fidelity: `selectedFromPage()` now requires both range endpoints inside the source `<p>` and an exact substring match; the save handler independently checks the quote against its fixture page and paragraph before persistence. The refreshed 24-check verification record includes both valid substring selection and a range crossing into the helper label. Reopened reader and saved captures show the source quotation without helper wording, with page and original-PDF access retained. All seven original capture paths were reopened and remain valid; no regressions from this fix were observed.

## remaining

Clear. Ship covers the scored fix, not the whole surface.

disposition: ship
