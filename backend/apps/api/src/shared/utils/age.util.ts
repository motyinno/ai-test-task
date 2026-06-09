/**
 * age.util.ts — pure date-of-birth utilities (Q-01.02).
 *
 * Both functions are pure: they accept an explicit `asOf` reference date so
 * they can be tested deterministically without calling Date.now().
 *
 * Age-group buckets (soccer youth divisions):
 *   U6  age <= 5
 *   U8  age 6–7
 *   U10 age 8–9
 *   U12 age 10–11
 *   U14 age 12–13
 *   U16 age 14–15
 *   U18 age 16–18
 */

export type AgeGroup = 'U6' | 'U8' | 'U10' | 'U12' | 'U14' | 'U16' | 'U18';

/**
 * Derive age in whole years from a date-of-birth string (ISO date, 'YYYY-MM-DD').
 *
 * @param dob   - ISO date string (e.g. '2012-05-15') or a Date object.
 * @param asOf  - Reference date for age calculation. Defaults to today if not
 *               provided. Pass a fixed date in unit tests.
 * @returns Age in whole years, or null if dob is null/undefined/empty.
 */
export function deriveAge(dob: string | null | undefined, asOf?: Date): number | null {
  if (!dob) return null;

  const refDate = asOf ?? new Date();
  const birthDate = new Date(dob);

  // Guard against invalid dates
  if (isNaN(birthDate.getTime())) return null;

  let age = refDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = refDate.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Derive the youth age-group from a date-of-birth string.
 *
 * Bucket boundaries (inclusive upper-age):
 *   U6  → age 1–5
 *   U8  → age 6–7
 *   U10 → age 8–9
 *   U12 → age 10–11
 *   U14 → age 12–13
 *   U16 → age 14–15
 *   U18 → age 16–18
 *
 * @param dob   - ISO date string ('YYYY-MM-DD')
 * @param asOf  - Reference date (inject in tests for determinism)
 * @returns AgeGroup string or null if dob is null/invalid or age out of 1–18 range.
 */
export function deriveAgeGroup(dob: string | null | undefined, asOf?: Date): AgeGroup | null {
  const age = deriveAge(dob, asOf);
  if (age === null) return null;
  if (age < 1 || age > 18) return null;

  if (age <= 5) return 'U6';
  if (age <= 7) return 'U8';
  if (age <= 9) return 'U10';
  if (age <= 11) return 'U12';
  if (age <= 13) return 'U14';
  if (age <= 15) return 'U16';
  return 'U18';
}
