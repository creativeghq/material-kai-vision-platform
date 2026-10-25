/** Listing active companies by NACE activity code from the keyless national registers: request builders and response mappers, no I/O. */

// deno-lint-ignore-file no-explicit-any

export const MAX_ACTIVITY_PAGE_SIZE = 25;

export interface ActivityCompany {
  registration_id: string | null;
  legal_name: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string;
  registration_status: 'ACTIVE';
  activity_codes: string[];
  registry: string;
  /** A registry row proves a registration under a code, never what the business does. */
  lead: true;
  verified_as_manufacturer: false;
}

export interface ActivityPage {
  total: number | null;
  companies: ActivityCompany[];
  /** Rows the register returned that were not active and were dropped. */
  dropped_inactive: number;
}

export interface ActivityRegistry {
  register: string;
  request: (code: ParsedActivityCode, page: number, size: number) => { url: string; init?: RequestInit };
  map: (body: any) => ActivityPage;
}

export interface ParsedActivityCode {
  /** Four digits: the NACE class, e.g. "2740". */
  class4: string;
  /** Five digits with a trailing zero when only the class was given, e.g. "27400". */
  national5: string;
  /** French NAF with its letter, e.g. "27.40Z". */
  naf: string;
}

/** "27.40", "2740", "27400" or "27.40Z" → the forms each register wants; null when there is no four-digit class. */
export function parseActivityCode(raw: unknown): ParsedActivityCode | null {
  const s = String(raw ?? '').trim().toUpperCase();
  const digits = s.replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 5) return null;
  const letter = s.match(/[A-Z]$/)?.[0] ?? 'Z';
  const class4 = digits.slice(0, 4);
  return {
    class4,
    national5: digits.length === 5 ? digits : `${class4}0`,
    naf: `${class4.slice(0, 2)}.${class4.slice(2)}${letter}`,
  };
}

/** The open (not ended) entry of a register's versioned list, else the latest. */
export function currentVersion<T extends Record<string, any>>(arr: unknown, from: string, to: string): T | null {
  if (!Array.isArray(arr) || !arr.length) return null;
  const open = arr.filter((x) => x && !x[to]);
  const pool = open.length ? open : arr;
  return pool.reduce((best, x) => (String(x?.[from] ?? '') > String(best?.[from] ?? '') ? x : best), pool[0]) as T;
}

const joinParts = (...p: unknown[]) => p.filter((x) => x != null && x !== '').join(' ') || null;

function mapFr(body: any): ActivityPage {
  const rows: any[] = Array.isArray(body?.results) ? body.results : [];
  const active = rows.filter((r) => r?.etat_administratif === 'A');
  return {
    total: typeof body?.total_results === 'number' ? body.total_results : null,
    dropped_inactive: rows.length - active.length,
    companies: active.map((r) => ({
      registration_id: r.siren ?? null,
      legal_name: r.nom_raison_sociale || r.nom_complet || null,
      address: r.siege?.adresse ?? null,
      city: r.siege?.libelle_commune ?? null,
      postal_code: r.siege?.code_postal ?? null,
      country: 'FR',
      registration_status: 'ACTIVE' as const,
      activity_codes: [r.siege?.activite_principale ?? r.activite_principale].filter(Boolean),
      registry: 'recherche-entreprises.api.gouv.fr',
      lead: true as const,
      verified_as_manufacturer: false as const,
    })),
  };
}

function mapCz(body: any): ActivityPage {
  const rows: any[] = Array.isArray(body?.ekonomickeSubjekty) ? body.ekonomickeSubjekty : [];
  const active = rows.filter((r) => r?.seznamRegistraci?.stavZdrojeRos === 'AKTIVNI');
  return {
    total: typeof body?.pocetCelkem === 'number' ? body.pocetCelkem : null,
    dropped_inactive: rows.length - active.length,
    companies: active.map((r) => ({
      registration_id: r.ico ?? null,
      legal_name: r.obchodniJmeno ?? null,
      address: r.sidlo?.textovaAdresa ?? null,
      city: r.sidlo?.nazevObce ?? null,
      postal_code: r.sidlo?.psc != null ? String(r.sidlo.psc) : null,
      country: 'CZ',
      registration_status: 'ACTIVE' as const,
      activity_codes: Array.isArray(r.czNace2008) ? r.czNace2008.map(String) : [],
      registry: 'ares.gov.cz',
      lead: true as const,
      verified_as_manufacturer: false as const,
    })),
  };
}

