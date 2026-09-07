/**
 * Helpers to keep a single "full name" value in sync with separate
 * first-name / last-name form fields.
 */

export interface NameParts {
  firstName: string;
  lastName: string;
}

/** Splits a full name into first name (first token) and last name (the rest). */
export function splitName(fullName?: string | null): NameParts {
  const clean = (fullName || '').replace(/\s+/g, ' ').trim();
  if (!clean) return { firstName: '', lastName: '' };
  const parts = clean.split(' ');
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/** Joins first + last name back into a single display name. */
export function joinName(firstName?: string | null, lastName?: string | null): string {
  return [(firstName || '').trim(), (lastName || '').trim()].filter(Boolean).join(' ').replace(/\s+/g, ' ');
}
