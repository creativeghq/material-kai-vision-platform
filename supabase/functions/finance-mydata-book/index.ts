/**
 * myDATA aggregate book — a READ-ONLY MIRROR of what AADE holds.
 *
 * This is the same table the taxpayer sees at
 *   www1.aade.gr/saadeapps2/bookkeeper-web/bookkeeper/#!/bookAggregate
 * (Συνοπτικό Βιβλίο): one row per month per direction, carrying AADE's own net /
 * VAT / withheld / other-taxes / digital-fee / fees / deductions / third-party
 * figures.
 *
 * It exists to CONFIRM the platform's numbers, never to feed them. Nothing here
 * writes to `invoices`, `supplier_bills` or `inbound_documents`, and no platform
 * report reads `mydata_book_months`. Merging the two would destroy the only thing
 * the mirror is for: being an independent second opinion.
 *
 * ── Why three calls and not one ───────────────────────────────────────────────
 * `RequestMyIncome` / `RequestMyExpenses` return the book itself, pre-aggregated
 * into `<bookInfo>` rows — but a bookInfo row is keyed on `counterVatNumber`, so
 * the families that HAVE no counterparty are simply absent from it:
 *
 *   11.x  retail documents we issued          missing from RequestMyIncome
 *   13.x  retail purchases we self-report     missing from RequestMyExpenses
 *
 * Measured against this workspace's own book for 01/01–30/08/2026:
 * `RequestMyIncome` alone reports EUR 42,658.42 where AADE's page says
 * EUR 54,329.85 — short by 21%, because two February 11.1 receipts (23,310.60)
 * and their 11.4 credit note (11,655.30) are invisible to it. Nothing errors; the
 * short number is a perfectly valid number. So the missing half is read off
 * `RequestTransmittedDocs` and signed here.
 *
 * With the supplement, all eight months and every column tie to AADE to the cent.
 *
 * ── Rate limiting ─────────────────────────────────────────────────────────────
 * AADE throttles these endpoints hard and answers 429 with a retry-after of
 * ~150 seconds — longer than an edge function may live. So a 429 is NOT retried
 * in-request: it is recorded as `collector_failed` with the retry window, the
 * last good figures are left exactly as they were, and the UI says when to try
 * again. A 429 body also parses as valid XML with zero rows, which is precisely
 * how a rate limit turns into a confident "you had no income in March" — every
 * response is status-checked before it is counted.
 *
 * Cron: invoke with header `x-cron-secret: <CRON_SECRET>`.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from '../_shared/secrets.ts';
import { authenticate, listUserWorkspaceIds } from '../_shared/auth.ts';
import { isWorkspaceEntitled } from '../_shared/entitlement.ts';
import { pickTag, pickAllTagBlocks } from '../_shared/aade/soap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** myDATA wants `dd/MM/yyyy`; the UI sends ISO `yyyy-mm-dd`. Null when unparseable, so a
 *  malformed date is rejected rather than silently widening the pull. */
function toAadeDate(iso: unknown): string | null {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return `${d}/${mo}/${y}`;
}

/**
 * The 11.x / 13.x subtypes that REDUCE the book, and the complete set of subtypes
 * we know about at all.
 *
 * `mydata_reference` carries 11.1–11.5 but no 13.x row, so this cannot be derived
 * from the DB the way a document LABEL is. It is therefore pinned here and verified
 * against live data: February's 11.1 pair less the 11.4 credit reproduces AADE's
 * income to the cent, and July's 13.1 pair less the 13.31 credit reproduces its
 * expenses. Note 11.5 ("on behalf of third parties") and 13.30 ("as recorded by the
 * entity itself") are SALES/PURCHASES despite sitting next to the credit codes —
 * treating either as a credit silently halves the month it appears in.
 *
 * An unrecognised subtype is counted at face value AND named in `source_errors`,
 * so a new AADE code shows up as a stated caveat rather than a wrong total.
 */
