import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NAME_SITES, isNameLabel, toTitleCase } from '../../scripts/lib/labelCase.mjs';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  if (name === 'node_modules') return [];
  const path = join(dir, name).replace(/\\/g, '/');
  if (statSync(path).isDirectory()) return walk(path);
  return /\.tsx?$/.test(name) && !/generated|supabase\/types\.ts$|\.d\.ts$/.test(path) ? [path] : [];
});

describe('a name on screen is Title Case', () => {
  it.each([
    ['Product sales income', 'Product Sales Income'],
    ['Other income / profit', 'Other Income / Profit'],
    ['Country of origin', 'Country of Origin'],
    ['Follow-up on', 'Follow-Up On'],
    ['Low text-to-HTML ratio', 'Low Text-to-HTML Ratio'],
    ['Wage-earner withholding (art. 15 §1 L.4172/2013)', 'Wage-Earner Withholding (art. 15 §1 L.4172/2013)'],
    ['Catalog summary (optional)', 'Catalog Summary (optional)'],
    ['myDATA document type', 'myDATA Document Type'],
    ['Net mass (kg)', 'Net Mass (kg)'],
    ['HR — late check-in', 'HR — Late Check-In'],
  ])('%s', (from, to) => {
    expect(toTitleCase(from)).toBe(to);
  });

  it.each([
    'Add product', 'Assess a listing', 'No invoices yet', 'What they asked for', 'Your invoice is ready to send',
    'Most searches find nothing', 'Re-light a room',
  ])('leaves the action or sentence "%s" alone', (text) => {
    expect(isNameLabel(text)).toBe(false);
  });

  it('holds for every label, column, option, tab and section title in the code', () => {
    const offenders: string[] = [];
    for (const file of [...walk('src'), ...walk('supabase/functions')]) {
      const text = readFileSync(file, 'utf8');
      for (const site of NAME_SITES) {
        for (const match of text.matchAll(site)) {
          const label = match[1];
          if (isNameLabel(label) && toTitleCase(label) !== label) {
            offenders.push(`${file}: "${label}" should be "${toTitleCase(label)}"`);
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  }, 300_000);
});
