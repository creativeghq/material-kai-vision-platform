/**
 * A bounded sweep says where it stopped, a reference match is a match, and a duplicate stays
 * inside its own workspace (#359 CM-13 / CM-16 / CM-17).
 *
 * CM-13: the page walk is newest-first and capped at 20 × 500. When the cap was hit, everything
 * older was left behind — and the watermark still advanced to the newest transaction seen, so the
 * next run started after them. Those transactions sat outside every future window, and the run
 * returned `ok: true`. The same watermark-advances-past-the-failure shape confirmed as FE-20 in
 * #351.
 *
 * CM-16: `refText.includes(numberKey)` is a bare substring, on strings already reduced to
 * `A-Z0-9` runs. A bill numbered `7` matched the reference "INVOICE 1007". Auto-settling is the
 * one action here that moves money against a document with no human in the loop.
 *
 * CM-17: the heal-on-duplicate path looked a payment up by `(provider, provider_ref)` alone. Two
 * workspaces can have the SAME Revolut organisation connected, and then that pair exists in both.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const sync = read('supabase/functions/_shared/revolut/sync-core.ts');
const reconcile = read('supabase/functions/_shared/revolut/reconcile.ts');

/**
 * The shipped predicate, re-implemented from the source rather than imported: `reconcile.ts` is a
 * Deno module with `@supabase/supabase-js` and `Deno.env` in its import graph, so vitest cannot
 * load it. Kept in step by the source assertions below.
 */
const MIN_LEN = 4;
const quotes = (refText: string, numberKey: string): boolean =>
  !!numberKey && numberKey.length >= MIN_LEN && ` ${refText} `.includes(` ${numberKey} `);

describe('#359 CM-16 — a reference match is a whole token', () => {
  it('matches a quoted document number', () => {
    expect(quotes('PAYMENT FOR INV1042 THANKS', 'INV1042')).toBe(true);
    expect(quotes('INV1042', 'INV1042')).toBe(true);
  });

  it('no longer matches a number buried inside a longer one', () => {
    // The defect: `7` matched "INVOICE 1007", and `21` matched every transfer mentioning a date.
    expect(quotes('INVOICE 1007', '1007')).toBe(true);
    expect(quotes('INVOICE 1007', '007')).toBe(false);
    expect(quotes('INVOICE 10042', 'INV1042')).toBe(false);
  });

  it('refuses a number too short to identify anything', () => {
    for (const n of ['7', '21', '100']) {
      expect(quotes(`PAYMENT ${n} SOMETHING`, n), n).toBe(false);
    }
  });

  it('an empty key never matches', () => {
    expect(quotes('ANYTHING', '')).toBe(false);
  });

  it('the source uses that predicate on BOTH ladders', () => {
    expect(reconcile).toMatch(/function referenceQuotes/);
    expect(reconcile).toMatch(/MIN_AUTO_MATCH_NUMBER_LEN = 4/);
    expect(reconcile).toMatch(/referenceQuotes\(refText, nameKey\(i\.internal_number\)\)/);
    expect(reconcile).toMatch(/referenceQuotes\(refText, b\.numberKey\)/);
    // Both call sites, gone.
    expect(reconcile, 'a bare substring match is back')
      .not.toMatch(/sameCurrency\.filter\(\(i\) => refText\.includes/);
    expect(reconcile, 'a bare substring match is back')
      .not.toMatch(/sameCcy\.filter\(\(b: any\) => b\.numberKey && refText\.includes/);
  });

  it('a short number still reaches a human through the amount+name ladder', () => {
    // Refusing the auto-settle is not refusing the match — the candidate still surfaces.
    expect(reconcile).toMatch(/byAmountName/);
    expect(reconcile).toMatch(/suggested_invoice_ids|suggested\+\+/);
  });
});

describe('#359 CM-17 — a duplicate is looked up in your own workspace', () => {
  it('the heal-on-duplicate read is workspace-scoped', () => {
    expect(reconcile).toMatch(/from\('payments'\)\s*\n?\s*\.select\('id'\)\.eq\('workspace_id', workspaceId\)/);
  });

  it('no payments read matches on provider_ref alone', () => {
    const bare = reconcile.match(/from\('payments'\)[\s\S]{0,200}?\.eq\('provider_ref'[^\n]*\n/g) ?? [];
    for (const m of bare) {
      expect(m, 'a payments lookup skips the workspace').toContain("workspace_id");
    }
  });
});

describe('#359 CM-13 — a capped run records the hole it left', () => {
  it('the cursor pair travels with the watermark', () => {
    // Advancing one without recording the other is what made a capped run indistinguishable from
    // a complete one.
    const update = sync.slice(sync.indexOf("from('workspace_revolut_config')"), sync.indexOf("eq('workspace_id', workspaceId);"));
    expect(update).toMatch(/sync_watermark: maxCreated/);
    expect(update).toMatch(/sync_backfill_before: holeBefore/);
    expect(update).toMatch(/sync_backfill_from:/);
  });

  it('a capped walk records where it stopped', () => {
    expect(sync).toMatch(/holeBefore = to;/);
    expect(sync).toMatch(/truncated = true;/);
  });

  it('a later run resumes from the cursor rather than re-reading the newest pages', () => {
    expect(sync).toMatch(/if \(!truncated && cfg\.sync_backfill_before\)/);
    expect(sync).toMatch(/let bTo: string \| undefined = cfg\.sync_backfill_before/);
    // A SHORT page is what closes the hole; anything else moves the cursor down.
    expect(sync).toMatch(/if \(batch\.length < PAGE\) \{ closed = true; break; \}/);
    expect(sync).toMatch(/holeBefore = closed \? null : \(bTo \?\? null\)/);
  });

  it('the backfill gets half a budget, so a backlog does not block today', () => {
    expect(sync).toMatch(/page < MAX_PAGES \/ 2/);
  });

  it('a completed run clears the cursor', () => {
    expect(sync).toMatch(/\} else if \(!truncated\) \{\s*\n\s*holeBefore = null;/);
  });

  it('an open hole is part of the RESULT, not just a console line', () => {
    // `truncated` was already reported; a hole that stays open across runs is the thing an ops
    // probe needs, and a warning nobody reads is how a skipped window survives for months.
    expect(sync).toMatch(/backfillPending: holeBefore != null/);
    expect(sync).toMatch(/backfillPending\?: boolean;/);
  });
});
