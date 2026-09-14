/**
 * From 1/10/2026 a B2B invoice issued from our own ERP is legally NON-ISSUANCE (#444).
 *
 * Ε.2004/13.02.2026 §2: issuance «με χειρόγραφο τρόπο ή άλλο τεχνικό μέσο (πχ εμπορικό/λογιστικό
 * πρόγραμμα ERP) … θεωρείται ως μη έκδοση του τιμολογίου αυτού». The transmission still succeeds
 * and still returns a MARK — the unlawful path and the lawful one are indistinguishable from the
 * outside. That is the whole reason the CHANNEL has to be a recorded per-document fact rather than
 * a config flag, and why a fallback is an incident that gets counted rather than a retry.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const issue = read('supabase/functions/finance-issue-invoice/index.ts');
const card = read('src/modules/finance/components/EInvoicingMandateCard.tsx');
const service = read('src/modules/finance/services/einvoiceMandateService.ts');
const settings = read('src/modules/finance/tabs/SettingsTab.tsx');

describe('the issuance channel is recorded where the transmission happens', () => {
  it('a transmitted document is stamped', () => {
    expect(issue, 'nothing records how a document was issued')
      .toContain('stamp_invoice_issuance_channel');
  });

  it('the stamp happens only after the transmission was accepted', () => {
    // Stamping before the provider accepted would claim a lawful issuance for a document that
    // may never have reached anyone.
    const accepted = issue.indexOf("const accepted = result.status === 'accepted'");
    const stamp = issue.indexOf('stamp_invoice_issuance_channel');
    expect(accepted, 'the accepted check moved — re-read this file').toBeGreaterThan(-1);
    expect(stamp, 'the channel is stamped before the transmission is known to have worked')
      .toBeGreaterThan(accepted);
  });

  it('a failed stamp is reported, not swallowed', () => {
    // An unstamped document is one nobody can later show was lawfully issued.
    const at = issue.indexOf('stamp_invoice_issuance_channel');
    expect(issue.slice(at, at + 900)).toMatch(/console\.error/);
  });

  it('the channel is never inferred from the connector slug', () => {
    // `fiscal_connector_slug` says who carried it, which is a different fact and can change
    // under the document later.
    expect(issue).not.toMatch(/issuance_channel:\s*resolved/);
  });
});

describe('the mandate is surfaced, not assumed', () => {
  it('the card is mounted in Finance settings', () => {
    expect(settings).toContain('EInvoicingMandateCard');
  });

  it('it counts the fallback and the unrecorded separately', () => {
    // "Fell back to ERP" and "we never recorded a channel" are different findings: the first is
    // lawful under an outage, the second cannot be shown to be lawful at all.
    expect(card).toContain('via_erp_fallback');
    expect(card).toContain('channel_unrecorded');
  });

  it('the compliance count is derived in SQL, not totalled in the card', () => {
    // A compliance number totalled beside the rule is the shape where the two drift and the
    // screen keeps reporting a clean bill.
    expect(service).toContain('einvoice_mandate_position');
    expect(card).not.toMatch(/\.filter\(\(r\) => r\.issuance_channel/);
  });

  it('a failed read says so rather than reporting a clean bill', () => {
    // An empty state built out of an error is a compliance claim nobody made.
    expect(card).toContain('setFailed(true)');
    expect(card).toMatch(/not a statement that it is clean/);
  });

  it('it counts only documents issued from the mandate date', () => {
    // A document issued before 1/10/2026 with no channel is history, not an exposure. The date
    // comes back with the verdict rather than being restated on screen.
    expect(card).toContain('mandate_from');
  });

  it('the filing that makes any of it lawful is tracked and is named as an operator action', () => {
    expect(card).toContain('DECLARATION_IS_AN_OPERATOR_ACTION');
    expect(service).toContain('einvoice_start_declaration_filed_on');
  });

  it('the inbound duty is surfaced, and a myDATA pull is not counted as acceptance', () => {
    expect(card).toContain('pullIsNotAcceptance');
    expect(service).toContain('inbound_einvoice_position');
  });
});

describe('the provider and the standard disagree on a field name', () => {
  it('the trap is written down where the binding will be made', () => {
    // The provider's swagger still carries `invoiveDeliveryStatus` -- the misspelling AADE
    // corrected in v2.0.1. We speak to Novus, so the PROVIDER's spelling is the one that works,
    // and binding to the standard's is a silent breaker: the request is accepted and the field
    // is ignored.
    // Raw, not comment-stripped: here the COMMENT is the artifact under test.
    const novus = readFileSync(join(ROOT, 'supabase/functions/_shared/fiscal/novus.ts'), 'utf8');
    expect(novus, 'nothing warns the next person about the delivery-status spelling')
      .toContain('invoiveDeliveryStatus');
  });

  it('the swagger really does still carry it', () => {
    // If the provider ever fixes it, this fails and the comment above should be revisited
    // rather than left to describe a divergence that no longer exists.
    //
    // `AadeSpec/` is gitignored (8MB of AADE PDFs), so the file is ABSENT in CI. Absent is "we
    // could not check", never "the divergence is gone" — and the guard that protects the binding
    // is the one above, which reads a committed file and runs everywhere.
    const spec = join(ROOT, 'src/modules/myaade/AadeSpec/novus-swagger-2026-09-11.json');
    if (!existsSync(spec)) return;
    expect(readFileSync(spec, 'utf8')).toContain('invoiveDeliveryStatus');
  });
});
