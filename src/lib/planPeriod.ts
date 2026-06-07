// Compute the current monthly billing period for the FREE plan,
// anchored to the user's signup date instead of the calendar month.
//
// Examples (signup = 2026-01-15):
//   on 2026-02-10 -> period starts 2026-01-15
//   on 2026-02-20 -> period starts 2026-02-15
//
// Day-of-month is clamped to 28 to avoid month-length edge cases.
export function getFreePeriodKey(signupISO: string | null | undefined, now: Date = new Date()): string {
  const signup = signupISO ? new Date(signupISO) : new Date(now.getFullYear(), now.getMonth(), 1);
  const anchorDay = Math.min(Math.max(signup.getUTCDate(), 1), 28);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let start = new Date(Date.UTC(y, m, anchorDay));
  if (start.getTime() > now.getTime()) {
    start = new Date(Date.UTC(y, m - 1, anchorDay));
  }
  const yyyy = start.getUTCFullYear();
  const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(start.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getFreePeriodLabel(periodKey: string): string {
  const d = new Date(periodKey + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
