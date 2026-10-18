import { describe, expect, it } from 'vitest';
import { unaccentedKeywordUses } from '../../supabase/functions/seo-api/handlers/foreign-words';

describe('an unaccented keyword is for search, never for the reader (#477 R5)', () => {
  it('counts every reader-facing use spelled without its accents', () => {
    const text = 'Τα έπιπλα μπάνιου μας. Δείτε επιπλα μπανιου και Επιπλα Μπάνιου σε τιμές.';
    expect(unaccentedKeywordUses(text, 'έπιπλα μπάνιου')).toBe(2);
  });

  it('is silent when every use carries the accents', () => {
    expect(unaccentedKeywordUses('Έπιπλα μπάνιου: οδηγός για έπιπλα μπάνιου.', 'έπιπλα μπάνιου')).toBe(0);
  });

  it('does not apply to a keyword with no accents or no Greek', () => {
    expect(unaccentedKeywordUses('πλακακια πλακακια', 'πλακακια')).toBe(0);
    expect(unaccentedKeywordUses('porcelain tiles', 'porcelain tiles')).toBe(0);
  });

  it('matches whole words only, and leaves all-caps Greek alone', () => {
    expect(unaccentedKeywordUses('Τα πλακάκια μας', 'πλάκα')).toBe(0);
    expect(unaccentedKeywordUses('## ΕΠΙΠΛΑ ΜΠΑΝΙΟΥ\nΔείτε επιπλα μπανιου.', 'έπιπλα μπάνιου')).toBe(1);
  });

  it('accepts a decomposed (NFD) article as the same spelling', () => {
    expect(unaccentedKeywordUses('έπιπλα μπάνιου'.normalize('NFD'), 'έπιπλα μπάνιου')).toBe(0);
  });
});
