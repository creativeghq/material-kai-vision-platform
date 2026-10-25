import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIVITY_REGISTRIES, parseActivityCode } from '../../supabase/functions/_shared/registry-activity.ts';

const fixture = (n: string) => JSON.parse(readFileSync(join(process.cwd(), 'tests/unit/fixtures/registry-activity', `${n}.json`), 'utf8'));

describe('parseActivityCode', () => {
  it('derives each register form from a NACE class', () => {
    expect(parseActivityCode('27.40')).toEqual({ class4: '2740', national5: '27400', naf: '27.40Z' });
    expect(parseActivityCode('27400')?.national5).toBe('27400');
    expect(parseActivityCode('46.69a')?.naf).toBe('46.69A');
  });
  it('rejects codes without a four-digit class', () => {
    expect(parseActivityCode('27')).toBeNull();
    expect(parseActivityCode('lighting')).toBeNull();
    expect(parseActivityCode('1234567')).toBeNull();
  });
});

describe('request builders', () => {
  const code = parseActivityCode('27.40')!;
  it('builds the four documented queries', () => {
    expect(ACTIVITY_REGISTRIES.FR.request(code, 2, 25).url)
      .toBe('https://recherche-entreprises.api.gouv.fr/search?activite_principale=27.40Z&etat_administratif=A&per_page=25&page=2');
    const cz = ACTIVITY_REGISTRIES.CZ.request(code, 3, 25);
    expect(JSON.parse(String(cz.init?.body))).toEqual({ start: 50, pocet: 25, czNace: ['27400'] });
    expect(ACTIVITY_REGISTRIES.FI.request(code, 1, 25).url)
      .toBe('https://avoindata.prh.fi/opendata-ytj-api/v3/companies?mainBusinessLine=27400&page=1');
    expect(ACTIVITY_REGISTRIES.NO.request(code, 1, 25).url)
      .toBe('https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=27.40&size=25&page=0');
  });
});

describe('mappers', () => {
  it.each(['FR', 'CZ', 'FI', 'NO'])('%s rows are active leads with an id and a name', (cc) => {
    const page = ACTIVITY_REGISTRIES[cc].map(fixture(cc.toLowerCase()));
    expect(page.companies.length).toBeGreaterThan(0);
    expect(page.total).toBeGreaterThan(0);
    for (const c of page.companies) {
      expect(c.registration_id).toBeTruthy();
      expect(c.legal_name).toBeTruthy();
      expect(c.country).toBe(cc);
      expect(c.lead).toBe(true);
      expect(c.verified_as_manufacturer).toBe(false);
      expect(c.registration_status).toBe('ACTIVE');
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
  it('Finland drops companies whose current name has ended', () => {
    const body = fixture('fi');
    const page = ACTIVITY_REGISTRIES.FI.map(body);
    expect(page.dropped_inactive).toBeGreaterThan(0);
    expect(page.companies.length + page.dropped_inactive).toBe(body.companies.length);
  });
  it('Norway drops bankrupt and dissolved units and lists every NACE code', () => {
    const body = fixture('no');
    body._embedded.enheter.push({ organisasjonsnummer: '1', navn: 'GONE AS', konkurs: true });
    const page = ACTIVITY_REGISTRIES.NO.map(body);
    expect(page.dropped_inactive).toBe(1);
    expect(page.companies[0].activity_codes).toContain('27.400');
  });
  it('an error body or empty response maps to no companies', () => {
    for (const cc of Object.keys(ACTIVITY_REGISTRIES)) {
      expect(ACTIVITY_REGISTRIES[cc].map({ erreur: 'x' }).companies).toEqual([]);
      expect(ACTIVITY_REGISTRIES[cc].map(null).companies).toEqual([]);
    }
  });
});
