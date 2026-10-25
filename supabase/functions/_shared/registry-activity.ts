/** National-register response mapping (name lookup and NACE listing share it) plus the activity-code request builders. No I/O. */

// deno-lint-ignore-file no-explicit-any

export const MAX_ACTIVITY_PAGE_SIZE = 25;

export interface RegistryRow {
  registration_id: string | null;
  legal_name: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string;
  /** "ACTIVE", "DISSOLVED (<date or reason>)" or "INACTIVE (...)": never ACTIVE by default. */
  registration_status: string;
  activity_codes: string[];
  [extra: string]: unknown;
}

export type ActivityCompany = RegistryRow & {
  registry: string;
  /** A registry row proves a registration under a code, never what the business does. */
  lead: true;
  verified_as_manufacturer: false;
};

export interface ActivityPage {
  total: number | null;
  /** Rows the register returned on this page, before dropping inactive ones. */
  returned: number;
  companies: ActivityCompany[];
  dropped_inactive: number;
}

export interface ParsedActivityCode {
  digits: string;
  letter: string | null;
}

/** "27.40", "27400" or "27.40Z" → digits and optional trailing letter; null without a four- or five-digit code. */
export function parseActivityCode(raw: unknown): ParsedActivityCode | null {
  const s = String(raw ?? '').trim().toUpperCase();
  const digits = s.replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 5) return null;
  return { digits, letter: s.match(/[A-Z]$/)?.[0] ?? null };
}

/** The open (not ended) entry of a register's versioned list, else the latest. */
export function currentVersion<T extends Record<string, any>>(arr: unknown, from: string, to: string): T | null {
  if (!Array.isArray(arr) || !arr.length) return null;
  const open = arr.filter((x) => x && !x[to]);
  const pool = open.length ? open : arr;
  return pool.reduce((best, x) => (String(x?.[from] ?? '') > String(best?.[from] ?? '') ? x : best), pool[0]) as T;
}

const joinParts = (...p: unknown[]) => p.filter((x) => x != null && x !== '').join(' ') || null;

interface RegisterShape {
  rows: (body: any) => any[];
  total: (body: any) => number | null;
  row: (raw: any) => RegistryRow;
}

const num = (v: unknown) => (typeof v === 'number' ? v : null);

const REGISTER_SHAPES: Record<string, RegisterShape> = {
  FR: {
    rows: (b) => (Array.isArray(b?.results) ? b.results : []),
    total: (b) => num(b?.total_results),
    row: (r) => ({
      registration_id: r.siren ?? null,
      legal_name: r.nom_raison_sociale || r.nom_complet || null,
      address: r.siege?.adresse ?? null,
      city: r.siege?.libelle_commune ?? null,
      postal_code: r.siege?.code_postal ?? null,
      country: 'FR',
      registration_status: r.etat_administratif === 'A' ? 'ACTIVE' : `DISSOLVED (${r.date_fermeture ?? r.etat_administratif ?? 'closed'})`,
      activity_codes: [r.siege?.activite_principale ?? r.activite_principale].filter(Boolean),
      employee_range: r.tranche_effectif_salarie ?? null,
      establishments: r.nombre_etablissements_ouverts ?? null,
    }),
  },
  CZ: {
    rows: (b) => (Array.isArray(b?.ekonomickeSubjekty) ? b.ekonomickeSubjekty : []),
    total: (b) => num(b?.pocetCelkem),
    row: (r) => {
      const stav = r?.seznamRegistraci?.stavZdrojeRos;
      return {
        registration_id: r.ico ?? null,
        legal_name: r.obchodniJmeno ?? null,
        address: r.sidlo?.textovaAdresa ?? null,
        city: r.sidlo?.nazevObce ?? null,
        postal_code: r.sidlo?.psc != null ? String(r.sidlo.psc) : null,
        country: 'CZ',
        registration_status: stav === 'AKTIVNI' ? 'ACTIVE' : `INACTIVE (${stav ?? 'unknown'})`,
        activity_codes: Array.isArray(r.czNace2008) ? r.czNace2008.map(String) : [],
      };
    },
  },
  FI: {
    rows: (b) => (Array.isArray(b?.companies) ? b.companies : []),
    total: (b) => num(b?.totalResults),
    row: (r) => {
      const name = currentVersion<any>(r.names, 'registrationDate', 'endDate');
      const addr = currentVersion<any>(r.addresses, 'registrationDate', 'endDate');
      const ceased = r.endDate || r.tradeRegisterStatus === '4';
      return {
        registration_id: r.businessId?.value ?? null,
        legal_name: name?.name ?? null,
        address: addr ? joinParts(addr.street, addr.buildingNumber, addr.postCode, addr.postOffices?.[0]?.city) : null,
        city: addr?.postOffices?.[0]?.city ?? null,
        postal_code: addr?.postCode ?? null,
        country: 'FI',
        registration_status: ceased ? `DISSOLVED (${r.endDate ?? 'ceased'})` : 'ACTIVE',
        activity_codes: [r.mainBusinessLine?.type].filter(Boolean),
      };
    },
  },
  NO: {
    rows: (b) => (Array.isArray(b?._embedded?.enheter) ? b._embedded.enheter : []),
    total: (b) => num(b?.page?.totalElements),
    row: (r) => {
      const a = r.forretningsadresse ?? r.postadresse ?? null;
      const status = r.slettedato ? `DISSOLVED (${r.slettedato})`
        : r.konkurs ? 'DISSOLVED (bankrupt)'
        : r.underTvangsavviklingEllerTvangsopplosning ? 'DISSOLVED (forced dissolution)'
        : r.underAvvikling ? 'DISSOLVED (winding up)'
        : 'ACTIVE';
      return {
        registration_id: r.organisasjonsnummer ?? null,
        legal_name: r.navn ?? null,
        address: a ? joinParts(...(Array.isArray(a.adresse) ? a.adresse : []), a.postnummer, a.poststed) : null,
        city: a?.poststed ?? null,
        postal_code: a?.postnummer ?? null,
        country: 'NO',
        registration_status: status,
        activity_codes: [r.naeringskode1?.kode, r.naeringskode2?.kode, r.naeringskode3?.kode].filter(Boolean),
      };
    },
  },
};

