/**
 * One shared "research this party" routine for the whole CRM.
 *
 * Chain (each step best-effort, a failure never blocks the next):
 *   1. ΑΑΔΕ RgWsPublic2  — official name, structured address, ΔΟΥ, legal form, ΚΑΔ  (Greek ΑΦΜ only)
 *   2. ΓΕΜΗ OpenData     — Γ.Ε.ΜΗ. number (ΑΑΔΕ never returns it), legal form, status, extra ΚΑΔ
 *   3. company-enrich    — the soft identity no registry carries: website, socials, phone,
 *                          email, description, industry, headcount (web search + Apollo)
 *
 * Precedence: registry fields (1+2) are authoritative and overwrite; enrichment (3) only fills
 * slots that are still blank after the registry pass, so it can never clobber official data.
 *
 * Callers: AddCompanyModal (create), CompanyDetailPage (refresh), ContactDetailPage (refresh),
 * InboundDocActionsMenu (Expenses inbox → add issuer to CRM). Previously each of these carried
 * its own partial copy of the chain, which is why the inbox path ran ΑΑΔΕ only.
 */
import { aadeService, type AadeLookupResult } from '@/modules/myaade';
import { gemiService, type GemiLookupResult } from '@/services/gemiService';
import { enrichCompany, type CompanyEnrichFields } from '@/services/companyEnrichService';

export type ResearchStepName = 'aade' | 'gemi' | 'enrich';
export type ResearchStepStatus = 'ok' | 'skipped' | 'failed';

export interface ResearchStep {
  step: ResearchStepName;
  status: ResearchStepStatus;
  /** Human-readable reason — surfaced in the toast when a step is skipped or fails. */
  detail?: string;
}

export interface CompanyResearchOptions {
  /** VAT / ΑΦΜ as typed. Non-digits are stripped before the registry calls. */
  vatNumber?: string | null;
  /** ISO country code of the VAT number. Blank is treated as Greek when the ΑΦΜ is 9 digits. */
  countryCode?: string | null;
  /** Fallback name for the enrichment pass when no registry name comes back. */
  name?: string | null;
  /** Country display name for the enrichment pass (e.g. "Greece"). */
  countryName?: string | null;
  /**
   * `crm_companies.id` — lets the edge functions cache their raw payloads server-side.
   * NEVER pass a `crm_contacts.id` here; the registry functions write to `crm_companies`.
   */
  companyId?: string;
  workspaceId?: string;
  reason?: 'own_business' | 'crm_enrichment' | 'invoice_counterparty';
  /** Current row. Enrichment only fills fields that are blank here (after the registry pass). */
  existing?: Record<string, unknown> | null;
  /** `contact` narrows the patch to columns that exist on `crm_contacts`. */
  target?: 'company' | 'contact';
  /** Set false to skip the (paid) web/Apollo pass and do registry lookups only. */
  includeEnrich?: boolean;
  /** Progress label for a busy button ("Checking ΓΕΜΗ registry…"). */
  onProgress?: (label: string | null) => void;
}

export interface CompanyResearchResult {
  /** Column patch to apply to the row (already narrowed to the target table). */
  fields: Record<string, unknown>;
  steps: ResearchStep[];
  /** True when at least one step returned data. */
  ok: boolean;
  /** Official name resolved from the registry, if any. */
  resolvedName: string | null;
  aade?: AadeLookupResult;
  gemi?: GemiLookupResult;
  enrich?: CompanyEnrichFields | null;
}

/** Normalized ΚΑΔ entry stored in `crm_companies.kad_all`. Canonical shape — re-exported by
 *  [[CompanyRegistryDetails]], which renders it. */
export interface KadEntry {
  code: string;
  description?: string | null;
  source?: 'aade' | 'gemi';
  primary?: boolean;
  /** The other registry that also lists this code, when both do. */
  also_in?: 'aade' | 'gemi';
}

/** Columns that only exist on `crm_companies` — stripped when the target is a contact. */
const COMPANY_ONLY_FIELDS = new Set([
  'commercial_title', 'legal_status', 'kad_primary', 'kad_primary_description', 'kad_secondary',
  'business_start_date', 'aade_data', 'aade_data_at',
  'gemi_number', 'gemi_legal_form', 'gemi_status', 'gemi_data', 'gemi_data_at',
  'kad_all', 'kad_codes', 'description',
  'vat_validated', 'vat_validated_at', 'vat_validated_name', 'vat_validated_address', 'vat_validation_source',
  // A person's display name is theirs — never overwritten by a registry business name.
  'name',
]);

