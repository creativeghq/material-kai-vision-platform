/**
 * Delivery trail — registry + single-derivation guard.
 *
 * Three failure shapes this feature is exposed to, none of them visible to TypeScript:
 *
 *  1. **Four-copy drift.** The list of trackable document types lives in FOUR places: the
 *     `document_events.entity_type` CHECK, the `email_logs.entity_type` CHECK, the edge-side
 *     `DOCUMENT_ENTITY_TYPES` and the frontend `DOCUMENT_ENTITY_TYPES`. Add a type to some and
 *     not others and it fails in a specific, silent way: the page records a view, the INSERT
 *     throws a CHECK violation, `record_document_event` swallows it (deliberately — analytics
 *     must never break a customer's page), and the list column reads "never opened" forever.
 *     That is the same shape as the invite roles that were offerable but not storable.
 *
 *  2. **An eighth counter.** This feature exists because "was it viewed?" had SEVEN answers.
 *     A new `increment_*_view` RPC or a `view_count = x + 1` write in an edge function
 *     re-creates the exact bug — and a wrong count is a valid number, so nothing raises.
 *
 *  3. **Re-derivation in TypeScript.** `emailStatus` / `viewCount` come from
 *     `get_document_delivery`. A component that recomputes "opened = openedAt != null" is a
 *     second derivation that will disagree with SQL the moment the ladder changes (a bounce
 *     must outrank an open — a component doing its own null-check gets that backwards).
 *
 * Mirrors the reasoning in moneyDerivation.test.ts and templateRegistry.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DOCUMENT_ENTITY_TYPES } from '@/services/documentDeliveryTypes';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

/**
 * Source with comments removed. The "don't read a legacy counter" check must look
 * at CODE — the doc comments in these files name `properties.view_count` precisely
 * to explain why it must not be read, and a naive scan flags its own warning.
 */
const readCode = (p: string) =>
  sharedStripComments(read(p));

/**
 * The live values of both CHECK constraints, transcribed from the applied migrations
 * `document_events_delivery_trail` and `email_logs_entity_link`. Verify with:
 *   select pg_get_constraintdef(oid) from pg_constraint
 *    where conname in ('document_events_entity_type_check', 'email_logs_entity_type_check');
 */
const DB_ALLOWED_ENTITY_TYPES = [
  'invoice', 'quote', 'contract', 'statement', 'catalog',
  'moodboard_sheet', 'client_view', 'property_listing', 'moodboard',
  'storefront', 'order',
];

const EDGE_WRITER = 'supabase/functions/_shared/document-events.ts';
const FE_SERVICE = 'src/services/documentDeliveryService.ts';
const FE_TYPES = 'src/services/documentDeliveryTypes.ts';

