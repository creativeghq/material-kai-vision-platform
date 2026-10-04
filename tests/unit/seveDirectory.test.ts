import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';
import { foldCompanyName, parseMemberPage, parseSitemap } from '../../supabase/functions/_shared/crm/seveDirectory';

const src = (p: string) => blankComments(readFileSync(join(process.cwd(), p), 'utf8'));

const row = (cls: string, label: string, value: string) =>
  `<div class="${cls}"> <div class="clearfix"> <div class="col-xs-6"><span></span>${label}</div> <div class="col-xs-6">${value}</div> </div> </div>`;

const PAGE = `<h2 class="title"> ΚΛΙΜΑΤΕΧΝΙΚΗ Α.Ε. </h2>
<div class="company-branches"><span>The company is part of the following industries: </span><a href="x">ΜΗΧΑΝΗΜΑΤΑ</a>, <a href="y">ΗΛΕΚΤΡΙΚΑ</a> </div>
<div class="the-metas">
${row('address', 'Address', ' ΜΑΡΙΝΟΥ ΑΝΤΥΠΑ 35 , 55134 , ΘΕΣΣΑΛΟΝΙΚΗ ')}
${row('phone', 'Phone', '+30-2310-477000, 551012')}
${row('fax', 'Fax', '+30-2310-473367')}
${row('person', 'Contact Person', 'ΜΑΡΙΔΗΣ ΣΤΕΦΑΝΟΣ')}
${row('institution', 'Institution Year', '1961')}
${row('website', 'Website', ' <p><a href="http://www.davoline.gr" target="_blank">www.davoline.gr</a> ')}
${row('email', 'Email', ' <p><a href="mailto:SMaridis@davoline.gr">x</a> ')}
</div>
<div class="company-info"> <h3>The company</h3> <p>Απορροφητήρες &#8211; συσκευές</p> </div>
<div class="intrastat"> <h3>Categories and Codes Intrastat</h3>
<div class="branches"> <h4><a href="z">ΜΗΧΑΝΗΜΑΤΑ</a></h4><div class="clearfix"><p class="pro_code">84146000</p><p class="descr">Απορροφητήρες</p></div></div>
</div>`;

describe('ΣΕΒΕ member page', () => {
  const m = parseMemberPage(PAGE)!;

  it('reads the identity fields a CRM match needs', () => {
    expect(m.name).toBe('ΚΛΙΜΑΤΕΧΝΙΚΗ Α.Ε.');
    expect(m.postal_code).toBe('55134');
    expect(m.city).toBe('ΘΕΣΣΑΛΟΝΙΚΗ');
    expect(m.website_domain).toBe('davoline.gr');
    expect(m.emails).toEqual(['smaridis@davoline.gr']);
  });

  it('keeps only whole Greek numbers — "551012" after a comma is a fragment, not a phone', () => {
    expect(m.phones).toEqual(['2310477000', '2310473367']);
  });

  it('reads industries, Intrastat codes, founding year and the description', () => {
    expect(m.industries).toEqual(['ΜΗΧΑΝΗΜΑΤΑ', 'ΗΛΕΚΤΡΙΚΑ']);
    expect(m.intrastat).toEqual([{ code: '84146000', description: 'Απορροφητήρες', industry: 'ΜΗΧΑΝΗΜΑΤΑ' }]);
    expect(m.founded_year).toBe(1961);
    expect(m.description).toBe('Απορροφητήρες – συσκευές');
  });

  it('a page with no title is not a member', () => {
    expect(parseMemberPage('<html></html>')).toBeNull();
  });
});

describe('ΣΕΒΕ sitemap', () => {
  it('keeps the Greek company pages and drops the English copies', () => {
    const xml = `<url><loc>https://www.seve.gr/company/%ce%b1-%ce%b5/</loc><lastmod>2024-01-02T00:00:00+00:00</lastmod></url>
      <url><loc>https://www.seve.gr/en/company/glass-studio-s-a/</loc></url>`;
    expect(parseSitemap(xml)).toEqual([{ url: 'https://www.seve.gr/company/%ce%b1-%ce%b5/', slug: 'α-ε', lastmod: '2024-01-02T00:00:00+00:00' }]);
  });

  it('folds a name to the words a CRM name is compared on', () => {
    expect(foldCompanyName('Κλιματεχνική Α.Ε.')).toBe('ΚΛΙΜΑΤΕΧΝΙΚΗ');
  });
});

describe('ΣΕΒΕ wiring', () => {
  it('the sync refuses a request without the cron secret before doing any work', () => {
    const s = src('supabase/functions/seve-directory-sync/index.ts');
    expect(s.indexOf('if (!isCronAuthorized(req))')).toBeGreaterThan(-1);
    expect(s.indexOf('if (!isCronAuthorized(req))')).toBeLessThan(s.indexOf('createClient('));
  });

  it('the sync only ever fetches seve.gr', () => {
    expect(src('supabase/functions/seve-directory-sync/index.ts')).toContain('if (!url.startsWith(SEVE_ORIGIN)) return null;');
  });

  it('a name-and-postcode ΣΕΒΕ match lends candidates but never verifies a website on its own', () => {
    expect(src('supabase/functions/company-enrich/index.ts')).toContain("seve.matched_by !== 'postcode_name'");
  });
});
