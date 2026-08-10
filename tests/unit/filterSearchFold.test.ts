/**
 * Every search box in the filter system — the promoted toolbar input and the box above a
 * long checkbox list — compares through `foldForSearch`.
 *
 * It used to be `toLowerCase()`, which is wrong for this CRM's actual data: the company and
 * contact lists are full of Greek names, where the accent and the final sigma are exactly
 * what a user types differently from how the row is stored. Typing `κωστάς` against
 * `ΚΩΣΤΑΣ ΑΛΕΞΙΟΥ` returned "No matches." and looked like a missing record.
 */
import { describe, it, expect } from 'vitest';

import { foldForSearch } from '../../src/components/core/filters/types';

const matches = (haystack: string, needle: string) =>
  foldForSearch(haystack).includes(foldForSearch(needle));

describe('foldForSearch — Greek', () => {
  it('ignores accents', () => {
    expect(matches('ΚΩΣΤΑΣ ΑΛΕΞΙΟΥ', 'κωστάς')).toBe(true);
    expect(matches('Π ΣΚΕΠΕΤΑΡΗΣ ΚΑΙ ΣΙΑ ΕΕ', 'σκεπετάρης')).toBe(true);
    expect(matches('Κώστας', 'ΚΩΣΤΑΣ')).toBe(true);
  });

  it('folds the final sigma onto the medial one', () => {
    // ς and σ are different codepoints; which one you get depends on where you stop typing.
    expect(foldForSearch('ΚΩΣΤΑΣ')).toBe(foldForSearch('κωστασ'));
    expect(matches('ΑΛΕΞΙΟΥ ΚΩΣΤΑΣ', 'κωστας')).toBe(true);
  });

  it('matches an uppercase ΚΑΔ activity from lowercase input', () => {
    // The companies "Business activity" facet is entirely uppercase ΑΑΔΕ text.
    expect(matches('ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΠΛΑΚΑΚΙΩΝ, ΠΛΑΚΟΛΙΘΩΝ', 'πλακακίων')).toBe(true);
  });
});

describe('foldForSearch — Latin and other scripts', () => {
  it('ignores Latin diacritics', () => {
    expect(matches('Société Générale', 'societe')).toBe(true);
    expect(matches('KOLOMOLO Sp. z o.o.', 'kolomolo')).toBe(true);
  });

  it('leaves non-matching text non-matching', () => {
    expect(matches('Botguard OÜ', 'kolomolo')).toBe(false);
    // Not a transliterator: Cyrillic stays Cyrillic (that lives in _shared/transliterate.ts).
    expect(matches('Трендафил Ташков', 'trendafil')).toBe(false);
  });

  it('is total on null/undefined so an absent hint never throws', () => {
    expect(foldForSearch(undefined)).toBe('');
    expect(foldForSearch(null)).toBe('');
  });
});