function mapFi(body: any): ActivityPage {
  const rows: any[] = Array.isArray(body?.companies) ? body.companies : [];
  const live = rows.map((r) => ({ r, name: currentVersion<any>(r.names, 'registrationDate', 'endDate') }))
    .filter(({ name }) => name && !name.endDate);
  return {
    total: typeof body?.totalResults === 'number' ? body.totalResults : null,
    dropped_inactive: rows.length - live.length,
    companies: live.map(({ r, name }) => {
      const addr = currentVersion<any>(r.addresses, 'registrationDate', 'endDate');
      return {
        registration_id: r.businessId?.value ?? null,
        legal_name: name.name ?? null,
        address: addr ? joinParts(addr.street, addr.buildingNumber, addr.postCode, addr.postOffices?.[0]?.city) : null,
        city: addr?.postOffices?.[0]?.city ?? null,
        postal_code: addr?.postCode ?? null,
        country: 'FI',
        registration_status: 'ACTIVE' as const,
        activity_codes: [r.mainBusinessLine?.type].filter(Boolean),
        registry: 'avoindata.prh.fi',
        lead: true as const,
        verified_as_manufacturer: false as const,
      };
    }),
  };
}

export function mapNo(body: any): ActivityPage {
  const rows: any[] = Array.isArray(body?._embedded?.enheter) ? body._embedded.enheter : [];
  const active = rows.filter((r) => !r?.konkurs && !r?.underAvvikling && !r?.underTvangsavviklingEllerTvangsopplosning && !r?.slettedato);
  return {
    total: typeof body?.page?.totalElements === 'number' ? body.page.totalElements : null,
    dropped_inactive: rows.length - active.length,
    companies: active.map((r) => {
      const a = r.forretningsadresse ?? r.postadresse ?? null;
      return {
        registration_id: r.organisasjonsnummer ?? null,
        legal_name: r.navn ?? null,
        address: a ? joinParts(...(Array.isArray(a.adresse) ? a.adresse : []), a.postnummer, a.poststed) : null,
        city: a?.poststed ?? null,
        postal_code: a?.postnummer ?? null,
        country: 'NO',
        registration_status: 'ACTIVE' as const,
        activity_codes: [r.naeringskode1?.kode, r.naeringskode2?.kode, r.naeringskode3?.kode].filter(Boolean),
        registry: 'data.brreg.no',
        lead: true as const,
        verified_as_manufacturer: false as const,
      };
    }),
  };
}

export const ACTIVITY_REGISTRIES: Record<string, ActivityRegistry> = {
  FR: {
    register: 'Recherche Entreprises (INSEE / INPI)',
    request: (c, page, size) => ({
      url: `https://recherche-entreprises.api.gouv.fr/search?activite_principale=${encodeURIComponent(c.naf)}&etat_administratif=A&per_page=${size}&page=${page}`,
    }),
    map: mapFr,
  },
  CZ: {
    register: 'ARES (Czech business register)',
    request: (c, page, size) => ({
      url: 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ start: (page - 1) * size, pocet: size, czNace: [c.national5] }),
      },
    }),
    map: mapCz,
  },
  FI: {
    register: 'PRH / YTJ (Finnish Patent and Registration Office)',
    request: (c, page) => ({
      url: `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?mainBusinessLine=${c.national5}&page=${page}`,
    }),
    map: mapFi,
  },
  NO: {
    register: 'Brønnøysund Register Centre (Enhetsregisteret)',
    request: (c, page, size) => ({
      url: `https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=${c.class4.slice(0, 2)}.${c.class4.slice(2)}&size=${size}&page=${page - 1}`,
    }),
    map: mapNo,
  },
};
