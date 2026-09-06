/**
 * What the customer's copy must carry, because WE render it and the provider does not.
 *
 * The platform serves its own PDF and never surfaces the provider's (#193). That decision moves
 * the provider's "General Provider Rules" onto us: everything their template would have printed,
 * ours has to. Read against the real document rules 2026-09-06 (#319), three were missing or
 * wrong and none of them could fail a typecheck — a document with no provider attribution is a
 * perfectly valid PDF.
 *
 *   1. "Each document issued through the Provider's services must display the Provider's name
 *      and website." Absent entirely — the words Novus and timologisi appeared nowhere in the
 *      generator.
 *   2. "The date and time of issuance should be clearly and legibly indicated." Both were
 *      printed, but through `toLocaleDateString()` with no timezone — and edge functions run in
 *      UTC, so a Greek business issuing at 00:30 Athens printed YESTERDAY's date on a document
 *      AADE numbered under today.
 *   3. "the Unique Payment Identity - transaction id combined with the Payment Signature […]
 *      must be included, for each amount payable separately." Nothing about a POS payment
 *      reached the paper.
 *
 * These are pinned by reading the generator rather than by rendering, because rendering needs
 * pdf-lib, fonts and a database; the failure mode being guarded against is a line being deleted,
 * which the source shows perfectly well.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const pdfSrc = stripComments(
  readFileSync(join(ROOT, 'supabase/functions/finance-invoice-pdf/index.ts'), 'utf8'),
);

describe('the printed document names who transmitted it', () => {
  it('prints a provider attribution beside the MARK', () => {
    expect(pdfSrc).toContain('providerAttribution');
    expect(pdfSrc).toMatch(/L\.transmittedVia/);
  });

  it('reads the attribution from the CONNECTOR, never hardcodes a provider name', () => {
    // Hardcoding would credit Novus for a document Novus never carried, and would go stale the
    // day a second connector exists.
    expect(pdfSrc).toContain('legal_display_name');
    expect(pdfSrc).not.toMatch(/Novus Conceptus/);
    expect(pdfSrc).not.toMatch(/timologisi\.online/);
  });

  it('takes the connector from the submission that actually carried this document', () => {
    expect(pdfSrc).toMatch(/connector_slug/);
  });
});

describe('the issue date and time are the issuer\'s clock, not the server\'s', () => {
  it('formats both with an explicit timeZone', () => {
    expect(pdfSrc).toMatch(/fmtIssueDate/);
    expect(pdfSrc).toMatch(/fmtIssueTime/);
    expect(pdfSrc).toMatch(/timeZone:\s*fiscalTz/);
  });

  it('uses the timezone the WORKSPACE stores, and falls back to Athens rather than UTC', () => {
    // `hr_settings.timezone` is NOT NULL with an Athens default and is what payroll and the
    // Ergani filings are already timed by. A country->zone map beside it would be a second
    // mechanism, and a worse one: most `finance_settings` rows have no country code at all.
    expect(pdfSrc).toMatch(/from\('hr_settings'\)/);
    expect(pdfSrc).toMatch(/'Europe\/Athens'/);
    expect(pdfSrc).not.toContain('FISCAL_TIMEZONE_BY_COUNTRY');
  });

  it('dates the on-screen preview by that same clock', () => {
    // The operator approves the preview and the customer receives the PDF; formatting one in the
    // browser's zone and the other in the workspace's is a difference nobody can see.
    const renderSrc = stripComments(
      readFileSync(join(ROOT, 'src/modules/finance/invoice-templates/renderData.ts'), 'utf8'),
    );
    expect(renderSrc).toMatch(/timeZone: fiscalTz/);
    expect(renderSrc).not.toMatch(/toLocaleDateString\(locale\)/);
  });

  it('never formats the fiscal date or time without a timezone again', () => {
    // The exact call that produced a UTC day on a Greek fiscal document.
    expect(pdfSrc).not.toMatch(/issuedAt\.toLocaleDateString\(locale\)/);
    expect(pdfSrc).not.toMatch(/issuedAt\.toLocaleTimeString\(locale,\s*\{\s*hour/);
  });
});

describe('a card or IRIS payment puts its identity on the document', () => {
  it('reads the completed provider signatures for the document', () => {
    expect(pdfSrc).toContain('pos_signatures');
    expect(pdfSrc).toMatch(/status['"]?\s*,\s*['"]completed['"]/);
  });

  it('prints the transaction id AND the signature', () => {
    expect(pdfSrc).toMatch(/L\.posTxn/);
    expect(pdfSrc).toMatch(/L\.posSignature/);
    expect(pdfSrc).toMatch(/signature_token/);
  });

  it('handles EVERY completed payment, not just the newest', () => {
    // "for each amount payable separately" — a receipt settled in two taps has two signatures.
    expect(pdfSrc).toMatch(/for \(const pmt of posPayments\)/);
  });

  it('does not put a POS payment block on a delivery note or a credit note', () => {
    expect(pdfSrc).toMatch(/kind !== 'delivery_note' && kind !== 'credit_note'/);
  });
});

describe('the fiscal identifiers that were already right stay right', () => {
  // `fiscal_aade_qr_url`, not `fiscal_qr_url`: the QR now encodes AADE's validation URL. The
  // provider's own link opens THEIR rendering of the document, which is never shown — see
  // tests/unit/providerCopyNeverSurfaced.test.ts.
  it.each(['fiscal_mark', 'authentication_code', 'fiscal_uid', 'fiscal_aade_qr_url'])(
    'still prints %s',
    (field) => { expect(pdfSrc).toContain(field); },
  );
});