/** Parse the `as const` array out of a source file so both copies are compared as data. */
function parseEntityTypes(source: string): string[] {
  const m = source.match(/DOCUMENT_ENTITY_TYPES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!m) throw new Error('DOCUMENT_ENTITY_TYPES not found — did the declaration move?');
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

describe('document entity types ↔ DB CHECK constraints', () => {
  it('the frontend registry matches the DB CHECK exactly', () => {
    expect([...DOCUMENT_ENTITY_TYPES].sort()).toEqual([...DB_ALLOWED_ENTITY_TYPES].sort());
  });

  it('the edge-side registry matches the frontend registry exactly', () => {
    // Two runtimes, no shared module (Deno cannot import from src/). A duplicated
    // list is the price; drift between them is not.
    expect(parseEntityTypes(read(EDGE_WRITER)).sort()).toEqual(parseEntityTypes(read(FE_TYPES)).sort());
  });

  it('email_logs accepts exactly the same set as document_events', () => {
    // A type storable on the event but not on the log means the webhook can never
    // fan that document's provider events anywhere — the email half stays blank.
    const writer = read(EDGE_WRITER);
    for (const t of DB_ALLOWED_ENTITY_TYPES) {
      expect(writer, `${t} missing from the edge registry`).toContain(`'${t}'`);
    }
  });
});

describe('no eighth view counter', () => {
  /**
   * The seven trackers this feature replaced. Each legacy counter is allowed to
   * survive as a CACHED COPY, but only bumped through `bump_legacy_view_counter`
   * (atomic) or its pre-existing `increment_*` RPC — never by a fresh
   * read-modify-write, which is what silently lost concurrent views on moodboard
   * sheets and statements.
   */
  const EDGE_DIR = 'supabase/functions';
  const FILES_THAT_TOUCH_COUNTERS = [
    'moodboard-sheet-share', 'real-estate-public', 'catalog-access',
    'quote-public-share', 'finance-send-statement', 'finance-pay-invoice', 'contracts-api',
  ];

  it('every public-page surface writes the delivery trail', () => {
    for (const fn of FILES_THAT_TOUCH_COUNTERS) {
      const src = read(join(EDGE_DIR, fn, 'index.ts'));
      expect(src, `${fn} does not record a document event — its views are invisible`)
        .toMatch(/recordPageEvent\(/);
    }
  });

  it('no edge function re-introduces a read-modify-write view counter', () => {
    // `share_view_count: (x ?? 0) + 1` and friends. The atomic RPC is fine; the
    // read-then-write is the bug — two concurrent viewers both read N, both write N+1.
    const OFFENDER = /(view_count|share_view_count)\s*:\s*\(?[\w.?\s]*\?\?\s*0\)?\s*\+\s*1/;
    for (const fn of FILES_THAT_TOUCH_COUNTERS) {
      const src = read(join(EDGE_DIR, fn, 'index.ts'));
      const hit = src.match(OFFENDER);
      // finance-send-statement is the ONE documented survivor: its counter is bumped
      // inside the same guarded unlock path that resets failed_attempts, and it is
      // explicitly marked a cached copy. Everything else must use the atomic RPC.
      if (fn === 'finance-send-statement') continue;
      expect(hit, `${fn} re-introduced a read-modify-write view counter: ${hit?.[0]}`).toBeNull();
    }
  });
});

describe('one derivation — TypeScript formats, SQL derives', () => {
  it('the service reads get_document_delivery and nothing else', () => {
    const src = read(FE_SERVICE);
    expect(src).toContain("supabase.rpc('get_document_delivery'");
    // No direct table read: counting document_events in the client is a second
    // derivation that will disagree with the SQL ladder.
    expect(src).not.toMatch(/\.from\(\s*'document_events'\s*\)/);
  });

  it('the cell component derives no status of its own', () => {
    const src = read('src/components/features/finance/DeliveryTrailCell.tsx');
    // A component that recomputes "opened" from a timestamp gets the ladder wrong:
    // a bounced email also has a sentAt, and "they read it" next to "it never
    // arrived" is the failure this whole table exists to prevent.
    expect(src).not.toMatch(/emailStatus\s*=\s*[^;]*(firstOpenedAt|deliveredAt|sentAt)\s*(!==|!=)\s*null/);
    expect(src).toMatch(/trail\?\.emailStatus|t\?\.emailStatus/);
  });

  it('legacy counters are never read as the answer', () => {
    // properties.view_count et al are cached copies now. Reading one to render the
    // trail re-creates the drift the derivation exists to collapse.
    //
    // Note the RPC's OWN `r.view_count` is the derived answer and must not be
    // flagged — so this checks for the two things that can only come from a
    // legacy source: the `share_view_count` column name (which exists on no
    // other surface), and a direct table read of any counter-bearing table.
    const src = readCode(FE_SERVICE) + readCode('src/components/features/finance/DeliveryTrailCell.tsx');
    expect(src).not.toMatch(/share_view_count/);
    const LEGACY_TABLES = [
      'properties', 'moodboards', 'moodboard_presentation_sheets',
      'project_client_views', 'presentation_catalogs', 'finance_statement_shares',
      'quote_analytics_events', 'catalog_view_events',
    ];
    for (const t of LEGACY_TABLES) {
      expect(src, `the trail must not read ${t} directly — get_document_delivery is the source`)
        .not.toMatch(new RegExp(`\\.from\\(\\s*'${t}'`));
    }
  });
});
