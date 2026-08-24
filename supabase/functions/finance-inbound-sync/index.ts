/**
 * Inbound myDATA poller. Reads BOTH of myDATA's retrieval endpoints (per-tenant AADE creds:
 * aade-user-id + Ocp-Apim-Subscription-Key), upserts what they return into `inbound_documents`,
 * and advances a separate per-workspace MARK watermark for each. No-ops cleanly when creds
 * aren't configured yet, so it can be scheduled now and "switches on" the moment the operator
 * pastes credentials.
 *
 *   RequestDocs             documents OTHER businesses issued to us      source='mydata'
 *   RequestTransmittedDocs  documents WE transmitted                     source='mydata_self'
 *
 * The second one is issue #377. Foreign supplier invoices are not filed against us by anybody —
 * a Bulgarian supplier is not a myDATA obligor — so the finance team types them into myAADE as
 * `14.x`, which makes US the transmitter. They therefore land on RequestTransmittedDocs and are
 * permanently invisible to RequestDocs. This platform polled only RequestDocs for two years:
 * EUR 45,413.93 of foreign purchases across 12 suppliers, plus EUR 104,750.07 of self-reported
 * rent and payroll, were sitting one endpoint away the whole time. Nothing had failed — the
 * question was wrong, and "0 foreign invoices" read as a fact about the business.
 *
 * Cron: invoke with header `x-cron-secret: <CRON_SECRET>`.
 *
 * Manual ("Sync from myDATA") calls may bound the pull to an explicit issue-date window via
 * `{ date_from, date_to }` (ISO `yyyy-mm-dd`) so the operator isn't dragged back through
 * years of history. A dated pull ignores the MARK watermark on the REQUEST (`mark=0`) —
 * otherwise an already-advanced watermark would silently empty an older window — but the
 * stored watermark still only ever moves forward.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from '../_shared/secrets.ts';
import { authenticate, listUserWorkspaceIds } from '../_shared/auth.ts';
import { isWorkspaceEntitled } from '../_shared/entitlement.ts';
import { pickTag, pickAllTagBlocks } from '../_shared/aade/soap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { extractProductsFromLines } from '../_shared/finance/extract-products.ts';
import { resolveInboundIssuerNames } from '../_shared/finance/resolve-issuer-names.ts';
import { unitFromMydataCode } from '../_shared/fiscal/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const num = (s: string | null) => (s != null && s !== '' ? Number(s) : null);

/** myDATA wants `dd/MM/yyyy`; the UI sends ISO `yyyy-mm-dd`. Returns null when unparseable
 *  so a malformed date is rejected rather than silently widening the pull. */
function toAadeDate(iso: unknown): string | null {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return `${d}/${mo}/${y}`;
}

/** myDATA `invoiceType` family, i.e. the part before the dot. `'14.1'` -> `'14'`. */
const family = (docType: string | null) => String(docType ?? '').split('.')[0];

/**
 * The families on RequestTransmittedDocs that are EXPENSES we self-reported.
 *
 *   13.x  foreign services / expenses           reverse charge
 *   14.x  foreign purchases                     reverse charge
 *   16.1  rent                                  a real payable, to a landlord
 *   17.x  payroll and accounting adjustments    HR's, never a supplier bill
 *
 * Everything else that endpoint returns is a SALE we issued, which already lives in `invoices` —
 * ingesting one would invent a supplier bill for our own revenue. The filter is applied HERE
 * rather than as an `invType` query param because the param takes a single value per call, and
 * asking eight times per workspace per night to avoid parsing a few hundred KB is the wrong
 * trade. Skipped documents are counted and reported, never silently dropped.
 */
const SELF_TRANSMITTED_EXPENSE_FAMILIES = new Set(['13', '14', '16', '17']);

/** Hard stop on the continuation loop: 40 pages is ~4,000 documents in one run, far past any real
 *  window. Hitting it is REPORTED, never silent — a partial list is indistinguishable from a
 *  complete one, which is the whole bug this loop exists to fix. */
const MAX_PAGES = 40;

interface DocFetch {
  ok: boolean;
  status: number;
  /** Every `<invoice>` block across every page. */
  blocks: string[];
  pages: number;
  /** True when MAX_PAGES stopped us with a continuation token still outstanding. */
  capped: boolean;
  error?: string;
}

/**
 * Fetch EVERY page of a myDATA retrieval call.
 *
 * Both endpoints truncate at roughly 100 documents and hand back a `<continuationToken>` holding
 * the partition/row key to resume from. Nothing in this platform ever read it. The cron survived
 * by accident — its watermark advanced to page one's last MARK, so it caught up one page per
 * night — but the manual dated pull asks from `mark=0` bounded by dates and deliberately ignores
 * the watermark, so it returned page one and called it the year. Measured live: the 2025 window
 * returns 103 documents and a token, and page two holds 50 more. Page one carries no marker
 * distinguishing it from a complete result.
 */
