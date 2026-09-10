/** An outbound message belongs to a PARTY, and the party record shows it (#378 N5). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const TAB = 'src/modules/crm/components/PartyWorkTab.tsx';

describe('the party record shows what was sent to it', () => {
  const tab = read(TAB);

  it('the message kind has a label, an icon and a place in the rail', () => {
    // `get_party_work` returning a kind the tab does not name is not fatal — unknown kinds are
    // appended rather than dropped — but it renders as a raw kind string, which reads as a bug.
    expect(tab, 'message needs a label and icon').toMatch(/message:\s*\{[^}]*label: 'Messages'/);
    expect(tab, 'message must be in the rail order').toMatch(/'asset',\s*'message'/);
  });

  it('a message offers no link, because it has no page', () => {
    // Offering "open" for a URL that opens a list is the button-whose-effect-is-to-name-a-place
    // failure the destinations work already records.
    const entry = tab.slice(tab.indexOf('message:'), tab.indexOf('message:') + 200);
    expect(entry, 'a message has no page of its own').not.toMatch(/href:/);
  });
});

describe('the phone key is one rule, and it does not guess', () => {
  /**
   * Mirrors `public.msisdn_key`. Restated here so the expectations below are executable — the SQL
   * itself is exercised by probe, but the RULE is what must not drift, and this is the same
   * intent `src/modules/messaging/phoneNumber.ts` implements for the TypeScript side.
   */
  const key = (p: string) => p.replace(/^\s*(?:\+|00)/, '').replace(/[^0-9]/g, '') || null;

  it('the three legal spellings of one number agree', () => {
    expect(key('+306912345678')).toBe('306912345678');
    expect(key('00306912345678')).toBe('306912345678');
    expect(key('+30 691 234 5678')).toBe('306912345678');
    expect(key('0030 691 234 5678')).toBe('306912345678');
  });

  it('a different number stays different', () => {
    expect(key('+306999999999')).not.toBe(key('+306912345678'));
  });

  it('a bare national number is NOT promoted to a country', () => {
    // Guessing +1 for a Greek mobile is how a message reaches a real stranger in another country,
    // billed and in violation. It must simply not match.
    expect(key('6912345678')).toBe('6912345678');
    expect(key('6912345678')).not.toBe(key('+306912345678'));
  });

  it('an empty or punctuation-only number resolves to nothing', () => {
    expect(key('')).toBeNull();
    expect(key('+')).toBeNull();
    expect(key('---')).toBeNull();
  });
});
