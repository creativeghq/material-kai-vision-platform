import { describe, it, expect } from 'vitest';
import { fixDoubledFullStops, newDefects, textDefects } from '../../supabase/functions/seo-api/handlers/text-defects.ts';
import { applyReviewEdits } from '../../supabase/functions/seo-api/handlers/site-assets.ts';
import { blankedSource } from '../helpers/sourceIndex';

describe('textDefects — slips found without a model', () => {
  it('finds the three slips from the kitchen tiles draft', () => {
    const md = [
      '## Στυλ',
      '',
      'Παρακάτω θα βρείτε έντεκα σχέδια. Παρακάτω τα βλέπετε με μια σειρά για κάθε τύπο.',
      '',
      '- **Μοντέρνα**: ποδιά σε τόνο σε τόνο με τον πάγκο.',
      '',
      'Θέλει ουδέτερο απορρυπαντικό και όχι κερί ή γυαλιστικό.. Τα προϊόντα αφήνουν επίστρωση.',
    ].join('\n');
    expect(textDefects(md).map((d) => [d.kind, d.text])).toEqual([
      ['repeated_opener', 'Παρακάτω'],
      ['repeated_phrase', 'σε τόνο σε τόνο'],
      ['doubled_punctuation', '..'],
    ]);
  });

  it('leaves alone what is not a slip', () => {
    const md = [
      'Τόνος σε τόνο ταιριάζει. Το ellipsis... μένει. Δείτε το [σχέδιο](https://x.example/a..b).',
      '',
      '| Μέγεθος | 10 | 10 |',
      '',
      '- Τοίχος: εύκολος καθαρισμός.',
      '- Τοίχος: λιγότεροι αρμοί.',
      '',
      'Price 60×60 and 60×120, from 10 to 20 mm.',
      '',
      'Σιγά σιγά στεγνώνει. Nous nous lavons. He had had enough. Size 60 x 60 x 2 cm.',
      '',
      '```',
      'a.. b',
      '```',
    ].join('\n');
    expect(textDefects(md)).toEqual([]);
  });

  it('gives each slip its own block, verbatim, for anchoring', () => {
    const md = 'Πρώτη παράγραφος... με αποσιωπητικά.\n\nΤα πλακίδια.. Δεύτερη.';
    expect(textDefects(md)).toEqual([{ kind: 'doubled_punctuation', text: '..', source: 'Τα πλακίδια.. Δεύτερη.' }]);
    expect(textDefects('«Παρακάτω το ένα. «Παρακάτω το άλλο.')[0]?.text).toBe('Παρακάτω');
  });

  it('newDefects reports only what an edit introduced', () => {
    const before = 'Αυτό είναι ένα κείμενο.. Παρακάτω τα σχέδια.';
    const after = 'Αυτό είναι ένα κείμενο.. Παρακάτω θα βρείτε. Παρακάτω τα σχέδια.';
    expect(newDefects(before, after).map((d) => d.kind)).toEqual(['repeated_opener']);
  });

  it('fixes a doubled full stop but never an ellipsis, a table or a relative link', () => {
    expect(fixDoubledFullStops('γυαλιστικό.. Τα\nΚαι... μετά\n| a.. | b |\n[x](../y)')).toBe('γυαλιστικό. Τα\nΚαι... μετά\n| a.. | b |\n[x](../y)');
    expect(fixDoubledFullStops('See [x](https://a.example/c..d).. Next\n```\na.. b\n```'))
      .toBe('See [x](https://a.example/c..d). Next\n```\na.. b\n```');
  });
});

describe('the editor cannot introduce a slip', () => {
  const md = 'Τα σχέδια επαναλαμβάνονται. Παρακάτω τα βλέπετε.';
  const edit = { find: 'Τα σχέδια επαναλαμβάνονται.', replace: 'Παρακάτω θα βρείτε τα σχέδια.' };

  it('skips a wording edit whose replacement repeats the next sentence opening', () => {
    const r = applyReviewEdits(md, [{ ...edit, kind: 'language' }]);
    expect(r.markdown).toBe(md);
    expect(r.skipped[0]?.why).toMatch(/repeated_opener/);
  });

  it('still applies a correction of fact, and the analyzer reports the slip it left', () => {
    const r = applyReviewEdits(md, [{ ...edit, kind: 'unsupported_claim' }]);
    expect(r.applied).toHaveLength(1);
    expect(textDefects(r.markdown).map((d) => d.kind)).toEqual(['repeated_opener']);
  });

  it('the pipeline, the analyzer and the editor all use the detector', () => {
    expect(blankedSource('supabase/functions/seo-api/handlers/site-assets.ts')).toContain('newDefects(');
    expect(blankedSource('supabase/functions/seo-api/handlers/analyze.ts')).toContain('textDefects(');
    expect(blankedSource('supabase/functions/seo-api/handlers/pipeline.ts')).toContain('fixDoubledFullStops(');
  });
});
