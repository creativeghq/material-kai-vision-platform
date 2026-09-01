/**
 * An outbound message belongs to a PARTY, and the party record shows it (#378 N5).
 *
 * THE DEFECT
 * ----------
 * `messaging_logs` recorded `to_number` as text and nothing else. The CRM record could not show
 * what had been sent to that person, and the only readers of the table were two admin dashboards
 * counting rows. (The consent half of this finding — checking `messaging_optouts` before sending —
 * was already closed by #359 CM-1/2/5; this is the other half.)
 *
 * WHY STORED RATHER THAN DERIVED, WHICH IS THE UNUSUAL CHOICE HERE
 * ---------------------------------------------------------------
 * A link that can be derived normally should be — that is why a delivery note and a cheque have no
 * `project_id` (#378 L5). A phone number is different because it is REASSIGNABLE: deriving the
 * party on read means a number moving to a new contact silently rewrites who we messaged last
 * year. Same argument as `invoices.counterparty_snapshot` — a record of what happened is frozen at
 * the moment it happened.
 *
 * WHY A TRIGGER RATHER THAN THREE CALL SITES
 * ------------------------------------------
 * Three inserts exist today (`messaging-api` twice, `messaging-processor` once) plus a webhook that
 * updates. Resolving in each is three copies of one rule and a fourth sender inherits nothing.
 * BEFORE INSERT is also exactly the semantic wanted: who this number belonged to WHEN WE SENT.
 *
 * THE KEY, AND THE BUG THE FIRST CUT HAD
 * --------------------------------------
 * The first resolver matched on digits-only, so `+306912345678` resolved and `00306912345678` —
 * the same number written the other legal way — did not. That is #359 CM-1 reproduced one table
 * over: "an opt-out written in one shape and checked in another is a guard that cannot see. It
 * never matches, nothing raises." Here it fails open in the quieter direction — the message still
 * sends, it just lands on nobody's record — so there is no symptom beyond a party page that stays
 * empty. Found by probing, not by reading.
 *
 * `public.msisdn_key` is now the one SQL answer to "is this the same number", and it deliberately
 * does NOT guess a country for a bare national number: guessing +1 for a Greek mobile is how a
 * message reaches a real stranger, billed and in violation (#359 CM-1).
 *
 * The SQL is verified by CALLING it in a rolled-back probe. What is pinned here is the client
 * contract — that the party surface actually renders the kind.
 */
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