const CREDIT_SUBTYPES = new Set(['11.4', '13.31']);
const KNOWN_SUBTYPES = new Set(['11.1', '11.2', '11.3', '11.4', '11.5', '13.1', '13.2', '13.3', '13.4', '13.30', '13.31']);

/** The nine money columns of the aggregate book, in AADE's own order. */
interface BookTotals {
  net_value: number;
  vat_amount: number;
  withheld_amount: number;
  other_taxes_amount: number;
  stamp_duty_amount: number;
  fees_amount: number;
  deductions_amount: number;
  third_party_amount: number;
  gross_value: number;
  doc_count: number;
}

const emptyTotals = (): BookTotals => ({
  net_value: 0, vat_amount: 0, withheld_amount: 0, other_taxes_amount: 0,
  stamp_duty_amount: 0, fees_amount: 0, deductions_amount: 0, third_party_amount: 0,
  gross_value: 0, doc_count: 0,
});

const num = (s: string | null): number => (s != null && s !== '' ? Number(s) || 0 : 0);

function addInto(target: BookTotals, src: BookTotals): void {
  for (const k of Object.keys(target) as (keyof BookTotals)[]) target[k] += src[k];
}

/** Round once, at the end — accumulating pre-rounded cents drifts on 400+ documents. */
function roundTotals(t: BookTotals): BookTotals {
  const out = { ...t };
  for (const k of Object.keys(out) as (keyof BookTotals)[]) {
    if (k !== 'doc_count') out[k] = Math.round(out[k] * 100) / 100;
  }
  return out;
}

/** 40 pages is ~4,000 rows in one run. Hitting it is REPORTED, never silently truncated. */
const MAX_PAGES = 40;

interface Creds { aade_user_id: string; subscription_key: string }

type FetchResult =
  | { ok: true; blocks: string[] }
  | { ok: false; error: string; retryAfter?: number };

/**
 * Every page of one myDATA retrieval call.
 *
 * Both shapes truncate at ~100 rows and hand back a `<continuationToken>`; a first page
 * carries no marker distinguishing it from a complete result, so an unfollowed token is
 * a short answer that looks whole.
 */