async function fetchAllDocPages(
  baseUrl: string,
  endpoint: 'RequestDocs' | 'RequestTransmittedDocs',
  creds: { aade_user_id: string; subscription_key: string },
  params: URLSearchParams,
): Promise<DocFetch> {
  const blocks: string[] = [];
  let next: { pk: string; rk: string } | null = null;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const q = new URLSearchParams(params);
    if (next) { q.set('nextPartitionKey', next.pk); q.set('nextRowKey', next.rk); }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/${endpoint}?${q.toString()}`, {
        headers: { 'aade-user-id': creds.aade_user_id, 'Ocp-Apim-Subscription-Key': creds.subscription_key },
      });
    } catch (err) {
      return { ok: false, status: 0, blocks, pages, capped: false, error: String(err) };
    }
    const xml = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, blocks, pages, capped: false, error: `${endpoint} ${res.status}` };
    }
    pages++;
    for (const b of pickAllTagBlocks(xml, 'invoice')) blocks.push(b);

    // `pickAllTagBlocks` and not `pickTag`: the token holds child elements, and pickTag decodes
    // entities across the whole inner block, which would corrupt nested XML.
    const token = pickAllTagBlocks(xml, 'continuationToken')[0];
    const pk = token ? pickTag(token, 'nextPartitionKey') : null;
    const rk = token ? pickTag(token, 'nextRowKey') : null;
    if (!pk || !rk) return { ok: true, status: res.status, blocks, pages, capped: false };
    next = { pk, rk };
  }
  return { ok: true, status: 200, blocks, pages, capped: true };
}

Deno.serve(withApiLogging('finance-inbound-sync', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const body = await req.json().catch(() => ({}));

  // Auth: cron secret OR a signed-in finance manager (the "Sync now" button).
  const cronSecret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
  const cronOk = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
  // On the manual ("Sync now") path, restrict the all-workspace fan-out below to the
  // caller's own workspaces — without this, one tenant's finance user triggers (and reads
  // the results of) an inbound myDATA pull for EVERY workspace on the platform.
  let allowedWorkspaceIds: string[] | null = null;
  if (!cronOk) {
    const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin', 'owner', 'finance'] });
    if (!auth.success) return json({ error: 'unauthorized' }, 401);
    allowedWorkspaceIds = await listUserWorkspaceIds(supabase, auth.userId);
    if (allowedWorkspaceIds.length === 0) return json({ ok: true, skipped: 'no_member_workspaces' });
  }

  // Optional issue-date window (manual path only — the cron stays watermark-driven).
  const dateFrom = cronOk ? null : toAadeDate((body as any)?.date_from);
  const dateTo = cronOk ? null : toAadeDate((body as any)?.date_to);
  if (!cronOk) {
    // Reject a half-specified or malformed window instead of quietly pulling everything.
    const gaveFrom = (body as any)?.date_from != null && (body as any)?.date_from !== '';
    const gaveTo = (body as any)?.date_to != null && (body as any)?.date_to !== '';
    if ((gaveFrom && !dateFrom) || (gaveTo && !dateTo) || (gaveFrom !== gaveTo)) {
      return json({ error: 'date_from and date_to must both be supplied as yyyy-mm-dd' }, 400);
    }
    if (dateFrom && dateTo && String((body as any).date_from) > String((body as any).date_to)) {
      return json({ error: 'date_from must not be after date_to' }, 400);
    }
  }
  const dated = !!(dateFrom && dateTo);

  const defaultBase = (await resolveSecret(supabase, 'AADE_MYDATA_BASE_URL')).value || 'https://mydatapi.aade.gr/myDATA';
  // Platform-wide ΓΕΜΗ key — public open data, so one key serves every tenant (unlike the
  // per-workspace ΑΑΔΕ codes). Absent key just means names stay unresolved.
  const gemiApiKey = (await resolveSecret(supabase, 'GEMI_API_KEY')).value || null;

  // Every workspace that configured its own myDATA received-docs credentials.
  let credsQuery = supabase
    .from('workspace_inbound_credentials')
    .select('workspace_id, aade_user_id, subscription_key, base_url, enabled')
    .eq('enabled', true)
    .not('aade_user_id', 'is', null)
    .not('subscription_key', 'is', null);
  // Manual path: only the caller's own workspaces. Cron path: all of them.
  if (allowedWorkspaceIds) credsQuery = credsQuery.in('workspace_id', allowedWorkspaceIds);
  const { data: creds } = await credsQuery;

  if (!creds || creds.length === 0) {
    return json({ ok: true, skipped: 'no_configured_workspaces' });
  }

  // Automated (cron) pulls are credit-metered per workspace; the manual "Sync now"
  // button (finance-manager JWT) is free. Root workspace is never billed.
  const INBOUND_SYNC_CREDIT_COST = 2;
  const wsIds = creds.map((c) => c.workspace_id);
  const { data: wsMeta } = await supabase.from('workspaces').select('id, created_by, is_root').in('id', wsIds);
  const metaById = new Map((wsMeta ?? []).map((w: any) => [w.id, w]));

  const summary: any[] = [];
  for (const c of creds) {
    const workspaceId = c.workspace_id as string;
    const baseUrl = c.base_url || defaultBase;

    // myDATA inbound is a Finance-module feature; skip workspaces that don't own it.
    // (Root passes via is_workspace_entitled; the configured-but-unentitled case is skipped,
    //  not errored, so one unentitled tenant can't fail the whole cron batch.)
    if (!(await isWorkspaceEntitled(supabase, workspaceId, 'sales-finance'))) {
      summary.push({ workspaceId, skipped: 'not_entitled' });
      continue;
    }

    // Pre-check credit balance on the automated path WITHOUT debiting yet — we only charge
    // for a sync that actually reached AADE, so a failed pull never burns the tenant's credits.
    const meta = metaById.get(workspaceId);
    const mustBill = cronOk && meta && !meta.is_root && !!meta.created_by;
    if (mustBill) {
      const { data: cr } = await supabase.from('user_credits').select('balance').eq('user_id', meta.created_by).maybeSingle();
      if ((cr?.balance ?? 0) < INBOUND_SYNC_CREDIT_COST) {
        summary.push({ workspaceId, skipped: 'insufficient_credits' });
        continue;
      }
    }

    const { data: fs } = await supabase.from('finance_settings')
      .select('inbound_last_mark, inbound_last_transmitted_mark, resolve_issuer_names_via_aade')
      .eq('workspace_id', workspaceId).maybeSingle();
    const watermark = fs?.inbound_last_mark || '0';
    // Its own watermark, deliberately. MARKs come from one global AADE sequence, so sharing the
    // received-docs watermark would let whichever branch ran first drag the other past documents
    // it had never seen — and a watermark that is too high just returns fewer rows.
    const transmittedWatermark = (fs as any)?.inbound_last_transmitted_mark || '0';

    // Default landing category for synced expenses: the workspace's locked "myAADE" system
    // category (auto-seeded into every workspace). New docs are stamped with it so they
    // arrive classified instead of uncategorized; the operator can still recategorize.
    const { data: myaadeCat } = await supabase
      .from('finance_categories')
      .select('id').eq('workspace_id', workspaceId).eq('system_key', 'myaade').maybeSingle();
    const myaadeCategoryId: string | null = myaadeCat?.id ?? null;

    // Learned per-issuer defaults: when the operator has previously classified a supplier's
    // docs into a real category, a new doc from that same ΑΦΜ defaults to it instead of the
    // generic myAADE bucket. Maintained by the remember_inbound_issuer_category trigger.
    const { data: issuerDefaults } = await supabase
      .from('inbound_issuer_category_defaults')
      .select('issuer_vat, category_id').eq('workspace_id', workspaceId);
    const issuerCatMap = new Map<string, string>(
      (issuerDefaults ?? []).map((r: any) => [r.issuer_vat, r.category_id]),
    );

    // A dated pull asks from mark 0 and lets the date window do the bounding — the stored
    // watermark may already be past the requested window's start, which would return nothing.
    const windowed = (mark: string) => {
      const params = new URLSearchParams({ mark: dated ? '0' : mark });
      if (dated) { params.set('dateFrom', dateFrom!); params.set('dateTo', dateTo!); }
      return params;
    };

    const received = await fetchAllDocPages(baseUrl, 'RequestDocs', c, windowed(watermark));
    if (!received.ok) { summary.push({ workspaceId, error: received.error ?? 'RequestDocs failed' }); continue; }

    // The documents WE transmitted. A failure here must not lose the received-docs pull that has
    // already succeeded, so it is reported and the run carries on with what it has.
    const transmitted = await fetchAllDocPages(baseUrl, 'RequestTransmittedDocs', c, windowed(transmittedWatermark));
    if (!transmitted.ok) {
      console.error('[inbound-sync] RequestTransmittedDocs failed', workspaceId, transmitted.error);
    }

    // The pull succeeded — now charge (automated path only).
    if (mustBill) {
      const { data: debit, error: debitErr } = await supabase.rpc('debit_credits', {
        p_user_id: meta.created_by, p_amount: INBOUND_SYNC_CREDIT_COST,
        p_operation_type: 'mydata_inbound_sync',
        p_description: `Daily myDATA inbound pull (workspace ${workspaceId})`,
        p_workspace_id: workspaceId ?? null,
      });
      const row = Array.isArray(debit) ? debit[0] : debit;
      if (debitErr || (row && !row.success)) {
        summary.push({ workspaceId, skipped: 'insufficient_credits' });
        continue;
      }
    }

    /** Documents INSERTED by this run — the only ones auto-convert is allowed to touch. */
    const freshDocIds: string[] = [];

    /**
     * Parse and upsert one endpoint's documents.
     *
     * Both endpoints return the identical `RequestedDoc` -> `invoicesDoc` -> `invoice[]` shape, and
     * on a `14.x` the `<issuer>` block is the FOREIGN SUPPLIER (verified across all 32 of them:
     * name and full address present, which is better than a Greek document, where only the ΑΦΜ
     * arrives and ΓΕΜΗ has to be asked). So the parsing carries over unchanged and the only thing
     * that differs is provenance.
     */
    const ingest = async (blocks: string[], source: 'mydata' | 'mydata_self', fromMark: string) => {
      let maxMark = fromMark;
      let upserted = 0;
      /** Counted, not silently dropped: on the transmitted endpoint most documents are our own
       *  sales and skipping them is correct, but the number has to be visible. */
      const skippedByFamily: Record<string, number> = {};

      for (const b of blocks) {
        const mark = pickTag(b, 'mark');
        if (!mark) continue;
        const docType = pickTag(pickTag(b, 'invoiceHeader') ?? b, 'invoiceType');
        if (source === 'mydata_self' && !SELF_TRANSMITTED_EXPENSE_FAMILIES.has(family(docType))) {
          // A sale we issued. Advance the watermark past it anyway — we are deliberately not
          // taking it, and leaving the watermark behind would re-read it every night forever.
          const key = family(docType) || 'unknown';
          skippedByFamily[key] = (skippedByFamily[key] ?? 0) + 1;
          if (Number(mark) > Number(maxMark)) maxMark = mark;
          continue;
        }
        const issuerBlock = pickTag(b, 'issuer') ?? '';
        const counterpartBlock = pickTag(b, 'counterpart') ?? '';
        const headerB = pickTag(b, 'invoiceHeader') ?? b;
        const summaryB = pickTag(b, 'invoiceSummary') ?? b;
        const deliveryB = pickTag(headerB, 'otherDeliveryNoteHeader') ?? '';

        // Per-line detail. `itemCode` and `measurementUnit` are AUTHORITATIVE — AADE states the
        // supplier's article code and the unit of measure outright (code 5 = square metres), so
        // nothing downstream may infer them from the description text when they are present.
        const lines = pickAllTagBlocks(b, 'invoiceDetails').map((lb) => ({
          line_number: num(pickTag(lb, 'lineNumber')),
          item_code: pickTag(lb, 'itemCode'),
          item_description: pickTag(lb, 'itemDescr') ?? pickTag(lb, 'productDescription') ?? null,
          quantity: num(pickTag(lb, 'quantity')),
          measurement_unit: num(pickTag(lb, 'measurementUnit')),
          net_value: num(pickTag(lb, 'netValue')),
          vat_category: num(pickTag(lb, 'vatCategory')),
          vat_amount: num(pickTag(lb, 'vatAmount')),
          comments: pickTag(lb, 'lineComments') || null,
        }));

        const paymentMethods = pickAllTagBlocks(b, 'paymentMethodDetails').map((pb) => ({
          type: num(pickTag(pb, 'type')),
          amount: num(pickTag(pb, 'amount')),
          info: pickTag(pb, 'paymentMethodInfo') || null,
        }));
        const addressOf = (block: string) => {
          const a = pickTag(block, 'address');
          if (!a) return null;
          return {
            street: pickTag(a, 'street'), number: pickTag(a, 'number'),
            postal_code: pickTag(a, 'postalCode'), city: pickTag(a, 'city'),
          };
        };
        const namedAddress = (block: string, tag: string) => {
          const a = pickTag(block, tag);
          if (!a) return null;
          return {
            street: pickTag(a, 'street'), number: pickTag(a, 'number'),
            postal_code: pickTag(a, 'postalCode'), city: pickTag(a, 'city'),
          };
        };

        const issuerVat = pickTag(issuerBlock, 'vatNumber');
        // Learned supplier default wins over the generic myAADE fallback.
        const defaultCategoryId = (issuerVat && issuerCatMap.get(issuerVat)) || myaadeCategoryId;
        // How this inlet names the document. `mark`/`uid`/`authentication_code`/`qr_code_url` are
        // GENERATED columns reading out of here, so this is the single writable home — a document
        // with no MARK is representable, which is what post-2030 ViDA documents will be.
        const sourceRef: Record<string, string> = { mark };
        const uid = pickTag(b, 'uid');
        const authCode = pickTag(b, 'authenticationCode');
        const qrUrl = pickTag(b, 'qrCodeUrl');
        if (uid) sourceRef.uid = uid;
        if (authCode) sourceRef.authentication_code = authCode;
        if (qrUrl) sourceRef.qr_code_url = qrUrl;

        const row = {
          workspace_id: workspaceId,
          source,
          source_ref: sourceRef,
          // For this inlet the identifier IS our myDATA registration — one value read from one
          // variable, so the two roles cannot drift apart. NULL on `mydata`: the supplier filed
          // that one, not us.
          mydata_mark: source === 'mydata_self' ? mark : null,
          download_url: pickTag(b, 'downloadingInvoiceUrl'),
          issuer_vat: issuerVat,
          issuer_name: pickTag(issuerBlock, 'name'),
          issuer_country: pickTag(issuerBlock, 'country'),
          issuer_branch: pickTag(issuerBlock, 'branch'),
          issuer_address: addressOf(issuerBlock),
          counterpart_vat: pickTag(counterpartBlock, 'vatNumber'),
          counterpart_name: pickTag(counterpartBlock, 'name'),
          counterpart_address: addressOf(counterpartBlock),
          issue_date: pickTag(headerB, 'issueDate'),
          // When the goods actually left, and on what truck. Distinct from issueDate and the only
          // dispatch evidence a ΤΔΑ carries.
          dispatch_date: pickTag(headerB, 'dispatchDate') || null,
          vehicle_number: pickTag(headerB, 'vehicleNumber') || null,
          // The column defaults to EUR; read the header rather than assume it, so a
          // foreign-currency document isn't silently relabelled.
          currency: pickTag(headerB, 'currency') || 'EUR',
          doc_type: pickTag(headerB, 'invoiceType'),
          // The issuer's own document number — what's printed on the paper copy.
          series: pickTag(headerB, 'series'),
          aa: pickTag(headerB, 'aa'),
          is_delivery_note: pickTag(headerB, 'isDeliveryNote') === 'true',
          move_purpose: pickTag(headerB, 'movePurpose'),
          vat_payment_suspension: pickTag(headerB, 'vatPaymentSuspension') === 'true',
          delivery_addresses: deliveryB
            ? { loading: namedAddress(deliveryB, 'loadingAddress'), delivery: namedAddress(deliveryB, 'deliveryAddress') }
            : null,
          payment_methods: paymentMethods.length > 0 ? paymentMethods : null,
          total_net: num(pickTag(summaryB, 'totalNetValue')),
          total_vat: num(pickTag(summaryB, 'totalVatAmount')),
          total_gross: num(pickTag(summaryB, 'totalGrossValue')),
          total_withheld: num(pickTag(summaryB, 'totalWithheldAmount')),
          total_fees: num(pickTag(summaryB, 'totalFeesAmount')),
          total_stamp_duty: num(pickTag(summaryB, 'totalStampDutyAmount')),
          total_other_taxes: num(pickTag(summaryB, 'totalOtherTaxesAmount')),
          total_deductions: num(pickTag(summaryB, 'totalDeductionsAmount')),
          lines,
          // Whether the document actually NAMES anything, which is a different fact from where the
          // money record came from. A 14.x carries exactly one line with a net value and no
          // itemDescr, itemCode, quantity or unit (verified on all 32 of them) — and so does most
          // 2.x Greek service billing. `none` is what gates the line editor, and what keeps AI
          // product extraction off documents where it could only invent something.
          lines_source: lines.some((l) => String(l.item_description ?? '').trim()) ? 'mydata' : 'none',
          category_id: defaultCategoryId,
          raw: { xml: b.slice(0, 20000) },
        };
        // `.select()` on an ignoreDuplicates upsert returns ONLY the rows actually inserted, which
        // is exactly the set auto-convert may touch: documents polled now, never the backlog.
        const { data: ins, error } = await supabase
          .from('inbound_documents')
          .upsert(row, { onConflict: 'workspace_id,source,mark', ignoreDuplicates: true })
          .select('id');
        if (error) console.error('[inbound-sync] upsert failed', source, mark, error.message);
        else upserted++;
        const newId = (ins as Array<{ id: string }> | null)?.[0]?.id;
        if (newId) freshDocIds.push(newId);
        if (Number(mark) > Number(maxMark)) maxMark = mark;
      }

      return { found: blocks.length, upserted, maxMark, skippedByFamily };
    };

    const receivedResult = await ingest(received.blocks, 'mydata', watermark);
    const transmittedResult = transmitted.ok
      ? await ingest(transmitted.blocks, 'mydata_self', transmittedWatermark)
      : null;

    const marks: Record<string, string> = {};
    if (receivedResult.maxMark !== watermark) marks.inbound_last_mark = receivedResult.maxMark;
    if (transmittedResult && transmittedResult.maxMark !== transmittedWatermark) {
      marks.inbound_last_transmitted_mark = transmittedResult.maxMark;
    }
    if (Object.keys(marks).length > 0) {
      await supabase.from('finance_settings').update(marks).eq('workspace_id', workspaceId);
    }

    // ── Auto-convert to expenses (opt-in per workspace) ──
    // A document the supplier filed against us IS an obligation, so the "Add to Expenses" click
    // is ceremony. The RPC re-reads the workspace setting itself and applies the family rule
    // (goods / services / expenditure / retail / cross-border only — never credit notes or
    // delivery notes). Scoped to `freshDocIds`, so switching the setting on never converts the
    // historic backlog: those stay in the Inbox until someone asks for them.
    let autoBilled = 0;
    if (freshDocIds.length > 0) {
      const { data: n, error: acErr } = await supabase.rpc('autoconvert_inbound_docs', {
        p_workspace_id: workspaceId, p_doc_ids: freshDocIds,
      });
      if (acErr) console.error('[inbound-sync] auto-convert failed', acErr.message);
      else autoBilled = Number(n) || 0;
    }

    // ── Background AI product extraction → pending-products queue (credit-gated) ──
    // For each not-yet-extracted inbound doc with line detail, run the cheapest model to
    // turn raw supplier lines into clean products and queue them for the operator's ✓/✗.
    // Entitlement was already checked above; each doc costs EXTRACT_CREDIT_COST credits.
    let extracted = 0;
    let autoStocked = 0;
    /** How many documents the extraction SELECT returned. Declared out here with the other
     *  counters because the summary below reports it: reading the `try`-scoped `docs` binding
     *  from the summary threw `docs is not defined` and 500'd the whole sync at the very last
     *  statement — after the upserts, the watermark and the name resolution had all committed,
     *  so the work landed and the caller was told the run failed. */
    let extractionBatch = 0;
    try {
      const EXTRACT_CREDIT_COST = 1;
      /** Documents read per run. The batch now only contains documents that can actually produce
       *  a row, so this is a real throughput number rather than a window that mostly wasted
       *  itself on documents with no line descriptions. */
      const EXTRACT_BATCH_SIZE = 30;
      /** Same billing test as `mustBill` for the sync itself — root / owner-less workspaces
       *  extract for free rather than being blocked by a debit that can never succeed. */
      const mustBillExtraction = !!meta && !meta.is_root && !!meta.created_by;

      // `off` opts the workspace out of reading supplier lines at all — no AI call, no credits,
      // no queue. `suggest` (default) and `auto` both extract; they differ only in whether a
      // certain match is added to stock without a human.
      const { data: wsFin } = await supabase.from('finance_settings')
        .select('warehouse_autosync_mode').eq('workspace_id', workspaceId).maybeSingle();
      const autosyncMode = (wsFin as any)?.warehouse_autosync_mode ?? 'suggest';
      const r2 = (n: number) => Math.round(n * 100) / 100;
      // `off` means don't read supplier lines at all: no AI call, no credits, no queue.
      //
      // `lines_source='none'` documents are excluded here BY CONSTRUCTION, not by a second test:
      // `inbound_docs_needing_extraction` requires at least one line with a non-empty
      // `item_description`, and that is precisely the condition `lines_source` records. Every
      // 14.x carries one value-only line, so the model would have nothing to read and would
      // either return nothing or invent something — and those two are indistinguishable from
      // "this supplier sells nothing we stock".
      //
      // The batch comes from documents that still NEED extraction. The "already extracted?"
      // test MUST be in the query, not the loop: `.order(created_at desc).limit(30)` with the
      // skip applied afterwards fixes the window BEFORE the skip, so once the 30 newest are
      // done every later run re-reads the same 30, skips them all and never reaches the 31st.
      // Such a backlog does not drain slowly — it never drains.
      const sel = autosyncMode === 'off'
        ? { data: [] as any[], error: null }
        : await supabase.rpc('inbound_docs_needing_extraction', {
            p_workspace_id: workspaceId, p_limit: EXTRACT_BATCH_SIZE,
          });
      // Surface a failed selection instead of treating it as "nothing to do". Destructuring only
      // `data` here meant any failure (missing grant, stale PostgREST schema cache, signature
      // drift) produced null -> empty loop -> extracted = 0, reported as success. That is the
      // silent-zero shape this whole feature kept dying of; it does not get to hide in the one
      // place that decides whether ANY work happens.
      if (sel.error) {
        console.error('[inbound-sync] could not select documents to extract', sel.error.message);
        summary.push({ workspaceId, extraction_error: sel.error.message });
      }
      const docs = sel.data;
      extractionBatch = (docs ?? []).length;
      for (const d of (docs ?? []) as any[]) {
        const all = Array.isArray(d.lines) ? d.lines : [];
        const usable = all.filter((l: any) => String(l?.item_description ?? '').trim());
        // Both conditions are now part of the SELECT (`inbound_docs_needing_extraction`), so this
        // is only a cheap guard against a race — two syncs overlapping on the same document.
        if (usable.length === 0) continue;
        const { count } = await supabase.from('warehouse_pending_items')
          .select('id', { count: 'exact', head: true }).eq('inbound_document_id', d.id);
        if ((count ?? 0) > 0) continue;

        // Bill on exactly the same terms as the sync above (`mustBill`): a tenant workspace with
        // an owner pays; the operator's ROOT workspace does not. Extraction used to debit
        // unconditionally, and root carries `created_by = NULL`, so `debit_credits` answered
        // "User credits record not found" → `break` on the FIRST document of every run. Result:
        // 1,731 documents with parsed lines and ZERO pending items, ever — the queue looked
        // simply "empty" rather than broken, and stock intake from myDATA has never once run.
        if (mustBillExtraction) {
          const { data: debit } = await supabase.rpc('debit_credits', {
            p_user_id: meta!.created_by, p_amount: EXTRACT_CREDIT_COST,
            p_operation_type: 'expense_product_extraction',
            p_description: `AI product extraction (inbound doc ${d.id})`,
            p_workspace_id: workspaceId ?? null,
          });
          const drow = Array.isArray(debit) ? debit[0] : debit;
          if (!drow?.success) break; // genuinely out of credits — stop extracting for this workspace
        }

        // Per-doc isolation: a single doc's extraction failure must (a) refund THAT
        // doc's credit and (b) not abort the whole batch. Previously
        // the catch was outside the loop → charged-but-not-delivered + lost intake.
        try {
          const suggestions = await extractProductsFromLines(
            supabase,
            usable.map((l: any, i: number) => ({ index: i, description: String(l.item_description), quantity: l.quantity ?? null })),
            // The same pair the debit above used. Billing already knew who was paying; the usage
            // log did not, so the cost of this feature was unattributable to any tenant.
            { userId: meta?.created_by ?? undefined, workspaceId: workspaceId ?? undefined },
          );
          const byIdx = new Map(suggestions.map((s) => [s.index, s]));
          const pendingRows = usable.map((l: any, i: number) => {
            const s = byIdx.get(i);
            const qty = l.quantity != null && Number(l.quantity) > 0 ? Number(l.quantity) : 1;
            const netValue = l.net_value != null ? Number(l.net_value) : null;
            const unitCost = netValue != null ? r2(netValue / qty) : null;
            // A myDATA line is not just a description. It states the unit, the supplier's own
            // article code and the VAT category, and those are FACTS about the document — read
            // them rather than asking a model to re-derive them from prose that may not say.
            // `src/lib/units.ts` puts it plainly: "wherever a code is present it is the
            // authority — never infer the unit from a product description instead." Inferring
            // it is exactly what this did, for every line it ever queued: 4.1 metres of worktop
            // (measurement_unit 4) was filed as 4.1 pieces, which is not a thing.
            const unitCode = l.measurement_unit != null ? Number(l.measurement_unit) : null;
            const itemCode = String(l.item_code ?? '').trim();
            // The product name ALONE. `size` and `attributes` are kept in their own columns and
            // shown as evidence; gluing all three into one string produced names like "AMALFI
            // GRIS 80x80 grey finish" and "Magnetic Ceiling Rail 48VDC 3 black matte finish",
            // which is the AI's structured answer flattened back into the prose it came from.
            const name = String(s?.name ?? '').trim() || String(l.item_description);
            return {
              workspace_id: workspaceId, inbound_document_id: d.id, line_index: i,
              raw_description: String(l.item_description), name: name || 'Item',
              sku: s?.sku ?? null, size: s?.size ?? null, attributes: s?.attributes ?? null,
              // The stated unit wins; the model's reading is the fallback for a line that omits
              // the code (1,621 of 3,643 lines here do).
              unit: unitFromMydataCode(unitCode) ?? s?.unit ?? null,
              measurement_unit_code: unitCode,
              supplier_product_code: itemCode || null,
              // Feeds `products.brand_company_id` at approval, which is the only thing that makes
              // the BRAND rung of the pricing ladder reachable. Left null, every product intake
              // creates is priced as though it had no maker.
              manufacturer: String(s?.manufacturer ?? '').trim() || null,
              mydata_vat_category: l.vat_category != null ? Number(l.vat_category) : null,
              quantity: qty, unit_cost: unitCost, net_value: netValue,
              currency: d.currency ?? 'EUR',
            };
          });
          const { error: upErr } = await supabase.from('warehouse_pending_items')
            .upsert(pendingRows, { onConflict: 'inbound_document_id,line_index', ignoreDuplicates: true });
          if (upErr) throw new Error(`queueing ${pendingRows.length} line(s) failed: ${upErr.message}`);
          extracted += pendingRows.length;

          // Match each queued line against stock the workspace already carries, so approving it
          // TOPS UP the existing product instead of creating a near-duplicate. Server-side on
          // purpose — the same rule living only in ReceiveToWarehouseDialog runs only when a
          // human opens that dialog, leaving everything queued here unmatched.
          const { error: matchErr } = await supabase.rpc('match_pending_items_for_document', { p_doc_id: d.id });
          if (matchErr) console.error('[inbound-sync] match failed for doc', d.id, matchErr.message);
          // Then, only when the workspace opted into `auto`, add the certain matches (score 1.0 —
          // the supplier's own item code identifies existing stock). Everything else stays queued.
          const { data: autoAdded, error: autoErr } = await supabase.rpc('autoapprove_pending_items_for_document', { p_doc_id: d.id });
          if (autoErr) console.error('[inbound-sync] auto-add failed for doc', d.id, autoErr.message);
          if (autoAdded) autoStocked += Number(autoAdded) || 0;
        } catch (docErr) {
          console.error('[inbound-sync] extraction failed for doc', d.id, String(docErr));
          // Refund the credit for this doc — nothing was queued. Only when one was actually
          // taken: refunding an un-billed root extraction would mint credit from nothing.
          if (mustBillExtraction) {
            try {
              await supabase.rpc('refund_credits', {
                p_user_id: meta!.created_by, p_amount: EXTRACT_CREDIT_COST,
                p_operation_type: 'expense_product_extraction.refund',
                p_description: `Refund: extraction failed (inbound doc ${d.id})`,
                p_workspace_id: workspaceId ?? null,
              });
            } catch (refundErr) { console.error('[inbound-sync] refund failed (non-fatal)', String(refundErr)); }
          }
          // continue with the next doc
        }
      }
    } catch (e) { console.error('[inbound-sync] product extraction failed', String(e)); }

    // ── Resolve the issuer names AADE omits ──────────────────────────────────────────
    // RequestDocs identifies the issuer by ΑΦΜ only — there is no <name> in the feed — so
    // ~2/3 of received documents would otherwise show a bare VAT number. Resolved from the
    // ΓΕΜΗ public registry, then — only for the ΑΦΜ ΓΕΜΗ has no record of, and only when the
    // workspace opted in — from ΑΑΔΕ, which notifies the looked-up business (see
    // resolve-issuer-names.ts). Best-effort: never fails the sync, and each run also chips
    // away at pre-existing name-less rows.
    let issuers: unknown = null;
    try {
      issuers = await resolveInboundIssuerNames(supabase, workspaceId, gemiApiKey, {
        aadeFallback: !!(fs as any)?.resolve_issuer_names_via_aade,
      });
    } catch (e) { console.error('[inbound-sync] issuer name resolution failed', String(e)); }

    summary.push({
      workspaceId,
      // `found` and `upserted` stay top-level and mean what they always meant: every document
      // this run saw, from both endpoints.
      found: receivedResult.found + (transmittedResult?.found ?? 0),
      upserted: receivedResult.upserted + (transmittedResult?.upserted ?? 0),
      received: {
        found: receivedResult.found, upserted: receivedResult.upserted,
        pages: received.pages, new_watermark: receivedResult.maxMark,
        // Never silent. A capped list looks exactly like a complete one.
        ...(received.capped ? { truncated_at_pages: MAX_PAGES } : {}),
      },
      transmitted: transmitted.ok
        ? {
            found: transmittedResult!.found, upserted: transmittedResult!.upserted,
            pages: transmitted.pages, new_watermark: transmittedResult!.maxMark,
            // Our own sales, deliberately not ingested — reported so "0 upserted" is never
            // mistaken for "the endpoint returned nothing".
            skipped_own_sales: transmittedResult!.skippedByFamily,
            ...(transmitted.capped ? { truncated_at_pages: MAX_PAGES } : {}),
          }
        : { error: transmitted.error ?? 'RequestTransmittedDocs failed' },
      auto_billed: autoBilled,
      extraction_batch: extractionBatch, extracted, auto_stocked: autoStocked,
      issuers,
      ...(dated ? { date_from: dateFrom, date_to: dateTo } : {}),
    });
  }

  return json({ ok: true, workspaces: summary.length, results: summary });
}));
