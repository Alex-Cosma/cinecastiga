import { describe, expect, it } from "vitest";
import { individualHolder } from "./individual-holder";

describe("the holder of an individual practice, from its name", () => {
  it("reads the form and the holder's folded name", () => {
    expect(individualHolder('CABINET INDIVIDUAL DE PSIHOLOGIE "NASTASA MARIA MONICA"')).toEqual({ form: "psiholog", holder: "nastasa maria monica" });
    expect(individualHolder("POPESCU ION PFA")).toEqual({ form: "pfa", holder: "popescu ion" });
    expect(individualHolder("P.F.A. IONESCU MARIA-ELENA")).toEqual({ form: "pfa", holder: "ionescu maria elena" });
    expect(individualHolder("ÎNTREPRINDERE INDIVIDUALĂ VASILESCU DAN")).toEqual({ form: "ii", holder: "vasilescu dan" });
    expect(individualHolder("CABINET DE AVOCAT DR. GEORGESCU ANA")).toEqual({ form: "avocat", holder: "georgescu ana" });
  });
  it("says nothing for a firm, or for a single name that matches too many people", () => {
    expect(individualHolder("CENTRUL MEDICAL CONECT S.R.L.")).toBeNull();
    expect(individualHolder("PFA POPESCU")).toBeNull();
    expect(individualHolder(null)).toBeNull();
  });
});
