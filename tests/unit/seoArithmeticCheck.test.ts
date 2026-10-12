import { describe, it, expect } from 'vitest';
import { checkArithmetic, fixArithmetic } from '../../supabase/functions/seo-api/handlers/arithmetic-check.ts';

const ok = (text: string, checked = 1) => {
  const r = checkArithmetic(text);
  expect(r.checked, text).toBe(checked);
  expect(r.wrong, text).toEqual([]);
};

describe('checkArithmetic — correct worked examples pass', () => {
  it.each([
    'Το μπάνιο είναι 10 × 6 = 60 τ.μ. συνολικά.',
    'Για 6 τ.μ. τοίχου με κουτιά των 0,64 τ.μ. θέλετε 6 ÷ 0,64 = 9,4 κουτιά, άρα 10.',
    'Χρειάζεστε 15,3 ÷ 0,09 = 170 πλάκες.',
    'Με φύρα: 154,5 × 1,1 = 170 πλάκες.',
    'Δάπεδο 3,5 x 2,4 = 8,4 m² και τοίχοι επιπλέον.',
    'Κόστος: 12 τ.μ. × 25 € = 300 €.',
    'Συνολικά 1.250 × 2 = 2.500 € για τα υλικά.',
    'Η τιμή είναι 1.250,50 + 249,50 = 1.500 €.',
    'Αφαιρούμε την πόρτα: 18 − 1,6 = 16,4 τ.μ.',
    'Ο λογαριασμός: 100 - 15 = 85 €.',
    'Κόλλα: 20 τ.μ. * 4 kg = 80 kg.',
    'Ανά πλευρά 12 / 4 = 3 μέτρα.',
    'Η επιφάνεια είναι 2,75 × 3,1 ≈ 8,5 τ.μ.',
    'Θα χρειαστείτε 7,3 × 2,2 = περίπου 16 τ.μ.',
    'Μια πλάκα 60x60 cm = 0,36 τ.μ.',
    'Η φύρα: 60 τ.μ. + 10% = 66 τ.μ.',
    'Το ΦΠΑ: 500 € × 24% = 120 €.',
    'Με έκπτωση 200 € − 15% = 170 €.',
    'Δίνουμε **6 ÷ 0,64 = 9,4** κουτιά.',
    'Σε 10,2 τ.μ. με πλάκες 0,09 τ.μ.: 10,2 ÷ 0,09 = 114 πλάκες (στρογγυλοποίηση προς τα πάνω).',
    'Area: 4.5 × 2 = 9 m² of wall.',
    'Τέσσερα πλακάκια: 4 × 60 cm = 2,4 m.',
    'Τρία κουτιά των 60x60 cm: 3 × 60 × 60 cm = 1,08 τ.μ.',
  ])('%s', (text) => ok(text));

  it('checks each step of a chain against the number the reader saw', () => {
    ok('Υπολογισμός: 4 × 2,5 = 10 τ.μ. × 1,1 = 11 τ.μ. με φύρα.', 2);
  });

  it('checks two calculations in one paragraph independently', () => {
    ok('Ο τοίχος είναι 3 × 2,5 = 7,5 τ.μ. και το δάπεδο 2 × 1,5 = 3 τ.μ.', 2);
  });

  it('a published article: waste percentages and per-m² prices (a parenthesis ends the chain)', () => {
    ok(
      '> Δάπεδο 5 τ.μ. + 10% φύρα = 5,5 τ.μ. × 24€ (γρανιτοπλακάκι R10) = 132€. Τοίχος 20 τ.μ. + 10% φύρα = 22 τ.μ. × 14€ '
        + '(κεραμικό 30x60) = 308€. Υλικά τοποθέτησης 27,5 τ.μ. × 6€ = 165€. Σύνολο υλικών: 605€.',
      3,
    );
  });

  it('a published article: tiles per box, with the tile size nearby', () => {
    ok('σε 80×80 cm, κάθε πλακίδιο καλύπτει 0,64 τ.μ. Χρειάζεστε 6 ÷ 0,64 = 9,4, δηλαδή 10 πλακίδια.');
  });
});

