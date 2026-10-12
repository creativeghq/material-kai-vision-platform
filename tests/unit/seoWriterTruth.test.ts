import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';
import {
  anchorNamesOtherPlace,
  applySiteAssetRules,
  isOfficialHost,
} from '../../supabase/functions/seo-api/handlers/site-assets.ts';
import { changedSentences, draftPlainText } from '../../supabase/functions/seo-api/handlers/draft-diff.ts';

const HANDLERS = join(process.cwd(), 'supabase/functions/seo-api/handlers');
const src = (f: string) => blankComments(readFileSync(join(HANDLERS, f), 'utf-8'));

describe('a link says what it points at', () => {
  it('an anchor naming a place the target page does not is unlinked (Rethymno → the Athens page)', () => {
    expect(anchorNamesOtherPlace('πλακάκια στο Ρέθυμνο', 'Πλακάκια μπάνιου Αθήνα https://tiles.example/athens/plakakia')).toBe(true);
    expect(anchorNamesOtherPlace('πλακάκια στην Αθήνα', 'Πλακάκια μπάνιου Αθήνα https://tiles.example/athens/plakakia')).toBe(false);
  });

  it('a series anchor that the target names in any order is kept', () => {
    expect(anchorNamesOtherPlace('Terrazzo Stone 2.0 της Cersanit', 'Cersanit Terrazzo Stone 2 0 Πλακάκια')).toBe(false);
    expect(anchorNamesOtherPlace('κατηγορία πλακιδίων τύπου terrazzo', 'Πλακάκια Terrazzo: Σειρές & Τιμές')).toBe(false);
  });

  it('only government, EU and standards sites may be linked outside our own', () => {
    expect(isOfficialHost('www.gov.gr')).toBe(true);
    expect(isOfficialHost('exoikonomo.gov.gr')).toBe(true);
    expect(isOfficialHost('eur-lex.europa.eu')).toBe(true);
    expect(isOfficialHost('www.iso.org')).toBe(true);
    expect(isOfficialHost('youbath.gr')).toBe(false);
    expect(isOfficialHost('www.leroymerlin.gr')).toBe(false);
  });

  it('a link to a researched or competitor site is unwrapped to its text', () => {
    const md = 'Δείτε τον [οδηγό](https://youbath.gr/odigos) και το [ΦΕΚ](https://www.gov.gr/x).';
    const out = applySiteAssetRules(md, 'tiles.example', new Set(), new Map());
    expect(out.markdown).toBe('Δείτε τον οδηγό και το [ΦΕΚ](https://www.gov.gr/x).');
    expect(out.unlinked).toBe(1);
  });

  it('a site link whose anchor names another place is unwrapped', () => {
    const url = 'https://tiles.example/athens/plakakia';
    const md = `Δείτε [πλακάκια στο Ρέθυμνο](${url}).`;
    const out = applySiteAssetRules(md, 'tiles.example', new Set([url]), new Map(), new Map([[url, 'Πλακάκια Αθήνα']]));
    expect(out.markdown).toBe('Δείτε πλακάκια στο Ρέθυμνο.');
  });
});

describe('what the editor changed between our draft and the published page', () => {
  it('reads the prose, not the markdown furniture', () => {
    expect(draftPlainText('## Τίτλος\n> [!tldr]\n> Σύντομη απάντηση εδώ.\n![x](https://a/b.webp)\n[κείμενο](https://a)')).not.toMatch(/https|\[!|##/);
  });

  it('lists the draft sentences that are gone and the published ones that are new, ignoring accents and spacing', () => {
    const draft = 'Ως εισαγωγέας φέρνουμε τα πλακάκια απευθείας. Τα πλακάκια πορσελανάτου αντέχουν στην υγρασία.';
    const published = 'Τα πλακάκια πορσελανατου αντέχουν  στην υγρασία. Προμηθεύουμε τα πλακάκια κατόπιν παραγγελίας.';
    expect(changedSentences(draft, published)).toEqual({
      removed: ['Ως εισαγωγέας φέρνουμε τα πλακάκια απευθείας.'],
      added: ['Προμηθεύουμε τα πλακάκια κατόπιν παραγγελίας.'],
    });
  });
});

describe('the writer and the reviewer state only true facts about us', () => {
  it('the brief carries how we supply each maker, defaulting to "to order", and the date of writing', () => {
    const code = src('content-brief.ts');
    expect(code).toContain(".eq('supply_relationship', 'authorised')");
    expect(code).toContain('Date of writing:');
    expect(code, 'an unreadable supplier list must still leave the safe claim').toContain('(error ? [] : data ?? [])');
  });

  it('approved lessons from published articles reach the brief', () => {
    expect(src('pipeline.ts')).toContain('brief.extraContext.push(...await approvedLessonLines(');
  });

  it('the review ends with one whole-article consistency pass', () => {
    const code = src('review.ts');
    expect(code).toContain("getToolPrompt(supabase, 'seo_consistency_check')");
    expect(code.indexOf('const consistency = await consistencyPass(')).toBeGreaterThan(code.indexOf('const body = applyReviewEdits('));
  });

  it('lessons reserve before the model call and come from a DB prompt', () => {
    const code = src('lessons.ts');
    expect(code).toContain("getToolPrompt(supabase, 'seo_lesson_extractor')");
    expect(code.indexOf('reserveStage(')).toBeLessThan(code.indexOf('callClaudeMessages('));
  });
});
