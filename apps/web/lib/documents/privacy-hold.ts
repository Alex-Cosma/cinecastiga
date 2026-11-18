// A prepared document whose text holds a personal identifier (a CNP, an identity card) is not shown here until an
// administrator has looked at it (owner, 18 November 2026, legal audit; migration 0112). The note never says which
// kind of data, so it does not point at what to look for in the original.
export const WITHHELD_NOTE='Documentul conține date personale și nu îl afișăm aici.';
/** `privacy_hold` of app.procurement_documents: 'held' and 'kept' are not served; null and 'released' are. */
export const isWithheld=(hold:unknown):boolean=>hold==='held'||hold==='kept';
/** What the check found, in the administrator's words. */
export const PRIVACY_REASONS:Record<string,string>={cnp:'CNP',act_identitate:'act de identitate'};