const KAD_SOURCE_RANK: Record<'aade' | 'gemi', number> = { aade: 0, gemi: 1 };

/**
 * Merge one source's ΚΑΔ into an existing kad_all, preserving the other source's entries, then
 * dedupe the union by code. Mirrors `supabase/functions/_shared/kad.ts` (same contract, other
 * runtime) — change both together.
 *
 * ΑΑΔΕ and ΓΕΜΗ publish heavily overlapping activity codes. Concatenating them without a
 * dedupe on `kad_all` is what produced a live row with 57 entries for 35 distinct codes and
 * three rows flagged `primary` — a company has exactly one primary activity.
 */
export function mergeKad(
  existing: unknown,
  source: 'aade' | 'gemi',
  items: Array<{ code: string | null; description: string | null; primary: boolean }>,
): { kad_all: KadEntry[]; kad_codes: string[] } {
  const kept: KadEntry[] = Array.isArray(existing)
    ? (existing as KadEntry[]).filter((x) => x && x.code && x.source && x.source !== source)
    : [];
  const fresh: KadEntry[] = items
    .filter((a) => a.code && String(a.code).trim())
    .map((a) => ({ code: String(a.code).trim(), description: a.description ?? null, source, primary: !!a.primary }));

  return dedupeKad([...kept, ...fresh]);
}

/** Collapse a concatenated ΚΑΔ list to one entry per code and one primary overall. */
export function dedupeKad(all: KadEntry[]): { kad_all: KadEntry[]; kad_codes: string[] } {
  const byCode = new Map<string, KadEntry>();

  for (const e of all) {
    if (!e || !e.code) continue;
    const key = String(e.code).trim().toLowerCase();
    if (!key) continue;
    const existing = byCode.get(key);
    if (!existing) {
      byCode.set(key, { ...e, code: String(e.code).trim() });
      continue;
    }
    // Same code from both registries: ΑΑΔΕ (the tax registry of record) wins, but keep the
    // other's description / primary claim and record that it listed the code too.
    const winner = KAD_SOURCE_RANK[e.source ?? 'gemi'] < KAD_SOURCE_RANK[existing.source ?? 'gemi'] ? e : existing;
    const loser = winner === existing ? e : existing;
    byCode.set(key, {
      ...winner,
      code: String(winner.code).trim(),
      description: winner.description ?? loser.description ?? null,
      primary: !!winner.primary || !!loser.primary,
      ...(winner.source !== loser.source && loser.source ? { also_in: loser.source } : {}),
    });
  }

  const kad_all = [...byCode.values()];

  const primaryIdx = kad_all.findIndex((e) => e.primary && e.source === 'aade');
  const keepIdx = primaryIdx >= 0 ? primaryIdx : kad_all.findIndex((e) => e.primary);
  for (let i = 0; i < kad_all.length; i++) kad_all[i].primary = i === keepIdx;

  kad_all.sort((a, b) => (Number(b.primary) - Number(a.primary)) || a.code.localeCompare(b.code));

  return { kad_all, kad_codes: kad_all.map((e) => e.code) };
}

