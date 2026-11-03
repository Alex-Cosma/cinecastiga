export class DocumentFormatError extends Error {}
/** Cooperative yield: the next worker resumes the persisted page checkpoint. */
export class DocumentYield extends Error {}
/** SEAP answered for another notice or award than the one asked: the same answer every time, so no retry.
 * The message names the mismatching public field (ids, numbers), never a file URL. */
export class DocumentIdentityError extends DocumentFormatError {}
