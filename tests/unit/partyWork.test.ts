/**
 * A CRM party is a company OR a person, and every surface has to believe both.
 *
 * TWO DEFECTS THIS EXISTS FOR
 * ---------------------------
 * 1. **Contact-only counterparties.** The whole real-estate module was written with
 *    `*_contact_id` and no company twin, so a COMPANY could not be a vendor, a buyer, a landlord
 *    or a tenant — in a product sold to Greek construction and property firms. Nothing failed:
 *    the column simply did not exist, the UI only ever offered a person picker, and the gap was
 *    invisible until somebody asked why a company's record was empty (#376).
 *
 * 2. **A branch nobody added.** `get_party_work` is a UNION, and the party Work tab renders
 *    whatever it returns. A new party-linked table that nobody adds a branch for does not error —
 *    it just never appears, for every party, forever. That is the silent-zero shape: a plausible
 *    empty list and no signal at all.
 *
 * Both are checked against the SOURCE, not the live DB, because the repo is what CI has. The live
 * half is covered by `check_security_invariants()` and the migration itself.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TAB = join(ROOT, 'src', 'modules', 'crm', 'components', 'PartyWorkTab.tsx');
const RECORD_TABS = join(ROOT, 'src', 'modules', 'crm', 'recordTabs.ts');

const read = (p: string) => readFileSync(p, 'utf8');

describe('the party Work tab', () => {
  it('exists and is mounted by BOTH record pages', () => {
    expect(existsSync(TAB), 'PartyWorkTab.tsx is missing').toBe(true);
    for (const page of ['CompanyDetailPage.tsx', 'ContactDetailPage.tsx']) {
      const src = read(join(ROOT, 'src', 'modules', 'crm', 'pages', page));
      expect(
        src.includes('<PartyWorkTab'),
        `${page} does not mount PartyWorkTab. The tab is the whole point of #376: a company and a ` +
          'person get the SAME answer to "what work is booked against this record?". Mounting it ' +
          'on one and not the other is how the two records drifted apart in the first place.',
      ).toBe(true);
    }
  });

  it('passes a party kind that get_party_work accepts', () => {
    for (const page of ['CompanyDetailPage.tsx', 'ContactDetailPage.tsx']) {
      const src = read(join(ROOT, 'src', 'modules', 'crm', 'pages', page));
      const expected = page.startsWith('Company') ? 'company' : 'contact';
      expect(
        new RegExp(`partyKind=["']${expected}["']`).test(src),
        `${page} must pass partyKind="${expected}" — the function RAISES on anything else, and ` +
          'the two pages are easy to copy-paste between.',
      ).toBe(true);
    }
  });

  it('keeps every retired tab value working as a deep link', () => {
    const src = read(RECORD_TABS);
    // `asset-service-reminders-cron` writes ?tab=warranties into user_notifications.action_url,
    // and rows already stored keep saying it. A dropped key does not 404 — it opens the record
    // with no pane selected and a blank body, which is why these must resolve rather than vanish.
    for (const legacy of ['warranties', 'projects', 'property', 'equipment']) {
      expect(
        new RegExp(`\\b${legacy}\\s*:`).test(src),
        `recordTabs.ts no longer maps "${legacy}". Every one of these is a live URL in somebody's ` +
          'inbox or in a stored action_url. Renaming a tab means keeping the old value resolving, ' +
          'not rewriting history.',
      ).toBe(true);
    }
  });

  it('resolves an alias CHAIN, not just one hop', () => {
    const src = read(RECORD_TABS);
    // equipment -> warranties -> work is two hops. A single lookup returns "warranties", which is
    // no longer a tab, so the oldest links in circulation would land nowhere.
    expect(
      /for\s*\(|while\s*\(/.test(src),
      'resolveRecordTab must follow the alias chain to a fixed point. `equipment` was renamed to ' +
        '`warranties` and `warranties` then merged into `work`, so the oldest links need two hops.',
    ).toBe(true);
  });

  it('does not re-derive the roll-up client-side', () => {
    const src = read(TAB);
    expect(
      src.includes("rpc('get_party_work'"),
      'PartyWorkTab must read get_party_work. Fetching each entity type separately here is exactly ' +
        'the scattering #376 removed, and it is how the thirteenth type ends up half-wired.',
    ).toBe(true);
    expect(
      /\.from\(['"](projects|quotes|orders|invoices|properties|moodboards)['"]\)/.test(src),
      'PartyWorkTab queries a work table directly. The union is derived in SQL — one place to add ' +
        'a type, one place to get the tenancy check right.',
    ).toBe(false);
  });

  it('renders a kind the function returns even when this file has no label for it', () => {
    const src = read(TAB);
    // The silent-zero guard, at the UI layer: a new UNION branch must SHOW UP unlabelled rather
    // than be filtered out by a lookup miss. `KINDS[kind] ?? fallback` is what makes that true.
    expect(
      /KINDS\[\w+\]\s*\?\?/.test(src),
      'An unrecognised kind must fall back to a rendered group, not disappear. A branch added to ' +
        'get_party_work that nobody labels here would otherwise be invisible for every party, ' +
        'forever, with nothing failing.',
    ).toBe(true);
  });

  it('never links a satellite to its own id', () => {
    const src = read(TAB);
    // A tenancy / sale / offer id is not a route. `/properties/<tenancy_id>` renders the
    // catch-all NotFound rather than failing loudly — the dead-link shape deepLinkTargets exists
    // for. Each satellite must route through parent_id.
    for (const kind of ['tenancy', 'property_sale', 'property_offer']) {
      const line = src.split('\n').find((l) => l.trim().startsWith(`${kind}:`));
      expect(line, `no KINDS entry for ${kind}`).toBeTruthy();
      expect(
        line!.includes('r.parent_id'),
        `${kind} must open its parent property via r.parent_id. Linking /properties/<${kind}_id> ` +
          'resolves to the catch-all and renders NotFound — silently.',
      ).toBe(true);
    }
  });
});
