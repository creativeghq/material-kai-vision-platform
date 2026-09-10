/** CRM record-timeline derivation guard. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SERVICE = 'src/services/crmActivitiesService.ts';

/** Strip comments so prose describing the old bug doesn't trip the scanner. */
function stripComments(src: string): string {
  return sharedStripComments(src);
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
      'project_created', 'project_event', 'moodboard_created', 'sheet_created',
      'moodboard_quote_requested', 'client_view_shared', 'client_feedback', 'property_viewing',
      'page_visit', 'catalog_access', 'quote_downloaded',
      'email_opened', 'email_clicked', 'email_bounced',
    ];
    const found = derived.filter((t) => source.includes(`'${t}'`) || source.includes(`"${t}"`));
    expect(found, 'these are derived by crm_record_timeline — do not log them').toEqual([]);
  });
});