/** Every row of a register response, inactive ones included and labelled, for the by-name lookup. */
export function mapRegisterRows(cc: string, body: any): { total: number | null; rows: RegistryRow[] } {
  const shape = REGISTER_SHAPES[cc];
  return { total: shape.total(body), rows: shape.rows(body).map(shape.row) };
}

export interface ActivityRegistry {
  register: string;
  host: string;
  /** Rows the register returns per page when asked for `size`. */
  rowsPerPage: (size: number) => number;
  /** The code in the form this register takes, or an error naming the form it needs. */
  resolveCode: (c: ParsedActivityCode) => { code: string } | { error: string };
  request: (code: string, page: number, size: number) => { url: string; init?: RequestInit };
  map: (body: any) => ActivityPage;
}

function activityPage(cc: string, host: string, body: any): ActivityPage {
  const { total, rows } = mapRegisterRows(cc, body);
  const active = rows.filter((r) => r.registration_status === 'ACTIVE');
  return {
    total,
    returned: rows.length,
    dropped_inactive: rows.length - active.length,
    companies: active.map((r) => ({ ...r, registry: host, lead: true as const, verified_as_manufacturer: false as const })),
  };
}

export const ACTIVITY_REGISTRIES: Record<string, ActivityRegistry> = {
  FR: {
    register: 'Recherche Entreprises (INSEE / INPI)',
    host: 'recherche-entreprises.api.gouv.fr',
    rowsPerPage: (size) => size,
    resolveCode: (c) => c.letter && c.digits.length === 4
      ? { code: `${c.digits.slice(0, 2)}.${c.digits.slice(2)}${c.letter}` }
      : { error: 'France needs a NAF code with its letter, e.g. "27.40Z".' },
    request: (code, page, size) => ({
      url: `https://recherche-entreprises.api.gouv.fr/search?activite_principale=${encodeURIComponent(code)}&etat_administratif=A&per_page=${size}&page=${page}`,
    }),
    map: (b) => activityPage('FR', 'recherche-entreprises.api.gouv.fr', b),
  },
  CZ: {
    register: 'ARES (Czech business register)',
    host: 'ares.gov.cz',
    rowsPerPage: (size) => size,
    resolveCode: (c) => c.digits.length === 5
      ? { code: c.digits }
      : { error: 'ARES needs the 5-digit CZ-NACE code, e.g. "27400"; a 4-digit class matches nothing there.' },
    request: (code, page, size) => ({
      url: 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ start: (page - 1) * size, pocet: size, czNace: [code] }),
      },
    }),
    map: (b) => activityPage('CZ', 'ares.gov.cz', b),
  },
  FI: {
    register: 'PRH / YTJ (Finnish Patent and Registration Office)',
    host: 'avoindata.prh.fi',
    // The v3 API fixes the page at 100 rows and ignores maxResults (checked 2026-10-25).
    rowsPerPage: () => 100,
    resolveCode: (c) => ({ code: c.digits }),
    request: (code, page) => ({
      url: `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?mainBusinessLine=${code}&page=${page}`,
    }),
    map: (b) => activityPage('FI', 'avoindata.prh.fi', b),
  },
  NO: {
    register: 'Brønnøysund Register Centre (Enhetsregisteret)',
    host: 'data.brreg.no',
    rowsPerPage: (size) => size,
    resolveCode: (c) => ({ code: `${c.digits.slice(0, 2)}.${c.digits.slice(2)}` }),
    request: (code, page, size) => ({
      url: `https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=${code}&size=${size}&page=${page - 1}`,
    }),
    map: (b) => activityPage('NO', 'data.brreg.no', b),
  },
};
