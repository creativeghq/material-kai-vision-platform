/** eea-facilities.ts — the EU Industrial Emissions Database, as a supplier-discovery source. */

const DISCODATA_URL = 'https://discodata.eea.europa.eu/sql';
const FACILITY_TABLE = '[IED].[latest].[ProductionFacility]';
const QUERY_TIMEOUT_MS = 20000;

/**
 * E-PRTR Annex I main-activity codes, grouped into the sectors a building-materials platform
 * actually sources from. Codes verified present in the live table — a sector that matches nothing
 * would be a picker option that always returns empty.
 *
 * The codes are matched as a PREFIX, because the register uses both `3(c)` and `3(c)(i)`.
 */
export const FACILITY_SECTORS = {
  ceramics: { codes: ['3(g)'], label: 'Ceramics fired in a kiln — tiles, sanitaryware, bricks, refractories' },
  glass: { codes: ['3(e)'], label: 'Glass, including glass fibre' },
  cement_lime: { codes: ['3(c)'], label: 'Cement clinker, lime, magnesium oxide' },
  stone_minerals: { codes: ['3(f)'], label: 'Mineral substances and mineral fibres' },
  quarrying: { codes: ['3(b)'], label: 'Quarries and open-cast mining' },
  steel: { codes: ['2(b)'], label: 'Pig iron and steel' },
  metal_processing: { codes: ['2(c)'], label: 'Ferrous metal processing — rolling, forging, coating' },
  foundry: { codes: ['2(d)'], label: 'Ferrous metal foundries' },
  non_ferrous: { codes: ['2(e)'], label: 'Non-ferrous metals — aluminium, copper, zinc' },
  metal_finishing: { codes: ['2(f)'], label: 'Surface treatment of metals and plastics' },
  wood_panels: { codes: ['6(c)'], label: 'Wood panels — chipboard, fibreboard, plywood' },
  paper: { codes: ['6(a)', '6(b)'], label: 'Pulp, paper and board' },
  chemicals: { codes: ['4('], label: 'Chemical installations — organic and inorganic' },
} as const;

export type FacilitySector = keyof typeof FACILITY_SECTORS;

/**
 * Escape a value for a SQL string literal, by doubling the quote.
 *
 * A DIFFERENT CONTRACT from `escapeHtml` and from a PostgREST filter escaper — invariant 11 exists
 * because two of those drifted into each other. Never swap one for another.
 */