describe('checkArithmetic — wrong results are found', () => {
  it.each([
    ['Το μπάνιο είναι 10 × 6 = 66 τ.μ. συνολικά.', '10 × 6 = 66', '60', '66'],
    ['Για 6 τ.μ. θέλετε 6 ÷ 0,64 = 8,4 κουτιά.', '6 ÷ 0,64 = 8,4', '9,4', '8,4'],
    ['Χρειάζεστε 15,3 ÷ 0,09 = 150 πλάκες.', '15,3 ÷ 0,09 = 150', '170', '150'],
    ['Κόστος: 12 τ.μ. × 25 € = 350 €.', '12 τ.μ. × 25 € = 350', '300', '350'],
    ['Συνολικά 1.250 × 2 = 3.500 € για τα υλικά.', '1.250 × 2 = 3.500', '2.500', '3.500'],
    ['Αφαιρούμε την πόρτα: 18 − 1,6 = 17,4 τ.μ.', '18 − 1,6 = 17,4', '16,4', '17,4'],
    ['Η επιφάνεια είναι 2,75 × 3,1 ≈ 9,5 τ.μ.', '2,75 × 3,1 ≈ 9,5', '8,5', '9,5'],
    ['Το ΦΠΑ: 500 € × 24% = 100 €.', '500 € × 24% = 100', '120', '100'],
    ['Δίνουμε **6 ÷ 0,64 = 9,8** κουτιά.', '6 ÷ 0,64 = 9,8', '9,4', '9,8'],
    ['Το μπάνιο είναι 10 × 6 = 600 τ.μ.', '10 × 6 = 600', '60', '600'],
    ['Μια πλάκα 60x60 cm = 3,6 τ.μ.', '60x60 cm = 3,6', '0,4', '3,6'],
  ])('%s', (text, expr, expected, stated) => {
    const r = checkArithmetic(text);
    expect(r.checked).toBe(1);
    expect(r.wrong).toEqual([{ text: expr, expected, stated }]);
  });

  it('a rounding that is too coarse for its own precision is wrong (9,375 is not 9,3)', () => {
    expect(checkArithmetic('6 ÷ 0,64 = 9,3 κουτιά').wrong).toHaveLength(1);
  });

  it('only the wrong step of a chain is reported', () => {
    const r = checkArithmetic('4 × 2,5 = 10 τ.μ. × 1,1 = 12 τ.μ. με φύρα.');
    expect(r.checked).toBe(2);
    expect(r.wrong).toEqual([{ text: '10 τ.μ. × 1,1 = 12', expected: '11', stated: '12' }]);
  });
});

describe('checkArithmetic — what is not a calculation is skipped', () => {
  it.each([
    'Ένα μπάνιο 20–25 τ.μ. × 1,1 = 22–27,5 τ.μ. υλικού.',
    'Υπολογίστε 10-12 κουτιά × 0,64 = 7 τ.μ.',
    'Με 2 × 10 = 20 έως 24 πλακάκια.',
    'Κόστος 15 - 20 € το τ.μ.',
    'Πλακάκια 30x60 cm σε τιμές 12–18 €/τ.μ.',
    'Η θερμοκρασία είναι 20 °C και η υγρασία 60%.',
    'Τηλέφωνο 2310 123456, ώρες 9:00 - 17:00.',
    'Αντιολισθητικότητα R10 ή R11, διαστάσεις 60x120.',
    'Το 2026 οι τιμές = σταθερές.',
    'Επιφάνεια m2 × 2 = 40',
    'Λωρίδα 2 m × 60 cm = 1,2 τ.μ.',
  ])('%s', (text) => {
    expect(checkArithmetic(text)).toEqual({ checked: 0, wrong: [] });
  });

  it('a number glued to letters (m2, R10) is never an operand', () => {
    ok('Δάπεδο 20 m2 × 1,1 = 22 m2.');
  });
});

describe('fixArithmetic', () => {
  it('rewrites only the stated result and returns the edit', () => {
    const md = 'Για 6 τ.μ. θέλετε 6 ÷ 0,64 = 8,4 κουτιά.\n\nΆλλο κείμενο.';
    const { markdown, edits } = fixArithmetic(md, checkArithmetic(md).wrong);
    expect(markdown).toBe('Για 6 τ.μ. θέλετε 6 ÷ 0,64 = 9,4 κουτιά.\n\nΆλλο κείμενο.');
    expect(edits).toEqual([{ index: md.indexOf('6 ÷ 0,64'), before: '6 ÷ 0,64 = 8,4', after: '6 ÷ 0,64 = 9,4' }]);
  });

  it('keeps thousands dots and the decimal comma', () => {
    const md = 'Σύνολο 1.250 × 2 = 3.500 €.';
    expect(fixArithmetic(md, checkArithmetic(md).wrong).markdown).toBe('Σύνολο 1.250 × 2 = 2.500 €.');
  });

  it('leaves a calculation that appears twice alone', () => {
    const md = '10 × 6 = 66 τ.μ. και πάλι 10 × 6 = 66 τ.μ.';
    const r = fixArithmetic(md, checkArithmetic(md).wrong);
    expect(r.edits).toEqual([]);
    expect(r.markdown).toBe(md);
  });

  it('leaves a result that the next step of a chain builds on', () => {
    const md = '4 × 2,5 = 12 τ.μ. × 1,1 = 13,2 τ.μ.';
    const r = fixArithmetic(md, checkArithmetic(md).wrong);
    expect(r.edits).toEqual([]);
  });

  it('does nothing when every result is right', () => {
    const md = 'Το μπάνιο είναι 10 × 6 = 60 τ.μ.';
    expect(fixArithmetic(md, checkArithmetic(md).wrong)).toEqual({ markdown: md, edits: [] });
  });
});
