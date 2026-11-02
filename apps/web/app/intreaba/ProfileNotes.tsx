import { countWords } from "../../lib/ask/answer-text";

/**
 * The drawer's note on profile sources, with the reconciliation against the profiles' aggregates. marts.entity_flags
 * (apps/ingestion flags/marts.ts) and the profile sources in runRows read only accepted direct acquisitions with a
 * positive value of at most 2 mil. lei: no state needs choosing or excluding. Above the answer the basis is the line
 * under its sentence; the banner that repeated it is gone (owner, 2 November 2026).
 */
export function ProfileSourceNote({ reconciled, profileCount }: { reconciled: boolean | null; profileCount: number }) {
  return (
    <div className="ev-profile-note">
      <strong>Doar achiziții directe acceptate, ca profilul.</strong>
      {reconciled === true && <p className="ev-reconciled">✓ Numărul și suma surselor coincid cu {profileCount === 1 ? "agregatul profilului selectat" : `agregatele celor ${countWords(profileCount, "profil", "profiluri")} selectate`}.</p>}
      {reconciled === false && <p className="ev-mismatch">Agregatul profilului și sursele actuale diferă. Lista arată datele disponibile acum; verifică explicația de mai jos.</p>}
    </div>
  );
}
