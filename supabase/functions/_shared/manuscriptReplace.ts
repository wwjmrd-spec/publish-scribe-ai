// Rules for replacing an article's manuscript file with an updated one.

/** Admins may always replace; the article's own author only while an admin allows it. */
export function canReplaceManuscript(opts: { isAdmin: boolean; isOwner: boolean; allowedByAdmin: boolean }): boolean {
  if (opts.isAdmin) return true;
  return opts.isOwner && opts.allowedByAdmin;
}

/**
 * Formatting counts as done once a formatted version exists. Done -> the admin
 * re-formats manually; not done -> the new file is formatted automatically.
 */
export function isFormattingDone(formattingStatus: string | null | undefined, hasFormattedContent: boolean): boolean {
  return ["ready_for_review", "approved"].includes(String(formattingStatus || "")) || hasFormattedContent;
}

/** The author's permission is one-time: it switches off after the author uses it. */
export function revokesAuthorPermission(isAdmin: boolean): boolean {
  return !isAdmin;
}
