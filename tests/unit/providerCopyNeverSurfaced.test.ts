/** The provider's copy of a document is never shown — to a customer or to an operator. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

/** Everything a customer or an operator can actually look at. */
const SURFACES = [
  'supabase/functions/finance-invoice-pdf/index.ts',
  'supabase/functions/finance-send-invoice-email/index.ts',
  'src/modules/finance/invoice-templates/renderData.ts',
  'src/modules/finance/pages/PosPage.tsx',
  'src/pages/Admin/InvoiceDetailPage.tsx',
  'src/modules/finance/components/InvoiceActionsMenu.tsx',
];

describe('no surface renders the provider\'s own link', () => {
  it.each(SURFACES)('%s uses the AADE url, never fiscal_qr_url', (path) => {
    const src = read(path);
    // Forbids READING the column (`inv.fiscal_qr_url`, `f.fiscal_qr_url`, …). It deliberately
    // still allows `fiscal_qr_url:` as a KEY, because that is the merge field a workspace's own
    // email template writes as `{{fiscal_qr_url}}` — renaming it would silently blank the link in
    // every template that already uses it, so the NAME stays and the VALUE it is fed is AADE's.
    expect(src, `${path} still reads the provider url`).not.toMatch(/\.fiscal_qr_url/);
  });

  it('the PDF draws AADE\'s url, or draws no QR at all', () => {
    const pdf = read('supabase/functions/finance-invoice-pdf/index.ts');
    expect(pdf).toMatch(/drawQr\(page, String\(inv\.fiscal_aade_qr_url\)/);
    // No fallback to the provider's: a document with no AADE url (still queued offline, so no
    // MARK either) carries no QR rather than one pointing somewhere else.
    expect(pdf).not.toMatch(/fiscal_aade_qr_url\s*\|\|\s*inv\.fiscal_qr_url/);
  });

  it('the connector still RECORDS the provider url — it is support evidence, not output', () => {
    // Keeping it is deliberate: when a transmission is disputed, their copy is what they will
    // quote back. The rule is that it never reaches a rendering surface, not that we discard it.
    const conn = read('supabase/functions/_shared/fiscal/novus.ts');
    expect(conn).toMatch(/qrUrl: entry\?\.qrUrl/);
    expect(conn).toMatch(/aadeQrUrl: entry\?\.aadeQrUrl/);
  });

  it('nothing hands the CUSTOMER\'s email address to the provider', () => {
    // The provider can auto-email from the payload, and we own the customer channel. The issuer's
    // own address is fine — it is the letterhead of the document they render for us.
    const conn = read('supabase/functions/_shared/fiscal/novus.ts');
    const counterpartBlock = conn.slice(conn.indexOf('counterpart: {'), conn.indexOf('additionalDetails'));
    expect(counterpartBlock).not.toMatch(/email/);
  });
});
