import Term from "../../components/Term";

/**
 * The basis of a historical risk profile, said the same way above the answer
 * and in its sources. marts.entity_flags (apps/ingestion flags/marts.ts) and
 * the profile sources in runRows read only accepted direct acquisitions with a
 * positive value of at most 2 mil. lei: no state needs choosing or excluding.
 */
export function ProfileNotice() {
  return (
    <p className="cq-profile-notice">
      <strong>Profil istoric: achiziții directe acceptate; valori înregistrate, nu plăți.</strong>{" "}
      <Term tip title="Profil istoric" text="Toată arhiva de achiziții directe acceptate, de cel mult 2 mil. lei fiecare. Calculul e în lista surselor." />
    </p>
  );
}

/** The drawer's note on profile sources, with the reconciliation against the profiles' aggregates. */
export function ProfileSourceNote({ reconciled, profileCount }: { reconciled: boolean | null; profileCount: number }) {
  return (
    <div className="ev-profile-note">
      <strong>Doar achiziții directe acceptate, ca profilul.</strong>
      {reconciled === true && <p className="ev-reconciled">✓ Numărul și suma surselor coincid cu agregatele celor {profileCount.toLocaleString("ro-RO")} profiluri selectate.</p>}
      {reconciled === false && <p className="ev-mismatch">Agregatul profilului și sursele actuale diferă. Lista arată datele disponibile acum; verifică explicația de mai jos.</p>}
    </div>
  );
}
