/**
 * Contact extraction off a scraped company page.
 *
 * The defect this closes: `company_website_scrape` asked Firecrawl for markdown with
 * `onlyMainContent: true`. That flag is a deterministic HTML filter which strips header, nav and
 * FOOTER — and Firecrawl applies it to the `links` array too. The footer and the imprint are
 * precisely where a company publishes its switchboard number, its contact address and its VAT
 * number, so the tool paid to fetch the page, discarded the three most useful fields on it, and
 * then asked an Opus pass to find "contact details" in text they had been removed from. Nothing
 * failed; the fields were simply always absent.
 *
 * The VAT number is the reason this matters beyond phone numbers. `create_company_from_vat`
 * already resolves a VAT to an official ΑΑΔΕ / VIES record, and VIES covers all 27 member states —
 * but discovery could never reach it, because a web search yields a NAME and VIES needs a VAT.
 * The company's own site is the link between the two halves, and it was being thrown away.
 *
 * The fixtures below are REAL text from real manufacturer pages, verified end to end on
 * 2026-08-20: the extracted VAT went to VIES and came back with the official legal name.
 * Casalgrande Padana publishes it prefixed; Iris Ceramica publishes it bare, and resolves to
 * GRANITIFIANDRE SPA — the legal entity behind the brand, which no amount of reading the page
 * would have told you.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractContactDetails } from '../../supabase/functions/_shared/contact-extract';

const ROOT = process.cwd();

describe('contact details are read off the page, not guessed', () => {
  it('takes phone numbers from the page\'s own tel: links', () => {
    const got = extractContactDetails('', ['tel:+30%20210%201234567', 'mailto:Info@Example.GR', '/about'], 'GR');
    expect(got.phones).toEqual(['+302101234567']);
    expect(got.emails).toEqual(['info@example.gr']);
    expect(got.found_in.links).toBe(2);
  });

  /**
   * The recall half is deliberately narrow. This platform scrapes tile and sanitaryware
   * manufacturers, whose pages are article codes, dimensions and price lists — a general
   * "run of 9ish digits" phone pattern matches those perfectly and would fill the CRM with
   * product SKUs formatted as phone numbers.
   */
  it('ignores digit runs that are not presented as phone numbers', () => {
    const noise = 'Format 60x60 cm. Art. 748291043. Ref 1234567890 EAN 8034125478963. Order 2026-08-20.';
    expect(extractContactDetails(noise, [], 'IT').phones).toEqual([]);
  });

  it('accepts a digit run only with an international prefix or an explicit label', () => {
    expect(extractContactDetails('Call +39 0522 9901 today', [], 'IT').phones).toEqual(['+3905229901']);
    expect(extractContactDetails('Τηλ: 2107485001', [], 'GR').phones).toEqual(['2107485001']);
    // `00` is the international trunk prefix and is dropped, not kept as digits.
    expect(extractContactDetails('Telefon 0049 6431 55 0', [], 'DE').phones).toEqual(['+496431550']);
  });

  describe('VAT numbers', () => {
    it('reads a prefixed VAT anywhere on the page', () => {
      const got = extractContactDetails('Casalgrande Padana S.p.A. - P.Iva IT01270230350 - Capitale sociale', [], 'IT');
      expect(got.vat_numbers[0]).toMatchObject({ country_code: 'IT', vat_number: '01270230350', source: 'prefixed' });
    });

    it('reads a bare VAT under a local label when the country is known', () => {
      const got = extractContactDetails('Iris Ceramica - P.IVA. 01411010356 - Via Radici Nord', [], 'IT');
      expect(got.vat_numbers[0]).toMatchObject({ country_code: 'IT', vat_number: '01411010356', source: 'labelled' });
    });

    /**
     * Without a country there is no telling a 9-digit Greek ΑΦΜ from a 9-digit German USt-IdNr.
     * Guessing produces a well-formed number belonging to a different company, which VIES will
     * happily resolve to the wrong legal name — a wrong answer that looks exactly like a right one.
     */
    it('refuses to guess the country for a bare number', () => {
      expect(extractContactDetails('ΑΦΜ: 094014201', [], undefined).vat_numbers).toEqual([]);
      expect(extractContactDetails('ΑΦΜ: 094014201', [], 'GR').vat_numbers[0]).toMatchObject({
        country_code: 'EL', vat_number: '094014201',
      });
    });

    /** Greece's VAT prefix is EL, not GR. VIES rejects GR outright, so this is the whole lookup. */
    it('maps Greece to the EL prefix VIES actually accepts', () => {
      expect(extractContactDetails('VAT EL094014201', [], 'GR').vat_numbers[0].country_code).toBe('EL');
    });

    /**
     * The candidate pattern tolerates one separator between characters so that a VAT printed as
     * `DE 143 454 214` is readable. That same tolerance lets a greedy match run on into the next
     * word when a single space follows the number — `P.Iva IT01270230350 Capitale sociale` produced
     * `01270230350CAPITALESOCIALE`, fitting no country format, so a VAT sitting in plain sight was
     * dropped. Both spellings have to work at once.
     */
    it('stops at the number even when the next word is one space away', () => {
      const got = extractContactDetails('P.Iva IT01270230350 Capitale sociale interamente versato', [], 'IT');
      expect(got.vat_numbers[0]).toMatchObject({ country_code: 'IT', vat_number: '01270230350' });
    });

    it('still reads a VAT printed with spaces between the groups', () => {
      const got = extractContactDetails('USt-IdNr.: DE 143 454 214', [], 'DE');
      expect(got.vat_numbers[0]).toMatchObject({ country_code: 'DE', vat_number: '143454214' });
    });

    it('rejects a number that does not fit the country format', () => {
      // Italy is exactly 11 digits; 9 is a Portuguese/Greek shape and must not pass as Italian.
      expect(extractContactDetails('P.IVA 014110103', [], 'IT').vat_numbers).toEqual([]);
    });
  });

  /**
   * The extractor is only reachable if the scrape actually asks for the material it reads. Both
   * halves of that were wrong together, and either one alone silently returns nothing.
   */
  it('the scrape requests the links and does not filter the footer away', () => {
    const src = readFileSync(join(ROOT, 'supabase/functions/_shared/tools/b2b-tools.ts'), 'utf8');
    const call = src.slice(src.indexOf('api.firecrawl.dev/v1/scrape'), src.indexOf('api.firecrawl.dev/v1/scrape') + 2200);
    expect(call, 'the scrape must request `links` — that is where tel:/mailto: come from')
      .toMatch(/formats:\s*\['markdown',\s*'links'\]/);
    expect(
      call,
      'onlyMainContent must stay false. It strips header, nav and FOOTER — and Firecrawl applies it '
      + 'to `links` too — so turning it back on silently empties every contact field again.',
    ).toMatch(/onlyMainContent:\s*false/);
    expect(src, 'the scrape must actually call the extractor').toMatch(/extractContactDetails\(markdown,/);
  });
});
