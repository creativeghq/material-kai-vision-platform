/**
 * Which link a surface shows for a filed document.
 *
 * A self-printed document's QR must open the provider's registered copy — Novus's rule for its
 * certification (scenario Β3), and the link it files with ΑΑΔΕ as downloadingInvoiceUrl
 * (Α.1128/2025). Everywhere else a person is sent to VERIFY a document, the link is ΑΑΔΕ's own.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

/** Where the document itself is printed, so the QR on it opens the provider's filed copy. */
const PRINTED_QR = [
  'src/modules/finance/invoice-templates/renderData.ts',
  'src/modules/finance/pages/PosPage.tsx',
];

/** Where someone is invited to check a document — ΑΑΔΕ's own link. */
const VERIFY_LINKS = [
  'supabase/functions/finance-send-invoice-email/index.ts',
  'src/pages/Admin/InvoiceDetailPage.tsx',
  'src/modules/finance/components/InvoiceActionsMenu.tsx',
];

describe('the printed QR opens the provider\'s filed copy', () => {
  it('the PDF draws fiscal_qr_url, falling back to ΑΑΔΕ\'s link only when there is none', () => {
    const pdf = read('supabase/functions/finance-invoice-pdf/index.ts');
    expect(pdf).toMatch(/const fiscalQr = String\(inv\.fiscal_qr_url \|\| inv\.fiscal_aade_qr_url/);
    expect((pdf.match(/drawQr\(page, fiscalQr,/g) ?? []).length).toBe(2);
    expect(pdf).not.toMatch(/drawQr\(page, String\(inv\.fiscal_aade_qr_url\)/);
  });

  it.each(PRINTED_QR)('%s prefers fiscal_qr_url over ΑΑΔΕ\'s link', (path) => {
    expect(read(path)).toMatch(/fiscal_qr_url\s*(\|\||\?\?)\s*inv\.fiscal_aade_qr_url/);
  });

  it.each(VERIFY_LINKS)('%s sends people to ΑΑΔΕ to verify, never to the provider', (path) => {
    // `fiscal_qr_url:` as a KEY is allowed: it is a merge field in workspace email templates.
    expect(read(path)).not.toMatch(/\.fiscal_qr_url/);
  });
});

describe('what the provider is given and what it keeps', () => {
  it('the connector records both links — the provider\'s is also support evidence', () => {
    const conn = read('supabase/functions/_shared/fiscal/novus.ts');
    expect(conn).toMatch(/qrUrl: entry\?\.qrUrl/);
    expect(conn).toMatch(/aadeQrUrl: entry\?\.aadeQrUrl/);
  });

  it('nothing hands the CUSTOMER\'s email address to the provider', () => {
    // The provider mails whatever address it is given, and we own the customer channel. The
    // issuer's own address is fine — it is the letterhead of the document they render for us.
    const conn = read('supabase/functions/_shared/fiscal/novus.ts');
    const counterpartBlock = conn.slice(conn.indexOf('counterpart: {'), conn.indexOf('additionalDetails'));
    expect(counterpartBlock).not.toMatch(/email/);
  });
});

describe('the public pay page states the filed facts', () => {
  it('returns them for a payable AND an already-paid document, by the token-resolved id', () => {
    const fn = read('supabase/functions/finance-pay-invoice/index.ts');
    expect((fn.match(/fiscal: await fiscalRecord\(supabase, row\.invoice_id\)/g) ?? []).length).toBe(2);
  });

  it('renders them in both states', () => {
    const page = read('src/pages/PayInvoicePage.tsx');
    expect((page.match(/<FiscalRecordPanel fiscal=\{fiscal\} \/>/g) ?? []).length).toBe(2);
  });
});
