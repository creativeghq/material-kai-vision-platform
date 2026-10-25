import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIVITY_REGISTRIES, mapRegisterRows, parseActivityCode } from '../../supabase/functions/_shared/registry-activity.ts';

const fixture = (n: string) => JSON.parse(readFileSync(join(process.cwd(), 'tests/unit/fixtures/registry-activity', `${n}.json`), 'utf8'));

describe('parseActivityCode and resolveCode', () => {
  it('keeps what the caller gave and never invents a digit', () => {
    expect(parseActivityCode('27.40')).toEqual({ digits: '2740', letter: null });
    expect(parseActivityCode('27.40z')).toEqual({ digits: '2740', letter: 'Z' });
    expect(parseActivityCode('27')).toBeNull();
    expect(parseActivityCode('lighting')).toBeNull();
  });
  it('resolves each register form or says which form it needs', () => {
    const c4 = parseActivityCode('27.40')!;
    expect(ACTIVITY_REGISTRIES.FR.resolveCode(c4)).toMatchObject({ error: expect.stringContaining('27.40Z') });
    expect(ACTIVITY_REGISTRIES.FR.resolveCode(parseActivityCode('27.40Z')!)).toEqual({ code: '27.40Z' });
    expect(ACTIVITY_REGISTRIES.CZ.resolveCode(c4)).toMatchObject({ error: expect.stringContaining('27400') });
    expect(ACTIVITY_REGISTRIES.CZ.resolveCode(parseActivityCode('27400')!)).toEqual({ code: '27400' });
    expect(ACTIVITY_REGISTRIES.FI.resolveCode(c4)).toEqual({ code: '2740' });
    expect(ACTIVITY_REGISTRIES.NO.resolveCode(c4)).toEqual({ code: '27.40' });
    expect(ACTIVITY_REGISTRIES.NO.resolveCode(parseActivityCode('27400')!)).toEqual({ code: '27.400' });
  });
});

describe('request builders', () => {
  it('builds the documented queries from the resolved code', () => {
    expect(ACTIVITY_REGISTRIES.FR.request('27.40Z', 2, 25).url)
      .toBe('https://recherche-entreprises.api.gouv.fr/search?activite_principale=27.40Z&etat_administratif=A&per_page=25&page=2');
    expect(JSON.parse(String(ACTIVITY_REGISTRIES.CZ.request('27400', 3, 25).init?.body))).toEqual({ start: 50, pocet: 25, czNace: ['27400'] });
    expect(ACTIVITY_REGISTRIES.FI.request('27400', 1, 25).url).toBe('https://avoindata.prh.fi/opendata-ytj-api/v3/companies?mainBusinessLine=27400&page=1');
    expect(ACTIVITY_REGISTRIES.NO.request('27.40', 1, 25).url).toBe('https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=27.40&size=25&page=0');
  });
  it('Finland pages by 100 whatever size is asked', () => {
    expect(ACTIVITY_REGISTRIES.FI.rowsPerPage(25)).toBe(100);
    expect(ACTIVITY_REGISTRIES.NO.rowsPerPage(25)).toBe(25);
  });
});

describe('activity mappers', () => {
  it.each(['FR', 'CZ', 'FI', 'NO'])('%s rows are active leads with an id and a name', (cc) => {
    const page = ACTIVITY_REGISTRIES[cc].map(fixture(cc.toLowerCase()));
    expect(page.companies.length).toBeGreaterThan(0);
    expect(page.total).toBeGreaterThan(0);
    for (const c of page.companies) {
      expect(c).toMatchObject({ country: cc, lead: true, verified_as_manufacturer: false, registration_status: 'ACTIVE' });
      expect(c.registration_id).toBeTruthy();
      expect(c.legal_name).toBeTruthy();
    }
  });
  it('France maps siren, name and NAF', () => {
    const [first] = ACTIVITY_REGISTRIES.FR.map(fixture('fr')).companies;
    expect(first).toMatchObject({ registration_id: '334438827', legal_name: 'COOPER SECURITE SAS', city: 'RIOM', activity_codes: ['27.40Z'] });
  });
  it('Czechia carries the NACE list and the postal code', () => {
    const [first] = ACTIVITY_REGISTRIES.CZ.map(fixture('cz')).companies;
    expect(first).toMatchObject({ registration_id: '00009784', city: 'Praha', postal_code: '17000' });
    expect(first.activity_codes).toContain('27400');
  });
  it('Finland reads the company-level end date and reports rows returned', () => {
    const body = fixture('fi');
    const page = ACTIVITY_REGISTRIES.FI.map(body);
    expect(page.returned).toBe(body.companies.length);
    expect(page.dropped_inactive).toBe(body.companies.filter((c: { endDate?: string }) => c.endDate).length);
    expect(page.companies.length + page.dropped_inactive).toBe(body.companies.length);
  });
  it('an error body or empty response maps to no companies', () => {
    for (const cc of Object.keys(ACTIVITY_REGISTRIES)) {
      expect(ACTIVITY_REGISTRIES[cc].map({ erreur: 'x' }).companies).toEqual([]);
      expect(ACTIVITY_REGISTRIES[cc].map(null).returned).toBe(0);
    }
  });
});

describe('by-name mapping keeps dissolved companies, labelled', () => {
  it('Norway labels bankrupt, winding-up and deleted units instead of dropping them', () => {
    const body = fixture('no');
    body._embedded.enheter.push(
      { organisasjonsnummer: '1', navn: 'BANKRUPT AS', konkurs: true },
      { organisasjonsnummer: '2', navn: 'WINDING AS', underAvvikling: true },
      { organisasjonsnummer: '3', navn: 'DELETED AS', slettedato: '2020-05-01' },
    );
    const { rows } = mapRegisterRows('NO', body);
    expect(rows.map((r) => r.registration_status)).toEqual([
      'ACTIVE', 'ACTIVE', 'DISSOLVED (bankrupt)', 'DISSOLVED (winding up)', 'DISSOLVED (2020-05-01)',
    ]);
    const page = ACTIVITY_REGISTRIES.NO.map(body);
    expect(page.dropped_inactive).toBe(3);
    expect(page.companies).toHaveLength(2);
  });
  it('Finland marks a ceased company DISSOLVED with its end date', () => {
    const { rows } = mapRegisterRows('FI', fixture('fi'));
    expect(rows[0].registration_status).toBe('DISSOLVED (2024-09-19)');
    expect(rows[1].registration_status).toBe('ACTIVE');
  });
  it('France and Czechia label inactive units', () => {
    const fr = fixture('fr');
    fr.results[0].etat_administratif = 'C';
    expect(mapRegisterRows('FR', fr).rows[0].registration_status).toMatch(/^DISSOLVED/);
    const cz = fixture('cz');
    cz.ekonomickeSubjekty[0].seznamRegistraci.stavZdrojeRos = 'ZANIKLY';
    expect(mapRegisterRows('CZ', cz).rows[0].registration_status).toMatch(/^INACTIVE/);
  });
});