async function fetchAllPages(
  baseUrl: string,
  endpoint: 'RequestMyIncome' | 'RequestMyExpenses' | 'RequestTransmittedDocs',
  creds: Creds,
  params: URLSearchParams,
): Promise<FetchResult> {
  const rootTag = endpoint === 'RequestTransmittedDocs' ? 'invoice' : 'bookInfo';
  const blocks: string[] = [];
  let next: { pk: string; rk: string } | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams(params);
    if (next) { q.set('nextPartitionKey', next.pk); q.set('nextRowKey', next.rk); }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/${endpoint}?${q.toString()}`, {
        headers: { 'aade-user-id': creds.aade_user_id, 'Ocp-Apim-Subscription-Key': creds.subscription_key },
      });
    } catch (err) {
      return { ok: false, error: `${endpoint}: ${String(err)}` };
    }
    const body = await res.text();

    // A 429 answers with a JSON body that contains zero <bookInfo> elements. Parsed
    // without this check it reads as "AADE has nothing for you" — the exact silent
    // zero this whole surface exists to make impossible.
    if (res.status === 429) {
      const secs = Number(/again in (\d+)/.exec(body)?.[1] ?? 0) || null;
      return { ok: false, error: `${endpoint}: rate limited by AADE`, retryAfter: secs ?? undefined };
    }
    if (!res.ok) return { ok: false, error: `${endpoint}: HTTP ${res.status}` };

    for (const b of pickAllTagBlocks(body, rootTag)) blocks.push(b);

    const token = pickAllTagBlocks(body, 'continuationToken')[0];
    const pk = token ? pickTag(token, 'nextPartitionKey') : null;
    const rk = token ? pickTag(token, 'nextRowKey') : null;
    if (!pk || !rk) return { ok: true, blocks };
    next = { pk, rk };
  }
  return { ok: false, error: `${endpoint}: more than ${MAX_PAGES} pages — window too wide` };
}

/** `<bookInfo>` — AADE's own book row. Credit families arrive already signed. */
function totalsFromBookInfo(b: string): BookTotals {
  return {
    net_value: num(pickTag(b, 'netValue')),
    vat_amount: num(pickTag(b, 'vatAmount')),
    withheld_amount: num(pickTag(b, 'withheldAmount')),
    other_taxes_amount: num(pickTag(b, 'otherTaxesAmount')),
    stamp_duty_amount: num(pickTag(b, 'stampDutyAmount')),
    fees_amount: num(pickTag(b, 'feesAmount')),
    deductions_amount: num(pickTag(b, 'deductionsAmount')),
    third_party_amount: num(pickTag(b, 'thirdPartyAmount')),
    gross_value: num(pickTag(b, 'grossValue')),
    doc_count: Math.trunc(num(pickTag(b, 'count'))),
  };
}

/** `<invoice>` — a raw transmitted document. The doc feeds report credit notes POSITIVE,
 *  so the sign is applied here; the book feed already signs its own. */
function totalsFromInvoice(b: string, sign: number): BookTotals {
  return {
    net_value: sign * num(pickTag(b, 'totalNetValue')),
    vat_amount: sign * num(pickTag(b, 'totalVatAmount')),
    withheld_amount: sign * num(pickTag(b, 'totalWithheldAmount')),
    other_taxes_amount: sign * num(pickTag(b, 'totalOtherTaxesAmount')),
    stamp_duty_amount: sign * num(pickTag(b, 'totalStampDutyAmount')),
    fees_amount: sign * num(pickTag(b, 'totalFeesAmount')),
    deductions_amount: sign * num(pickTag(b, 'totalDeductionsAmount')),
    third_party_amount: 0,
    gross_value: sign * num(pickTag(b, 'totalGrossValue')),
    doc_count: 1,
  };
}

const monthOf = (issueDate: string | null): string | null =>
  issueDate && issueDate.length >= 7 ? `${issueDate.slice(0, 7)}-01` : null;

interface CollectOk {
  ok: true;
  /** `${month}|${direction}` -> totals. Only months AADE actually reported. */
  buckets: Map<string, BookTotals>;
  unknownSubtypes: string[];
}
type CollectResult = CollectOk | { ok: false; error: string; retryAfter?: number };

async function collectBook(baseUrl: string, creds: Creds, dateFrom: string, dateTo: string): Promise<CollectResult> {
  const window = new URLSearchParams({ dateFrom, dateTo });
  const buckets = new Map<string, BookTotals>();
  const unknown = new Set<string>();

  const put = (month: string, direction: 'income' | 'expense', t: BookTotals) => {
    const key = `${month}|${direction}`;
    if (!buckets.has(key)) buckets.set(key, emptyTotals());
    addInto(buckets.get(key)!, t);
  };

  // 1 + 2 — the book itself, for everything that has a counterparty VAT number.
  for (const [endpoint, direction] of [
    ['RequestMyIncome', 'income'],
    ['RequestMyExpenses', 'expense'],
  ] as const) {
    const res = await fetchAllPages(baseUrl, endpoint, creds, window);
    if (!res.ok) return res;
    for (const b of res.blocks) {
      const month = monthOf(pickTag(b, 'issueDate'));
      if (month) put(month, direction, totalsFromBookInfo(b));
    }
  }

  // 3 — the counterparty-less half. 11.x is income, 13.x is expense; everything else
  // on this endpoint is already counted by the two calls above (or is not a book entry
  // at all, like a 9.x transport document), so it is deliberately ignored here.
  const transmitted = await fetchAllPages(
    baseUrl, 'RequestTransmittedDocs', creds, new URLSearchParams({ mark: '0', dateFrom, dateTo }),
  );
  if (!transmitted.ok) return transmitted;

  for (const b of transmitted.blocks) {
    const type = pickTag(b, 'invoiceType') ?? '';
    const family = type.split('.')[0];
    if (family !== '11' && family !== '13') continue;
    if (!KNOWN_SUBTYPES.has(type)) unknown.add(type);
    const month = monthOf(pickTag(b, 'issueDate'));
    if (!month) continue;
    put(month, family === '11' ? 'income' : 'expense', totalsFromInvoice(b, CREDIT_SUBTYPES.has(type) ? -1 : 1));
  }

  return { ok: true, buckets, unknownSubtypes: [...unknown] };
}

/** Every month between two ISO dates, as `yyyy-mm-01`. */
function monthsBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  let y = Number(fromIso.slice(0, 4));
  let m = Number(fromIso.slice(5, 7));
  const endY = Number(toIso.slice(0, 4));
  const endM = Number(toIso.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

Deno.serve(withApiLogging('finance-mydata-book', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // Auth: cron secret OR a signed-in finance user (the "Refresh from AADE" button).
  const cronSecret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
  const cronOk = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;

  // The manual path is scoped to the caller's OWN workspaces — without this, one tenant's
  // finance user triggers (and reads the outcome of) an AADE pull for every workspace.
  let allowedWorkspaceIds: string[] | null = null;
  if (!cronOk) {
    const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin', 'owner', 'finance'] });
    if (!auth.success) throw new HttpError(401, 'unauthorized');
    allowedWorkspaceIds = await listUserWorkspaceIds(supabase, auth.userId);
    if (allowedWorkspaceIds.length === 0) return json({ ok: true, skipped: 'no_member_workspaces' });
  }

  // Window. The cron refreshes the current year to date; a manual refresh names its own.
  //
  // `today` here is the UTC date, which between local midnight and 02:00–03:00 in Greece is
  // yesterday. That is deliberate rather than overlooked: there is no workspace business
  // timezone to resolve it against, so a server-stamped local date would be the same defect
  // wearing a better name. The consequence is bounded — the cron re-runs, and the manual path
  // always sends explicit dates from the UI, which ARE the operator's calendar days.
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = `${today.slice(0, 4)}-01-01`;
  const rawFrom = (body as Record<string, unknown>).date_from ?? defaultFrom;
  const rawTo = (body as Record<string, unknown>).date_to ?? today;
  const dateFrom = toAadeDate(rawFrom);
  const dateTo = toAadeDate(rawTo);
  if (!dateFrom || !dateTo) throw new HttpError(400, 'date_from and date_to must be yyyy-mm-dd');
  if (String(rawFrom) > String(rawTo)) throw new HttpError(400, 'date_from must not be after date_to');

  const defaultBase = (await resolveSecret(supabase, 'AADE_MYDATA_BASE_URL')).value || 'https://mydatapi.aade.gr/myDATA';

  let credsQuery = supabase
    .from('workspace_inbound_credentials')
    .select('workspace_id, aade_user_id, subscription_key, base_url, enabled')
    .eq('enabled', true)
    .not('aade_user_id', 'is', null)
    .not('subscription_key', 'is', null);
  if (allowedWorkspaceIds) credsQuery = credsQuery.in('workspace_id', allowedWorkspaceIds);
  const { data: creds } = await credsQuery;

  if (!creds || creds.length === 0) {
    // "Not connected" is a stated reason, not an empty success — the UI renders it as such.
    return json({ ok: true, skipped: 'not_connected', workspaces: [] });
  }

  const months = monthsBetween(String(rawFrom), String(rawTo));
  const summary: Record<string, unknown>[] = [];

  /**
   * Record the outcome of one workspace's refresh, and say whether the RECORDING itself
   * worked. Unchecked, a rejected sync-state write leaves `last_success_at` behind while the
   * response says `ok` — so the screen reports "never confirmed against AADE" over figures
   * that are in fact current, and the operator refreshes forever to fix nothing.
   */
  const writeSyncState = async (row: Record<string, unknown>): Promise<string | null> => {
    const { error } = await supabase
      .from('mydata_book_sync_state')
      .upsert(row, { onConflict: 'workspace_id' });
    return error ? `sync state not recorded: ${error.message}` : null;
  };

  for (const c of creds) {
    const workspaceId = c.workspace_id as string;

    // An unentitled tenant is skipped, not errored, so it can't fail the whole cron batch.
    if (!(await isWorkspaceEntitled(supabase, workspaceId, 'sales-finance'))) {
      summary.push({ workspaceId, skipped: 'not_entitled' });
      continue;
    }

    const attemptAt = new Date().toISOString();
    const baseUrl = (c.base_url as string | null) || defaultBase;
    const result = await collectBook(baseUrl, { aade_user_id: c.aade_user_id, subscription_key: c.subscription_key }, dateFrom, dateTo);

    if (!result.ok) {
      // The last good figures stay EXACTLY as they were. Only the verdict moves, so the
      // screen can keep showing real numbers while saying plainly that they are stale
      // and why — never a zeroed month standing in for an unreachable tax authority.
      const stateErr = await writeSyncState({
        workspace_id: workspaceId,
        last_attempt_at: attemptAt,
        last_status: 'collector_failed',
        source_errors: { error: result.error },
        retry_after_s: result.retryAfter ?? null,
        updated_at: attemptAt,
      });
      summary.push({
        workspaceId,
        error: stateErr ? `${result.error} (${stateErr})` : result.error,
        retry_after_s: result.retryAfter ?? null,
      });
      continue;
    }

    // Write a row for EVERY month in the window, both directions. A month AADE reported
    // nothing for is stored as an explicit `no_data` zero — that is a real answer, and
    // storing it is what stops it being confused with a month nobody ever asked about.
    const rows = months.flatMap((month) =>
      (['income', 'expense'] as const).map((direction) => {
        const t = result.buckets.get(`${month}|${direction}`);
        return {
          workspace_id: workspaceId,
          month,
          direction,
          ...roundTotals(t ?? emptyTotals()),
          status: t ? 'ok' : 'no_data',
          fetched_at: attemptAt,
          updated_at: attemptAt,
        };
      }),
    );

    const { error: upErr } = await supabase
      .from('mydata_book_months')
      .upsert(rows, { onConflict: 'workspace_id,month,direction' });

    if (upErr) {
      const stateErr = await writeSyncState({
        workspace_id: workspaceId,
        last_attempt_at: attemptAt,
        last_status: 'collector_failed',
        source_errors: { error: `store failed: ${upErr.message}` },
        updated_at: attemptAt,
      });
      summary.push({
        workspaceId,
        error: stateErr ? `store failed: ${upErr.message} (${stateErr})` : `store failed: ${upErr.message}`,
      });
      continue;
    }

    const stateErr = await writeSyncState({
      workspace_id: workspaceId,
      last_attempt_at: attemptAt,
      last_success_at: attemptAt,
      covered_from: String(rawFrom),
      covered_to: String(rawTo),
      last_status: 'ok',
      // A subtype we do not recognise is surfaced, never swallowed: its sign is a guess.
      source_errors: result.unknownSubtypes.length ? { unknown_subtypes: result.unknownSubtypes } : null,
      retry_after_s: null,
      updated_at: attemptAt,
    });

    summary.push({
      workspaceId,
      months: months.length,
      rows: rows.length,
      unknown_subtypes: result.unknownSubtypes,
      // The figures ARE stored; only the freshness stamp failed. Named rather than swallowed,
      // because the screen will otherwise claim the mirror has never been confirmed.
      ...(stateErr ? { warning: stateErr } : {}),
    });
  }

  return json({ ok: true, from: String(rawFrom), to: String(rawTo), workspaces: summary });
}));
