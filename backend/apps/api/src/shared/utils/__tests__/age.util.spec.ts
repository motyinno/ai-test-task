/**
 * GR2 — age.util.ts tests (Q-01.02)
 *
 * All tests use an explicit `asOf` date for determinism — no real Date.now() calls.
 * Reference date: 2026-06-09 (asOf = new Date('2026-06-09'))
 */
import { deriveAge, deriveAgeGroup } from '../age.util';

const REF = new Date('2026-06-09');

describe('deriveAge', () => {
  it('returns null for null dob', () => {
    expect(deriveAge(null, REF)).toBeNull();
  });

  it('returns null for undefined dob', () => {
    expect(deriveAge(undefined, REF)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(deriveAge('', REF)).toBeNull();
  });

  it('returns null for an invalid date string', () => {
    expect(deriveAge('not-a-date', REF)).toBeNull();
  });

  it('returns 11 for dob 2015-03-01 as of 2026-06-09 (birthday passed)', () => {
    expect(deriveAge('2015-03-01', REF)).toBe(11);
  });

  it('returns 10 for dob 2015-07-01 as of 2026-06-09 (birthday NOT yet passed)', () => {
    // Born July 2015 — has not had their 11th birthday yet by June 9 2026
    expect(deriveAge('2015-07-01', REF)).toBe(10);
  });

  it('returns 0 for dob same year (birthday not yet passed)', () => {
    // Born Sep 2026 — ref June 2026
    expect(deriveAge('2026-09-01', REF)).toBe(-1);
  });

  it('returns age exactly on birthday', () => {
    // Born June 9, 2015 — exactly 11 today
    expect(deriveAge('2015-06-09', REF)).toBe(11);
  });

  it('returns correct age when birthday is day before asOf', () => {
    expect(deriveAge('2015-06-08', REF)).toBe(11);
  });

  it('returns age minus one when birthday is day after asOf', () => {
    expect(deriveAge('2015-06-10', REF)).toBe(10);
  });

  it('returns 18 for dob 2008-01-01 as of 2026-06-09', () => {
    expect(deriveAge('2008-01-01', REF)).toBe(18);
  });

  it('returns 1 for dob 2025-01-01 as of 2026-06-09', () => {
    expect(deriveAge('2025-01-01', REF)).toBe(1);
  });
});

describe('deriveAgeGroup', () => {
  it('returns null for null dob', () => {
    expect(deriveAgeGroup(null, REF)).toBeNull();
  });

  it('returns null for age out of 1–18 range (age 0)', () => {
    // Born last year, birthday not yet reached
    expect(deriveAgeGroup('2026-12-01', REF)).toBeNull();
  });

  it('returns null for age > 18 (adult — out of youth range)', () => {
    // Born 1990 → age 36
    expect(deriveAgeGroup('1990-01-01', REF)).toBeNull();
  });

  describe('U6 bucket (age 1–5)', () => {
    it('returns U6 for age 5 (dob 2021-03-01)', () => {
      expect(deriveAgeGroup('2021-03-01', REF)).toBe('U6');
    });

    it('returns U6 for age 1 (dob 2025-01-01)', () => {
      expect(deriveAgeGroup('2025-01-01', REF)).toBe('U6');
    });
  });

  describe('U8 bucket (age 6–7)', () => {
    it('returns U8 for age 6 (dob 2020-03-01)', () => {
      expect(deriveAgeGroup('2020-03-01', REF)).toBe('U8');
    });

    it('returns U8 for age 7 (dob 2019-03-01)', () => {
      expect(deriveAgeGroup('2019-03-01', REF)).toBe('U8');
    });
  });

  describe('U10 bucket (age 8–9)', () => {
    it('returns U10 for age 8 (dob 2018-03-01)', () => {
      expect(deriveAgeGroup('2018-03-01', REF)).toBe('U10');
    });

    it('returns U10 for age 9 (dob 2017-03-01)', () => {
      expect(deriveAgeGroup('2017-03-01', REF)).toBe('U10');
    });
  });

  describe('U12 bucket (age 10–11)', () => {
    it('returns U12 for age 10 (dob 2016-03-01)', () => {
      expect(deriveAgeGroup('2016-03-01', REF)).toBe('U12');
    });

    it('returns U12 for age 11 (dob 2015-03-01)', () => {
      expect(deriveAgeGroup('2015-03-01', REF)).toBe('U12');
    });
  });

  describe('U14 bucket (age 12–13)', () => {
    it('returns U14 for age 12 (dob 2014-03-01)', () => {
      expect(deriveAgeGroup('2014-03-01', REF)).toBe('U14');
    });

    it('returns U14 for age 13 (dob 2013-03-01)', () => {
      expect(deriveAgeGroup('2013-03-01', REF)).toBe('U14');
    });
  });

  describe('U16 bucket (age 14–15)', () => {
    it('returns U16 for age 14 (dob 2012-03-01)', () => {
      expect(deriveAgeGroup('2012-03-01', REF)).toBe('U16');
    });

    it('returns U16 for age 15 (dob 2011-03-01)', () => {
      expect(deriveAgeGroup('2011-03-01', REF)).toBe('U16');
    });
  });

  describe('U18 bucket (age 16–18)', () => {
    it('returns U18 for age 16 (dob 2010-03-01)', () => {
      expect(deriveAgeGroup('2010-03-01', REF)).toBe('U18');
    });

    it('returns U18 for age 17 (dob 2009-03-01)', () => {
      expect(deriveAgeGroup('2009-03-01', REF)).toBe('U18');
    });

    it('returns U18 for age 18 (dob 2008-01-01)', () => {
      expect(deriveAgeGroup('2008-01-01', REF)).toBe('U18');
    });
  });
});
