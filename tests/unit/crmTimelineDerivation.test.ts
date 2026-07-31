/**
 * CRM record-timeline derivation guard.
 *
 * The bug this exists to stop: the contact/company Activity feed used to be a WRITE-LOG. Two
 * triggers (`crm_log_invoice_created`, `crm_log_quote_created`) inserted `crm_activities` rows
 * and nothing else did — so orders, payments in and out, supplier bills, credit notes and
 * shipments never appeared on a party's record at all, even though every one of them was
 * stored correctly. And the entries it DID write went stale: every "Invoice created" row on
 * the platform pointed at an invoice that had since been deleted.
 *
 * A log of events that already exist as documents is a duplicate derivation. `crm_record_timeline`
 * is the single one: business events come from the documents, and `crm_activities` / `crm_notes` /
 * `crm_meetings` are left to carry only the things that have no document (notes, calls, emails
 * sent, lead status changes). Nothing to backfill, nothing to drift.
 *
 * This test fails the build if the feed is re-assembled in TypeScript, or if a new business
 * event starts being hand-logged into `crm_activities` instead of derived.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SERVICE = 'src/services/crmActivitiesService.ts';

/** Strip comments so prose describing the old bug doesn't trip the scanner. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const source = stripComments(readFileSync(join(ROOT, SERVICE), 'utf8'));

describe('the CRM record timeline has exactly one derivation', () => {
  it('reads the feed from crm_record_timeline', () => {
    expect(source).toContain("rpc('crm_record_timeline'");
  });

  /**
   * The five historical offenders were all `.from('crm_activities')` / `.from('crm_notes')` /
   * `.from('crm_meetings')` selects merged and sorted client-side. Reads of those tables belong
   * in the RPC now; the service may still WRITE to them (notes, calls, emails sent).
   */
  it('never re-assembles the feed from the underlying tables', () => {
    const offenders = source
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\.from\(['"]crm_(activities|notes|meetings)['"]\)/.test(line))
      // A write is fine — only a read rebuilds the feed.
      .filter(({ line }) => !/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(line))
      .filter(({ line }) => /\.select\(/.test(line))
      .map(({ line, n }) => `${SERVICE}:${n}  ${line}`);

    expect(offenders, 'timeline reads must go through crm_record_timeline').toEqual([]);
  });

  /**
   * Hand-logging a business event is how the feed went stale in the first place: the document
   * is the fact, the log row is a copy of it, and the copy outlives deletes and misses edits.
   */
  it('never hand-logs an event that a document already records', () => {
    const derived = [
      'quote_created', 'quote_accepted', 'order_created',
      'invoice_created', 'invoice_paid',
      'bill_received', 'bill_paid',
      'payment_received', 'payment_sent',
      'credit_note_issued', 'supplier_credit_note_received', 'shipment_created',
    ];
    const found = derived.filter((t) => source.includes(`'${t}'`) || source.includes(`"${t}"`));
    expect(found, 'these are derived by crm_record_timeline — do not log them').toEqual([]);
  });
});
