# Review correction

Restricted native selection to the source paragraph element at both endpoints, requiring an exact substring of that paragraph. The save handler independently validates the proposed quote against the immutable fixture's page/paragraph before hashing or persisting. This also prevents a non-source selection from being saved even if an upstream selection guard regresses.

Final confirmation24checks passed, including both valid native substring and range crossing into helper button (selection remains the original valid20-character source quote). Full7capture matrix recaptured at the same paths and opened by root; valid, no visual layout change. No second detector. This correction changes only source-selection fidelity, not the approved structure.