/** A bare 9-digit number is a Greek ΑΦΜ — the only shape ΑΑΔΕ / ΓΕΜΗ can resolve. */
export const greekAfm = (vat: string | null | undefined, countryCode?: string | null): string | null => {
  const digits = (vat ?? '').replace(/[^0-9]/g, '');
  if (digits.length !== 9) return null;
  const cc = (countryCode ?? '').trim().toUpperCase();
  if (cc && cc !== 'EL' && cc !== 'GR') return null;
  return digits;
};

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Map an ΑΑΔΕ lookup onto crm_companies columns. */
function aadeFields(res: AadeLookupResult, existing: Record<string, unknown>): Record<string, unknown> {
  const r = res.basic_rec;
  const primary = res.activities.find((a) => a.kind === 1) ?? res.activities[0] ?? null;
  const secondary = res.activities.filter((a) => a.kind !== 1);
  const combinedAddress = r.postal_address
    ? `${r.postal_address} ${r.postal_address_no ?? ''}`.replace(/\s+/g, ' ').trim()
    : null;
  const { kad_all, kad_codes } = mergeKad(
    existing.kad_all,
    'aade',
    res.activities.map((a) => ({ code: a.code, description: a.description, primary: a.kind === 1 })),
  );
  const out: Record<string, unknown> = {
    kad_all,
    kad_codes,
    name: r.onomasia ?? undefined,
    street: r.postal_address ?? undefined,
    street_number: r.postal_address_no ?? undefined,
    address: combinedAddress ?? undefined,
    postal_code: r.postal_zip_code ?? undefined,
    city: r.postal_area_description ?? undefined,
    country: r.postal_area_description ? ((existing.country as string) || 'Greece') : undefined,
    country_code: (existing.country_code as string) || 'EL',
    tax_office: r.doy_descr ?? undefined,
    profession: primary?.description ?? undefined,
    commercial_title: r.commer_title ?? undefined,
    legal_status: r.legal_status_descr ?? undefined,
    kad_primary: primary?.code ?? undefined,
    kad_primary_description: primary?.description ?? undefined,
    kad_secondary: secondary.length > 0 ? secondary : undefined,
    business_start_date: r.regist_date ? (r.regist_date.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? undefined) : undefined,
    aade_data: { basic_rec: r, activities: res.activities },
    aade_data_at: res.checked_at,
    // '1' = active, '2' = deactivated; anything else is unknown, so leave the flag alone.
    vat_validated: r.deactivation_flag === '1' ? true : (r.deactivation_flag === '2' ? false : undefined),
    vat_validated_at: res.checked_at,
    vat_validated_name: r.onomasia ?? undefined,
    vat_validated_address: combinedAddress
      ? `${combinedAddress} ${r.postal_zip_code ?? ''} ${r.postal_area_description ?? ''}`.replace(/\s+/g, ' ').trim()
      : undefined,
    vat_validation_source: 'aade',
  };
  // Drop undefined so a blank registry field never wipes a typed value.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

/** Map a ΓΕΜΗ lookup onto crm_companies columns (merging its ΚΑΔ with whatever ΑΑΔΕ gave us). */
function gemiFields(g: GemiLookupResult, soFar: Record<string, unknown>): Record<string, unknown> {
  const { kad_all, kad_codes } = mergeKad(
    soFar.kad_all,
    'gemi',
    (g.gemi.activities || []).map((a) => ({
      code: a.code, description: a.description, primary: /κ[υύ]ρι/i.test(a.type ?? ''),
    })),
  );
  const out: Record<string, unknown> = {
    kad_all,
    kad_codes,
    gemi_number: g.gemi.ar_gemi ?? undefined,
    gemi_legal_form: g.gemi.legal_form ?? undefined,
    gemi_status: g.gemi.status ?? undefined,
    gemi_data: g.raw ?? null,
    gemi_data_at: g.checked_at,
    // ΓΕΜΗ carries the address too — useful when the party never had one (ΑΑΔΕ miss).
    street: isBlank(soFar.street) ? (g.gemi.street ?? undefined) : undefined,
    street_number: isBlank(soFar.street_number) ? (g.gemi.street_number ?? undefined) : undefined,
    postal_code: isBlank(soFar.postal_code) ? (g.gemi.zip ?? undefined) : undefined,
    city: isBlank(soFar.city) ? (g.gemi.city ?? undefined) : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

/**
 * Run the full ΑΑΔΕ → ΓΕΜΗ → web-enrichment chain for one party and return the column patch.
 * Never throws: every step is wrapped, and the outcome of each is reported in `steps`.
 */
export async function researchCompany(opts: CompanyResearchOptions): Promise<CompanyResearchResult> {
  const {
    vatNumber, countryCode, name, countryName, companyId, workspaceId,
    reason = 'crm_enrichment', existing = {}, target = 'company',
    includeEnrich = true, onProgress,
  } = opts;

  const base: Record<string, unknown> = existing ?? {};
  const steps: ResearchStep[] = [];
  let fields: Record<string, unknown> = {};
  let resolvedName: string | null = null;
  let aade: AadeLookupResult | undefined;
  let gemi: GemiLookupResult | undefined;
  let enrich: CompanyEnrichFields | null = null;

  const afm = greekAfm(vatNumber, countryCode);

  // ── 1. ΑΑΔΕ ─────────────────────────────────────────────────────────────────────────────
  if (!afm) {
    steps.push({ step: 'aade', status: 'skipped', detail: 'Needs a 9-digit Greek ΑΦΜ' });
    steps.push({ step: 'gemi', status: 'skipped', detail: 'Needs a 9-digit Greek ΑΦΜ' });
  } else {
    onProgress?.('Checking ΑΑΔΕ registry…');
    try {
      const res = await aadeService.lookup({ afm, companyId, reason, workspaceId });
      if ('ok' in res && res.ok) {
        aade = res;
        resolvedName = res.basic_rec.onomasia ?? null;
        fields = { ...fields, ...aadeFields(res, { ...base, ...fields }) };
        steps.push({ step: 'aade', status: 'ok' });
      } else {
        steps.push({ step: 'aade', status: 'failed', detail: (res as { message?: string; error?: string }).message ?? (res as { error?: string }).error });
      }
    } catch (e) {
      steps.push({ step: 'aade', status: 'failed', detail: e instanceof Error ? e.message : 'ΑΑΔΕ lookup failed' });
    }

    // ── 2. ΓΕΜΗ ───────────────────────────────────────────────────────────────────────────
    onProgress?.('Checking ΓΕΜΗ registry…');
    try {
      const g = await gemiService.lookup({ afm, companyId, reason, workspaceId });
      if ('ok' in g && g.ok && g.gemi.ar_gemi) {
        gemi = g;
        resolvedName = resolvedName ?? g.gemi.name_el ?? g.gemi.name_en ?? null;
        fields = { ...fields, ...gemiFields(g, { ...base, ...fields }) };
        steps.push({ step: 'gemi', status: 'ok' });
      } else {
        steps.push({
          step: 'gemi',
          status: 'ok' in g && g.ok ? 'skipped' : 'failed',
          detail: 'ok' in g && g.ok ? 'Not found in ΓΕΜΗ' : ((g as { message?: string; error?: string }).message ?? (g as { error?: string }).error),
        });
      }
    } catch (e) {
      steps.push({ step: 'gemi', status: 'failed', detail: e instanceof Error ? e.message : 'ΓΕΜΗ lookup failed' });
    }
  }

  // ── 3. Web / Apollo enrichment ──────────────────────────────────────────────────────────
  const enrichName = (resolvedName || name || (base.name as string) || '').trim();
  if (!includeEnrich) {
    steps.push({ step: 'enrich', status: 'skipped', detail: 'Not requested' });
  } else if (!enrichName) {
    steps.push({ step: 'enrich', status: 'skipped', detail: 'No business name to research' });
  } else {
    onProgress?.('Finding business info…');
    const merged = { ...base, ...fields };
    const res = await enrichCompany({
      name: enrichName,
      countryName: countryName ?? (merged.country as string) ?? (afm ? 'Greece' : undefined),
      vatNumber: vatNumber ?? undefined,
      workspaceId,
      companyId,
    });
    if (res.ok && res.fields) {
      enrich = res.fields;
      const soft: Record<string, unknown> = {};
      // Soft identity only fills what is still blank — registry data always wins.
      for (const key of ['website', 'email', 'phone', 'linkedin', 'facebook', 'twitter',
        'description', 'industry', 'employee_count', 'city', 'state', 'country'] as const) {
        const v = res.fields[key];
        if (!isBlank(v) && isBlank(merged[key])) soft[key] = v;
      }
      fields = { ...fields, ...soft };
      steps.push({
        step: 'enrich',
        status: Object.keys(soft).length > 0 ? 'ok' : 'skipped',
        detail: Object.keys(soft).length > 0 ? Object.keys(soft).join(', ') : 'Nothing new found',
      });
    } else {
      steps.push({ step: 'enrich', status: 'failed', detail: res.message ?? res.error });
    }
  }

  onProgress?.(null);

  if (target === 'contact') {
    fields = Object.fromEntries(Object.entries(fields).filter(([k]) => !COMPANY_ONLY_FIELDS.has(k)));
  }

  return {
    fields,
    steps,
    ok: steps.some((s) => s.status === 'ok'),
    resolvedName,
    aade,
    gemi,
    enrich,
  };
}

/** One-line "what happened" summary for a toast. */
export function summarizeResearch(steps: ResearchStep[]): string {
  const label: Record<ResearchStepName, string> = { aade: 'ΑΑΔΕ', gemi: 'ΓΕΜΗ', enrich: 'Business info' };
  const ok = steps.filter((s) => s.status === 'ok').map((s) => label[s.step]);
  const bad = steps.filter((s) => s.status === 'failed').map((s) => label[s.step]);
  const parts: string[] = [];
  if (ok.length) parts.push(`Updated from ${ok.join(' + ')}.`);
  if (bad.length) parts.push(`No data from ${bad.join(', ')}.`);
  return parts.join(' ') || 'Nothing new found.';
}