export function sqlLiteral(value: string, maxLength = 80): string {
  return String(value ?? '')
    .slice(0, maxLength)
    // Letters (any script — Greek and Polish plant names are the norm here), digits, and the
    // punctuation that genuinely appears in company names. Everything else goes.
    .replace(/[^\p{L}\p{N}\s.,&'()\-/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/'/g, "''");
}

export interface FacilityMatch {
  facility_name: string | null;
  parent_company: string | null;
  country: string | null;
  city: string | null;
  street: string | null;
  sector_code: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface FacilityResult {
  status: 'hit' | 'miss' | 'unavailable';
  error?: string;
  facilities?: FacilityMatch[];
  query_describes?: string;
}

/** Build the WHERE clause from already-validated pieces. */
function buildWhere(opts: { sector?: FacilitySector; country?: string; companyName?: string; city?: string }): string {
  const clauses: string[] = [];

  if (opts.sector) {
    const codes = FACILITY_SECTORS[opts.sector].codes;
    clauses.push(`(${codes.map((c) => `EPRTRAnnexIMainActivity LIKE '${sqlLiteral(c)}%'`).join(' OR ')})`);
  }
  // Already validated to two letters by the caller; escaped again rather than trusted twice.
  if (opts.country) clauses.push(`countryCode = '${sqlLiteral(opts.country, 2)}'`);
  if (opts.companyName) {
    const n = sqlLiteral(opts.companyName);
    if (n) clauses.push(`(parentCompanyName LIKE '%${n}%' OR facilityName LIKE '%${n}%')`);
  }
  if (opts.city) {
    const c = sqlLiteral(opts.city);
    if (c) clauses.push(`city LIKE '%${c}%'`);
  }
  return clauses.length ? clauses.join(' AND ') : '1=1';
}

/**
 * Query the facility register.
 *
 * Never throws — an unreachable dataset is a reported state, not a crash, so a caller can tell
 * "no plant of this kind here" from "the register did not answer" (pipeline convention 1).
 */
export async function searchIndustrialFacilities(opts: {
  sector?: FacilitySector;
  country?: string;
  companyName?: string;
  city?: string;
  limit?: number;
}): Promise<FacilityResult> {
  const limit = Math.min(Math.max(opts.limit ?? 15, 1), 50);
  const sql = `SELECT TOP ${limit} facilityName, parentCompanyName, countryCode, city, streetName, `
    + `EPRTRAnnexIMainActivity, status, y_4326, x_4326 FROM ${FACILITY_TABLE} WHERE ${buildWhere(opts)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  try {
    const r = await fetch(
      `${DISCODATA_URL}?query=${encodeURIComponent(sql)}&p=1&nrOfHits=${limit}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    );
    if (!r.ok) return { status: 'unavailable', error: `Discodata HTTP ${r.status}` };
    const body = await r.json();
    // Discodata answers a rejected query with HTTP 200 and an `errors` array. Treating that as a
    // miss would report "no such factory" for what is actually a malformed query — the silent-zero
    // shape, and the reason every source here reports three states rather than two.
    if (body?.errors) {
      return { status: 'unavailable', error: `Discodata rejected the query: ${JSON.stringify(body.errors).slice(0, 160)}` };
    }
    const rows = Array.isArray(body?.results) ? body.results : [];
    if (!rows.length) return { status: 'miss' };
    // One installation appears once per reporting stream, so a plant with three permitted units
    // comes back three times. Romania's wood-panel query returned the same Schweighofer mill three
    // times over — a result that looks like three suppliers and is one. Dedupe on the identity the
    // operator actually reports: the plant, where it stands.
    const seen = new Set<string>();
    const unique = rows.filter((row: any) => {
      const key = [row.facilityName, row.city, row.streetName].map((v: unknown) => String(v ?? '').toLowerCase()).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      status: 'hit',
      facilities: unique.map((row: any) => ({
        facility_name: row.facilityName ?? null,
        parent_company: row.parentCompanyName ?? null,
        country: row.countryCode ?? null,
        city: row.city ?? null,
        // The register writes "0" where an operator filed no street.
        street: row.streetName && row.streetName !== '0' ? row.streetName : null,
        sector_code: row.EPRTRAnnexIMainActivity ?? null,
        status: row.status ?? null,
        latitude: typeof row.y_4326 === 'number' ? row.y_4326 : null,
        longitude: typeof row.x_4326 === 'number' ? row.x_4326 : null,
      })),
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { status: 'unavailable', error: aborted ? `timed out after ${QUERY_TIMEOUT_MS}ms` : (e instanceof Error ? e.message : 'query failed') };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How long has this domain existed?
 *
 * A cheap, free legitimacy signal that no register provides: a factory trading since 1998 has a
 * domain registered around then. RDAP is the authoritative answer and is fast; the Internet
 * Archive is the fallback for the many registries that redact creation dates under GDPR, and it
 * answers a slightly different question — first time anyone archived a page there — which for this
 * purpose is just as good and sometimes better.
 */
export async function lookupDomainAge(domain: string): Promise<{
  status: 'hit' | 'miss' | 'unavailable';
  registered_on?: string | null;
  first_archived?: string | null;
  age_years?: number | null;
  error?: string;
}> {
  const clean = String(domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)) return { status: 'miss', error: 'not a domain' };

  const withTimeout = async (url: string, ms: number) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try { return await fetch(url, { signal: c.signal, headers: { Accept: 'application/json' }, redirect: 'follow' }); }
    finally { clearTimeout(t); }
  };

  let registeredOn: string | null = null;
  try {
    const r = await withTimeout(`https://rdap.org/domain/${encodeURIComponent(clean)}`, 8000);
    if (r.ok) {
      const j = await r.json();
      const ev = Array.isArray(j?.events) ? j.events.find((e: any) => e?.eventAction === 'registration') : null;
      registeredOn = ev?.eventDate ? String(ev.eventDate).slice(0, 10) : null;
    }
  } catch { /* fall through to the archive */ }

  // The Internet Archive is the fallback for the registries that redact creation dates under GDPR
  // — `.it` among them, which matters here because Italy is a primary tile market.
  let firstArchived: string | null = null;
  let archiveTimedOut = false;
  if (!registeredOn) {
    try {
      const r = await withTimeout(
        `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(clean)}&output=json&limit=1&fl=timestamp`,
        10000,
      );
      if (r.ok) {
        const rows = await r.json();
        const ts = Array.isArray(rows) && rows[1] ? String(rows[1][0]) : '';
        if (/^\d{8}/.test(ts)) firstArchived = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
      }
    } catch (e) {
      archiveTimedOut = e instanceof Error && e.name === 'AbortError';
    }
  }

  const earliest = registeredOn || firstArchived;
  if (!earliest) {
    return archiveTimedOut
      ? {
        status: 'unavailable',
        error: 'This registry publishes no RDAP record and the Internet Archive did not answer in '
          + 'time, so the age of this domain is UNKNOWN. Do not read it as a new or suspicious domain.',
      }
      : { status: 'miss', error: 'neither RDAP nor the Internet Archive had a date for this domain' };
  }
  const years = Math.floor((Date.now() - new Date(earliest).getTime()) / (365.25 * 24 * 3600 * 1000));
  return {
    status: 'hit',
    registered_on: registeredOn,
    first_archived: firstArchived,
    age_years: Number.isFinite(years) ? years : null,
  };
}
