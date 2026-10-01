
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  extractIbans,
  extractIssuerContacts,
  findPdfLink,
  greekPhones,
  htmlToLines,
  readEinvoiceHtml,
} from '../../supabase/functions/_shared/finance/einvoice-issuer-details.ts';

const ROOT = join(__dirname, '..', '..');
const FN = stripComments(readFileSync(join(ROOT, 'supabase/functions/supplier-einvoice-details/index.ts'), 'utf8'));

const GOOD = 'GR1601101250000000012300695';
const BAD = 'GR1601101250000000012300699';

const PAGE = `<html><head><title>x</title><style>.a{}</style></head><body>
<label>Επωνυμία επιχείρησης</label><span>ΠΡΟΜΗΘΕΥΤΗΣ ΑΕ</span>
<label>ΑΦΜ</label><span>EL099999999</span>
<label>Τηλέφωνα</label><span>210 238 0826 - 210 232 0572</span>
<label>Φαξ</label><span>2102381093</span>
<label>Email</label><span>Info@Supplier.gr</span>
<div>Στοιχεία Πελάτη</div>
<label>ΑΦΜ</label><span>802349569</span>
<label>Τηλέφωνα</label><span>6948408542</span>
<label>Email</label><span>us@example.com</span>
<div>Στοιχεία Πληρωμής</div><span>IBAN: GR16 0110 1250 0000 0001 2300 695</span>
<span>Λάθος: ${BAD}</span><span>RF12914738662214382003681</span>
</body></html>`;

describe('IBANs', () => {
  it('reads a grouped IBAN and drops one that fails mod-97 — machine text has no misreads to show', () => {
    expect(extractIbans(htmlToLines(PAGE).join('\n'))).toEqual([GOOD]);
  });

  it('a non-IBAN run before it (the ΑΦΜ) does not swallow the IBAN that follows', () => {
    expect(extractIbans(`EL094143557 ${GOOD}`)).toEqual([GOOD]);
  });

  it('trailing text glued to the IBAN is cut at the country length', () => {
    expect(extractIbans(`${GOOD}ALPHA`)).toEqual([GOOD]);
  });

  it('a payment reference (RF…) is not an IBAN', () => {
    expect(extractIbans('RF12914738662214382003681')).toEqual([]);
  });
});

describe('issuer contacts', () => {
  it('reads only the block ABOVE the customer heading — our own phone and email are never filed', () => {
    const c = readEinvoiceHtml(PAGE, '099999999').contacts;
    expect(c).toEqual({ phones: ['2102380826', '2102320572'], faxes: ['2102381093'], emails: ['info@supplier.gr'] });
  });

  it('no contacts when the issuer ΑΦΜ is not in that block — it may be our block, not theirs', () => {
    expect(readEinvoiceHtml(PAGE, '123456789').contacts).toBeNull();
  });

  it('no contacts when there is no customer heading to bound the issuer block', () => {
    expect(extractIssuerContacts(['ΑΦΜ', 'EL099999999', 'Τηλέφωνα', '2102380826'], '099999999')).toBeNull();
  });

  it('phones: grouped, run together, +30 prefixed; anything not a Greek number is ignored', () => {
    expect(greekPhones('+30 210 2380826')).toEqual(['2102380826']);
    expect(greekPhones('2102380826 6948408542')).toEqual(['2102380826', '6948408542']);
    expect(greekPhones('42-118')).toEqual([]);
  });
});

describe('PDF behind a provider page', () => {
  it('follows a same-site PDF link and nothing else', () => {
    const page = 'https://e-invoicing.gr/edocuments/ViewInvoice/-1/abc';
    expect(findPdfLink('<a href="/api/DownloadPDFFile?contentType=PDF&amp;id=1">PDF</a>', page))
      .toBe('https://e-invoicing.gr/api/DownloadPDFFile?contentType=PDF&id=1');
    expect(findPdfLink('<a href="https://elsewhere.example/x.pdf">x</a>', page)).toBeNull();
    expect(findPdfLink('<link href="/build/pdf-default.css">', page)).toBeNull();
  });
});

describe('the edge function', () => {
  it('never writes the payment-destination table — IBANs go to review as einvoice_provider sightings', () => {
    expect(FN).not.toContain("'crm_bank_accounts'");
    expect(FN).toContain("rpc('crm_record_bank_account_suggestion'");
    expect(FN).toContain("p_source: 'einvoice_provider'");
  });

  it('fetches through the SSRF guard and re-validates every redirect hop', () => {
    expect(FN).toContain('assertSafeUrl(url');
    expect(FN).toContain("redirect: 'manual'");
  });

  it('verifies workspace membership before reading anything', () => {
    expect(FN.indexOf('userCanAccessWorkspace(')).toBeGreaterThan(-1);
    expect(FN.indexOf('userCanAccessWorkspace(')).toBeLessThan(FN.indexOf('await readAll<CompanyRow>'));
  });

  it('pages past the 1,000-row PostgREST cap rather than trusting a large .limit()', () => {
    expect(FN).not.toMatch(/\.limit\(\s*\d{4,}/);
    expect(FN).toContain('.range(from, to)');
  });

  it('a re-read of the same document is not filed as a second sighting', () => {
    expect(FN.indexOf('fromThisDoc.has(iban)')).toBeLessThan(FN.indexOf("rpc('crm_record_bank_account_suggestion'"));
  });

  it('a PDF yields IBANs only, never contacts: its text mixes our block into theirs', () => {
    expect(FN).toMatch(/kind === 'pdf'\)\s*\{\s*found = \{ ibans: await pdfIbans\(page\.bytes\), contacts: null \}/);
  });

  it('fills blanks only — an operator-typed phone, email or address is never overwritten', () => {
    expect(FN).toMatch(/blank\(c\.phone\)/);
    expect(FN).toMatch(/blank\(c\.email\)/);
    expect(FN).toContain('addressMissing(c)');
  });

  it('never writes crm_phones.phone_normalized — it is a GENERATED column', () => {
    expect(FN).not.toContain('phone_normalized');
  });
});
