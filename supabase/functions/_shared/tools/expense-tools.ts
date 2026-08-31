/**
 * Expense Tools — agent-chat surface for business operating expenses (rent, utilities, fees…).
 *
 * Mirrors the Finance "Add expense" page flow: an expense is a categorized supplier bill (the
 * canonical spend record that feeds Payables/AP + P&L per category). Payee is required by the
 * DB (supplier_bills CHECK). Tools:
 *   - record_expense         — create a categorized expense bill (optionally paid now)
 *   - list_recent_expenses   — read the workspace's recent expense bills
 *   - pay_expense            — settle an EXISTING expense, including one still sitting in the
 *                              myDATA Expenses Inbox as an unconverted received document
 *   - get_expense_payments   — the reverse direction: what has settled a given expense
 *
 * pay_expense / get_expense_payments are the agent mirror of ExpensePaymentsDialog. They write
 * only through the allocation ledger (record_payment_fx → payment_allocations), so the bill's
 * amount_paid / status are derived by the same triggers the UI relies on — nothing here decides
 * for itself what is settled.
 *
 * All writes are scoped to the caller's workspace_id (resolved upstream by agent-chat).
 * Category + payee are resolved by name (find-or-create). record_payment_fx settles the
 * "paid now" case; its assert_workspace_member is a no-op under the service context.
 */

import { computeExpenseSplit } from '../finance/expense-math.ts';
import { moduleGate } from './module-gate.ts';
import { attachPartyNames } from './record-labels.ts';
import { mentionsMyDataFeed } from '../finance/mydata-intent.ts';

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
function svc() { return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); }
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
/**
 * User-scoped client, for the RPCs that ask WHO IS CALLING rather than which workspace.
 *
 * `assert_workspace_member` exempts `service_role`, so most reads here can use the service client
 * with an explicit `workspace_id`. `is_workspace_finance_manager` does NOT: it is `auth.uid()` in
 * `workspace_members` and nothing else, so a service-role caller is not a finance manager and
 * `workspace_inbound_status` returns NO ROW — an unconfigured-looking answer for a workspace that
 * is configured, which is the silent zero this tool exists to close, not to ship.
 */
function userClient(jwt: string | undefined) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
  });
}

/** Find (or create) an expense-side finance category by name. */
async function resolveCategory(workspaceId: string, name: string): Promise<{ id: string; name: string }> {
  const sb = svc();
  const found = await sb.from('finance_categories')
    .select('id, name').eq('workspace_id', workspaceId).in('kind', ['expense', 'both'])
    .ilike('name', name.trim()).limit(1).maybeSingle();
  if (found.data?.id) return { id: found.data.id, name: found.data.name };
  const ins = await sb.from('finance_categories')
    .insert({ workspace_id: workspaceId, name: name.trim(), kind: 'expense' }).select('id, name').single();
  if (ins.error) throw ins.error;
  return { id: ins.data.id, name: ins.data.name };
}

/** Find (or create) a supplier/payee company by name. supplier_bills requires a counterparty. */
async function resolvePayee(workspaceId: string, name: string): Promise<{ id: string; name: string }> {
  const sb = svc();
  const found = await sb.from('crm_companies')
    .select('id, name').eq('workspace_id', workspaceId).ilike('name', name.trim()).limit(1).maybeSingle();
  if (found.data?.id) {
    await sb.from('crm_companies').update({ is_supplier: true }).eq('id', found.data.id);
    return { id: found.data.id, name: found.data.name };
  }
  const ins = await sb.from('crm_companies')
    // is_customer explicitly false — the column DEFAULTS TO TRUE, so a payee created here
    // silently landed in the customer lists too.
    .insert({ workspace_id: workspaceId, name: name.trim(), is_supplier: true, is_customer: false }).select('id, name').single();
  if (ins.error) throw ins.error;
  return { id: ins.data.id, name: ins.data.name };
}

/**
 * Resolve a FILING target by name — an expense card or a building.
 *
 * Deliberately NOT find-or-create, unlike the category and payee above. Those are labels: a new
 * one costs nothing and inventing it is the helpful answer. A trip card and a property are
 * RECORDS. Conjuring "the Athens trip" because the operator's expense mentioned Athens would
 * fabricate a claim nobody filed and a building nobody owns, and every later expense would file
 * against the fake one.
 *
 * Ambiguity is reported, never guessed. Two cards called "June expenses" belong to two different
 * people, and picking the first is how one rep's hotel bill lands on another's claim.
 */
async function resolveFilingTarget(
  workspaceId: string,
  table: 'trip_expense_reports' | 'properties',
  nameColumn: 'title',
  value: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const what = table === 'properties' ? 'property' : 'expense card';
  const q = value.trim();
  const sb = svc();
  const res = await sb.from(table)
    .select(`id, ${nameColumn}`).eq('workspace_id', workspaceId)
    .ilike(nameColumn, `%${q}%`).limit(5);
  if (res.error) return { ok: false, error: res.error.message };
  const rows = (res.data ?? []) as Array<Record<string, string>>;
  if (rows.length === 0) {
    return { ok: false, error: `No ${what} matching "${q}". It has to exist first — I will not create one to file an expense against.` };
  }
  if (rows.length > 1) {
    const names = rows.map((r) => r[nameColumn]).filter(Boolean).join(', ');
    return { ok: false, error: `More than one ${what} matches "${q}": ${names}. Which one?` };
  }
  return { ok: true, id: rows[0].id, name: rows[0][nameColumn] };
}

// ───────────────────────────── record_expense ─────────────────────────────
export const createRecordExpenseTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ amount, category, payee, description, vat_amount, currency, expense_date, paid, trip, property }: {
    amount: number; category: string; payee: string; description?: string;
    vat_amount?: number; currency?: string; expense_date?: string; paid?: boolean;
    trip?: string; property?: string;
  }) => {
    const denied = await moduleGate(workspaceId, 'sales-finance');
    if (denied) return denied;
    try {
      // Validation + net/VAT/total split — pure, shared with tests/unit/expenseMath.test.ts.
      const split = computeExpenseSplit({ amount, vat_amount, category, payee, currency });
      if (!split.ok) return JSON.stringify({ success: false, error: split.error });
      const { total, vat, net, currency: cur } = split;
      const issued = expense_date || new Date().toISOString().slice(0, 10);

      const cat = await resolveCategory(workspaceId, category);
      const pay = await resolvePayee(workspaceId, payee);

      // Filing links, resolved BEFORE the insert so an unresolvable one costs nothing. Booking the
      // bill first and failing to file it afterwards would leave a real payable whose whole point
      // was to sit on a trip card, and the agent reporting a partial success it cannot undo.
      let tripRef: { id: string; name: string } | null = null;
      let propRef: { id: string; name: string } | null = null;
      if (trip?.trim()) {
        const r = await resolveFilingTarget(workspaceId, 'trip_expense_reports', 'title', trip);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        tripRef = { id: r.id, name: r.name };
      }
      if (property?.trim()) {
        const r = await resolveFilingTarget(workspaceId, 'properties', 'title', property);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        propRef = { id: r.id, name: r.name };
      }

      const sb = svc();
      const billIns = await sb.from('supplier_bills').insert({
        workspace_id: workspaceId,
        supplier_company_id: pay.id,
        supplier_bill_number: description?.trim()?.slice(0, 60) || null,
        currency: cur,
        subtotal_net: net,
        vat_amount: vat,
        total,
        issued_at: issued,
        notes: description ?? null,
        category_id: cat.id,
        created_by: userId,
        trip_report_id: tripRef?.id ?? null,
        property_id: propRef?.id ?? null,
      }).select('id').single();
      if (billIns.error) throw billIns.error;
      const billId = billIns.data.id;

      /**
       * The bill above is COMMITTED (#395, the #351 C3 shape on the agent surface).
       *
       * Bill and payment are two writes with no transaction between them. Throwing here rejected
       * the whole call, so the agent reported "could not record expense" for a payable that
       * exists — and the obvious next turn recreates it, booking the cost and the cash-out twice.
       * The identical defect was fixed in `financeService.createExpense` for the dialog; the tool
       * kept it.
       *
       * So a payment failure is REPORTED, not thrown. The bill is settleable from Payables, which
       * is the recovery the operator actually has, and `pay_expense` is the tool for it.
       */
      let paymentId: string | null = null;
      let paymentError: string | null = null;
      if (paid && total > 0) {
        try {
          // Default bank account for the money-out; NULL is acceptable if none configured.
          const acct = await sb.from('finance_bank_accounts')
            .select('id').eq('workspace_id', workspaceId).eq('is_active', true)
            .order('is_default', { ascending: false }).limit(1).maybeSingle();
          const rp = await sb.rpc('record_payment_fx', {
            p_workspace_id: workspaceId, p_direction: 'out', p_amount: total, p_currency: cur,
            p_fx_rate_to_base: 1, p_method: 'bank_transfer', p_paid_at: new Date().toISOString(),
            p_counterparty_contact_id: null, p_counterparty_company_id: pay.id,
            p_reference: description ?? null, p_notes: description ?? null,
            p_allocations: [{ target_id: billId, target_type: 'supplier_bill', amount_doc: total, fx_rate: 1 }],
            p_category_id: cat.id, p_bank_account_id: acct.data?.id ?? null,
          });
          if (rp.error) throw rp.error;
          paymentId = rp.data as string;
        } catch (payErr: any) {
          paymentError = payErr?.message || 'the payment could not be recorded';
          console.error('[expense-tools] bill created, payment not recorded', payErr);
        }
      }
      const reallyPaid = Boolean(paid) && !paymentError;

      // The filing is part of what happened, so it travels in the chunk the card renders as well
      // as in the sentence. A tool that files an expense somewhere and does not say where has told
      // the operator less than the form would have.
      onChunk?.({ type: 'expense_recorded', data: { bill_id: billId, category: cat.name, payee: pay.name, total, currency: cur, paid: reallyPaid, trip: tripRef?.name ?? null, property: propRef?.name ?? null } });
      return JSON.stringify({
        success: true, bill_id: billId, payment_id: paymentId,
        category: cat.name, payee: pay.name, total, vat, net, currency: cur,
        trip: tripRef?.name ?? null, property: propRef?.name ?? null,
        status: reallyPaid ? 'paid' : 'payable',
        payment_recorded: paid ? reallyPaid : undefined,
        payment_error: paymentError ?? undefined,
        message: (reallyPaid
          ? `Recorded ${total} ${cur} expense to ${pay.name} (${cat.name}) and marked it paid.`
          : paymentError
            ? `Recorded the ${total} ${cur} expense to ${pay.name} (${cat.name}) as an open payable — the PAYMENT was not recorded (${paymentError}). Settle it from Payables or with pay_expense. Do NOT record the expense again.`
            : `Recorded ${total} ${cur} expense to ${pay.name} (${cat.name}) as an open payable in AP.`)
          + (tripRef ? ` Filed against ${tripRef.name}.` : '')
          + (propRef ? ` For ${propRef.name}.` : ''),
      });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not record expense' });
    }
  }, {
    name: 'record_expense',
    description: 'Record a business operating expense (rent, utilities, fees…) as a categorized supplier bill. Creates the category and payee by name if they do not exist. Leave it as an open payable (default) or mark it paid. Optionally file it against an existing trip/monthly expense card or a building — those are looked up, never created. Use when the user says e.g. "record 500 euro rent to Acme for June", "log the electricity bill, paid", or "put the Athens hotel on my June expense card".',
    schema: z.object({
      amount: z.number().describe('Total amount including VAT'),
      category: z.string().describe('Expense category, e.g. Rent, Utilities, Insurance (created if new)'),
      payee: z.string().describe('Supplier / payee name, e.g. landlord or utility company (created if new)'),
      description: z.string().optional().describe('Short description, e.g. "Office rent — June 2026"'),
      vat_amount: z.number().optional().describe('VAT portion of the total (default 0)'),
      currency: z.string().optional().describe('ISO currency (default EUR)'),
      expense_date: z.string().optional().describe('YYYY-MM-DD (defaults to today)'),
      paid: z.boolean().optional().describe('true = also record the payment now (settled); false/omitted = leave as an open payable'),
      trip: z.string().optional().describe('File it against an existing trip / monthly expense card, by name. Must already exist — never created.'),
      property: z.string().optional().describe('The building this cost is for, by name or address. Must already exist — never created.'),
    }),
  });

// ───────────────────────────── pay_expense ─────────────────────────────

/** An expense the agent can name back to the user when a search matched more than one. */
interface ExpenseCandidate {
  id: string; supplier_bill_number: string | null; supplier_name: string | null;
  supplier_company_id: string | null; total: number; amount_due: number;
  currency: string; issued_at: string | null;
}

/**
 * Resolve the expense the user meant. Searches OPEN expenses by bill number / payee, and — when
 * nothing matches — the myDATA Inbox for a received document not yet turned into an expense, so
 * "pay the Vodafone bill that came in" works before anyone has pressed "Create bill".
 * Returns a single match, or the candidates so the agent can ask which one.
 */
async function resolveExpense(workspaceId: string, ref: string): Promise<
  { kind: 'expense'; row: ExpenseCandidate } |
  { kind: 'inbox'; docId: string; label: string; total: number; currency: string } |
  { kind: 'ambiguous'; candidates: ExpenseCandidate[] } |
  { kind: 'none' }
> {
  const sb = svc();
  const needle = ref.trim();
  const cols = 'id, supplier_bill_number, supplier_name, supplier_company_id, total, amount_due, currency, issued_at';

  const open = await sb.from('supplier_bills').select(cols)
    .eq('workspace_id', workspaceId)
    .not('status', 'in', '("void","paid")')
    .gt('amount_due', 0)
    .order('issued_at', { ascending: false, nullsFirst: false })
    .limit(200);
  const rows = (open.data ?? []) as ExpenseCandidate[];

  // Payee names live on the bill (one-off) or on the linked CRM company — resolve both.
  const companyIds = [...new Set(rows.map((r) => r.supplier_company_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (companyIds.length) {
    const cs = await sb.from('crm_companies').select('id, name').in('id', companyIds);
    for (const c of (cs.data ?? []) as any[]) names.set(c.id, c.name ?? '');
  }
  const lower = needle.toLowerCase();
  const matches = rows.filter((r) =>
    (r.supplier_bill_number ?? '').toLowerCase().includes(lower) ||
    (r.supplier_name ?? '').toLowerCase().includes(lower) ||
    (r.supplier_company_id ? (names.get(r.supplier_company_id) ?? '') : '').toLowerCase().includes(lower));

  if (matches.length === 1) return { kind: 'expense', row: matches[0] };
  if (matches.length > 1) {
    return {
      kind: 'ambiguous',
      candidates: matches.slice(0, 8).map((r) => ({
        ...r,
        supplier_name: r.supplier_name ?? (r.supplier_company_id ? names.get(r.supplier_company_id) ?? null : null),
      })),
    };
  }

  // Nothing open matched — try the Inbox (MARK, issuer name, or the issuer's own series/number).
  const inbox = await sb.from('inbound_documents')
    .select('id, mark, issuer_name, series, aa, total_gross, currency')
    .eq('workspace_id', workspaceId).eq('status', 'new')
    .is('created_supplier_bill_id', null).gt('total_gross', 0)
    .order('issue_date', { ascending: false, nullsFirst: false }).limit(200);
  const docs = ((inbox.data ?? []) as any[]).filter((d) =>
    String(d.mark ?? '').includes(needle) ||
    String(d.issuer_name ?? '').toLowerCase().includes(lower) ||
    `${d.series ?? ''} ${d.aa ?? ''}`.trim().toLowerCase().includes(lower));
  if (docs.length === 1) {
    const d = docs[0];
    return {
      kind: 'inbox', docId: d.id, total: Number(d.total_gross ?? 0), currency: d.currency ?? 'EUR',
      label: `${d.issuer_name ?? 'received document'}${d.series ? ` · ${d.series} ${d.aa ?? ''}`.trimEnd() : ''}`,
    };
  }
  return { kind: 'none' };
}

export const createPayExpenseTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ expense, amount, paid_on, method, reference }: {
    expense: string; amount?: number; paid_on?: string; method?: string; reference?: string;
  }) => {
    const denied = await moduleGate(workspaceId, 'sales-finance');
    if (denied) return denied;
    try {
      const found = await resolveExpense(workspaceId, expense);
      if (found.kind === 'none') {
        return JSON.stringify({ success: false, error: `No unpaid expense or Inbox document matches "${expense}".` });
      }
      if (found.kind === 'ambiguous') {
        return JSON.stringify({
          success: false, needs_disambiguation: true,
          message: `More than one unpaid expense matches "${expense}". Ask which one.`,
          candidates: found.candidates.map((c) => ({
            reference: c.supplier_bill_number, payee: c.supplier_name,
            due: c.amount_due, currency: c.currency, issued_at: c.issued_at,
          })),
        });
      }

      const sb = svc();
      // An Inbox document becomes an expense first. The RPC is idempotent, so this can never
      // create a second payable for the same received document.
      let billId: string; let due: number; let currency: string; let label: string;
      if (found.kind === 'inbox') {
        const conv = await sb.rpc('inbound_doc_to_supplier_bill', { p_doc_id: found.docId });
        if (conv.error) throw conv.error;
        billId = conv.data as string;
        const b = await sb.from('supplier_bills').select('amount_due, currency').eq('id', billId).single();
        due = Number(b.data?.amount_due ?? found.total);
        currency = b.data?.currency ?? found.currency;
        label = found.label;
      } else {
        billId = found.row.id; due = Number(found.row.amount_due); currency = found.row.currency;
        label = found.row.supplier_bill_number ?? found.row.supplier_name ?? 'expense';
      }

      const pay = amount == null ? due : Number(amount);
      if (!(pay > 0)) return JSON.stringify({ success: false, error: 'Payment amount must be positive.' });
      if (pay > due + 0.01) {
        return JSON.stringify({ success: false, error: `That expense only has ${due} ${currency} outstanding.` });
      }

      const bill = await sb.from('supplier_bills')
        .select('supplier_company_id, supplier_contact_id, category_id').eq('id', billId).single();
      const acct = await sb.from('finance_bank_accounts')
        .select('id').eq('workspace_id', workspaceId).eq('is_active', true)
        .order('is_default', { ascending: false }).limit(1).maybeSingle();

      const rp = await sb.rpc('record_payment_fx', {
        p_workspace_id: workspaceId, p_direction: 'out', p_amount: pay, p_currency: currency,
        p_fx_rate_to_base: 1, p_method: method ?? 'bank_transfer',
        p_paid_at: paid_on ? new Date(paid_on).toISOString() : new Date().toISOString(),
        p_counterparty_contact_id: bill.data?.supplier_contact_id ?? null,
        p_counterparty_company_id: bill.data?.supplier_company_id ?? null,
        p_reference: reference ?? null, p_notes: null,
        p_allocations: [{ target_id: billId, target_type: 'supplier_bill', amount_doc: pay, fx_rate: 1 }],
        p_category_id: bill.data?.category_id ?? null, p_bank_account_id: acct.data?.id ?? null,
      });
      if (rp.error) throw rp.error;

      const after = await sb.from('supplier_bills').select('amount_due, status').eq('id', billId).single();
      const settled = Number(after.data?.amount_due ?? 0) <= 0.005;
      onChunk?.({ type: 'expense_paid', data: { bill_id: billId, label, amount: pay, currency, settled, remaining: Number(after.data?.amount_due ?? 0) } });
      return JSON.stringify({
        success: true, bill_id: billId, payment_id: rp.data, amount: pay, currency,
        from_inbox: found.kind === 'inbox', status: after.data?.status,
        remaining_due: Number(after.data?.amount_due ?? 0),
        message: settled
          ? `Paid ${pay} ${currency} to settle ${label}. It is now fully paid and out of Payables.`
          : `Paid ${pay} ${currency} against ${label}. ${after.data?.amount_due} ${currency} still due.`,
      });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not pay the expense' });
    }
  }, {
    name: 'pay_expense',
    description: 'Record a payment against an EXISTING expense / supplier bill so it settles and drops out of Payables. Also works for a myDATA received document still sitting in the Expenses Inbox — it is turned into an expense first. Pays the full outstanding amount unless an amount is given. Use for "pay the Vodafone bill", "I paid 200 off the rent invoice". Do NOT use to create a new cost — that is record_expense.',
    schema: z.object({
      expense: z.string().describe('Which expense: a bill reference/number, the payee name, or a myDATA MARK / issuer name for something still in the Inbox'),
      amount: z.number().optional().describe('How much to pay (defaults to the full outstanding amount)'),
      paid_on: z.string().optional().describe('YYYY-MM-DD (defaults to today)'),
      method: z.string().optional().describe('bank_transfer | cash | card | check | other (default bank_transfer)'),
      reference: z.string().optional().describe('Bank reference / cheque number'),
    }),
  });

// ───────────────────────────── get_expense_payments ─────────────────────────────
export const createGetExpensePaymentsTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ expense }: { expense: string }) => {
    const denied = await moduleGate(workspaceId, 'sales-finance');
    if (denied) return denied;
    try {
      const found = await resolveExpense(workspaceId, expense);
      // A fully-paid expense is exactly what someone asks about here, and resolveExpense only
      // searches OPEN ones — fall back to a wider search including settled bills.
      let billId: string | null = null;
      if (found.kind === 'expense') billId = found.row.id;
      else if (found.kind === 'ambiguous') {
        return JSON.stringify({
          success: false, needs_disambiguation: true,
          candidates: found.candidates.map((c) => ({ reference: c.supplier_bill_number, payee: c.supplier_name, due: c.amount_due })),
        });
      } else {
        const sb0 = svc();
        const any = await sb0.from('supplier_bills')
          .select('id, supplier_bill_number, supplier_name')
          .eq('workspace_id', workspaceId)
          .or(`supplier_bill_number.ilike.%${expense.trim()}%,supplier_name.ilike.%${expense.trim()}%`)
          .order('issued_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
        billId = (any.data as any)?.id ?? null;
      }
      if (!billId) return JSON.stringify({ success: false, error: `No expense matches "${expense}".` });

      const sb = svc();
      const bill = await sb.from('supplier_bills')
        .select('supplier_bill_number, supplier_name, total, amount_paid, amount_due, currency, status')
        .eq('id', billId).single();
      const allocs = await sb.from('payment_allocations')
        .select(`id, amount,
          payment:payments(id, paid_at, method, reference, currency),
          supplier_credit_note:supplier_credit_notes(supplier_credit_note_number, issued_at, currency, reason)`)
        .eq('supplier_bill_id', billId);

      // Both sources relieve the bill — listing only the cash would disagree with amount_paid.
      const settlements = ((allocs.data ?? []) as any[]).map((a) => a.payment
        ? { how: 'payment', amount: Number(a.amount), date: a.payment.paid_at, method: a.payment.method, reference: a.payment.reference }
        : a.supplier_credit_note
          ? { how: 'supplier_credit_note', amount: Number(a.amount), date: a.supplier_credit_note.issued_at, reference: a.supplier_credit_note.supplier_credit_note_number, reason: a.supplier_credit_note.reason }
          : null).filter(Boolean);

      const b: any = bill.data ?? {};
      onChunk?.({ type: 'expense_payments', data: { bill_id: billId, label: b.supplier_bill_number ?? b.supplier_name, settlements, amount_due: Number(b.amount_due ?? 0), currency: b.currency } });
      return JSON.stringify({
        success: true, bill_id: billId,
        expense: b.supplier_bill_number ?? b.supplier_name, status: b.status,
        total: Number(b.total ?? 0), settled: Number(b.amount_paid ?? 0),
        still_due: Number(b.amount_due ?? 0), currency: b.currency,
        settlements,
      });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not read the expense payments' });
    }
  }, {
    name: 'get_expense_payments',
    description: 'Show everything that has settled a given expense / supplier bill — each payment AND any supplier credit notes — plus how much is still due. Use for "what have I paid on the Vodafone bill?" or "is that expense settled?".',
    schema: z.object({
      expense: z.string().describe('Bill reference/number or payee name'),
    }),
  });

// ───────────────────────────── list_recent_expenses ─────────────────────────────

/**
 * Where each recorded expense CAME FROM, as a fact rather than a guess.
 *
 * Asked "only the expenses from myAADE, not the ones added manually", the model had no filter and
 * no column, so it read the origin out of the `notes` prose ("From myDATA received document 4000…")
 * and answered from a string. `inbound_documents.created_supplier_bill_id` is the actual link, and
 * `supplier_bills.order_id` is the other one — both joinable, neither previously asked.
 *
 * Three origins, because there are three: a document ΑΑΔΕ sent us, a cost booked against one of our
 * own orders, and something a person typed in.
 */
async function stampExpenseSource(sb: any, workspaceId: string, rows: any[]): Promise<any[]> {
  if (rows.length === 0) return rows;
  const fromMydata = new Set<string>();
  try {
    const { data } = await sb.from('inbound_documents')
      .select('created_supplier_bill_id')
      .eq('workspace_id', workspaceId)
      .in('created_supplier_bill_id', rows.map((r) => r.id));
    for (const d of (data ?? []) as Array<{ created_supplier_bill_id: string | null }>) {
      if (d.created_supplier_bill_id) fromMydata.add(d.created_supplier_bill_id);
    }
  } catch {
    // Unknown is not "manual". Leaving `source` off the row entirely is the honest failure: the
    // card shows no origin column rather than a column that quietly says everything was typed in.
    return rows;
  }
  return rows.map((r) => ({
    ...r,
    source: fromMydata.has(r.id) ? 'mydata' : (r.order_id ? 'order' : 'manual'),
  }));
}

export const createListExpensesTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ limit, source }: { limit?: number; source?: 'all' | 'mydata' | 'order' | 'manual' }) => {
    const denied = await moduleGate(workspaceId, 'sales-finance');
    if (denied) return denied;
    try {
      const sb = svc();
      // WHO the expense is with is the first thing anyone asks of this list, and it was the one
      // thing the select left out: the supplier survived only inside `notes` ("From myDATA
      // received document 4000… · ΑΠΟΣΤΟΛΙΔΗΣ ΑΕΒΕ"), so the card had no Supplier column and
      // nothing to link to CRM. `supplier_company_id` + `order_id` are what make the row openable.
      const { data, error } = await sb.from('supplier_bills')
        .select('id, supplier_bill_number, supplier_company_id, supplier_name, total, amount_due, currency, status, issued_at, order_id, project_id, category_id, notes')
        .eq('workspace_id', workspaceId)
        .order('issued_at', { ascending: false, nullsFirst: false })
        .limit(Math.min(Math.max(limit ?? 15, 1), 50));
      if (error) throw error;
      const named = await attachPartyNames(sb, data ?? [], [
        { idField: 'supplier_company_id', nameField: 'supplier_name' },
      ]);
      const stamped = await stampExpenseSource(sb, workspaceId, named);
      const want = source && source !== 'all' ? source : null;
      const expenses = want ? stamped.filter((r) => r.source === want) : stamped;
      // Ship the rows in the chunk (not just a count) so the card renders line items, like the
      // finance-tools list chunks — a count-only chunk rendered an empty-looking card.
      onChunk?.({ type: 'expenses_list', data: { count: expenses.length, source: source ?? 'all', expenses } });
      return JSON.stringify({
        success: true,
        source: source ?? 'all',
        expenses,
        // Said out loud, because this list is BOOKED expenses only. A workspace can have two of
        // these and 1,800 documents sitting in the myDATA inbox unconverted, and answering
        // "expenses from myDATA" with the booked two reads as the whole picture.
        note: want === 'mydata'
          ? 'These are myDATA documents already booked as expenses. Documents ΑΑΔΕ has sent that nobody has booked yet are NOT here — use list_mydata_expenses for those.'
          : undefined,
      });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not list expenses' });
    }
  }, {
    name: 'list_recent_expenses',
    description:
      "THE tool for expenses. Any question about our expenses, spending, supplier bills or payables "
      + 'answers from here — "recent expenses", "expenses by supplier", "unpaid expenses", "what did '
      + 'we spend" — because expenses means the ones RECORDED IN OUR OWN BOOKS. Returns each bill '
      + 'with its supplier, status, amount due and origin. '
      + 'ONE exception, and it is absolute: if the request names myDATA / ΑΑΔΕ / myAADE at all, do '
      + 'NOT use this tool — use list_mydata_expenses, even when the person also says "expenses".',
    schema: z.object({
      limit: z.number().optional().describe('How many to return (default 15, max 50)'),
      source: z.enum(['all', 'mydata', 'order', 'manual']).optional()
        // Documented on the PARAMETER, not in the tool description. Spelling out "so myDATA
        // expenses are answered here" up there was measured pulling two explicit feed requests
        // onto this tool — the description is what selection reads, and the rule has to be one
        // sentence with no competing clause.
        .describe('Filter the booked expenses by origin: mydata | order | manual. Default all.'),
    }),
  });

// ───────────────────────────── list_mydata_expenses ─────────────────────────────
/**
 * The myDATA / ΑΑΔΕ expenses feed — what suppliers have filed against US.
 *
 * This did not exist, and its absence was invisible. Asked for "the expenses we get from myAADE",
 * the agent had exactly one expense tool — `list_recent_expenses` over `supplier_bills` — so it
 * answered with the SIX booked expenses and inferred which came from myDATA by reading the `notes`
 * prose. It reported two. There were 1,866 documents in the inbox spanning 2024-02 to 2026-08.
 * Every part of that answer was well-formed and confidently wrong by three orders of magnitude:
 * the silent-zero shape (CLAUDE.md, anti-regression 2) seen from the reader's side.
 *
 * `inbound_documents` was reachable from ONE place in the whole agent surface — a lookup inside
 * `pay_expense` to find a bill to settle — so a document nobody had booked could be paid and never
 * listed.
 *
 * Three questions, because they are three different answers and conflating them is how "we have
 * none" and "we never connected" become the same sentence:
 *   • `status`    — is myDATA connected at all, when did it last sync, how much is sitting there
 *   • `suppliers` — who has filed against us, how much, how much still unfiled (with the CRM link)
 *   • `documents` — the documents themselves
 *
 * The first two are DERIVED IN SQL and read, not re-derived: `workspace_inbound_status` and
 * `inbound_issuers_summary` are what the Finance page's own supplier inbox reads, so the agent and
 * the screen cannot disagree about how many documents a supplier has sent.
 */
export const createMydataExpensesTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  /**
   * The text of THIS turn, from the user's side. The feed opens only when the request names it —
   * see `mydata-intent.ts` for why this is a gate and not a line in the description.
   */
  turnText: string,
  /** A quick-start click IS the explicit request; it names the feed on the button. */
  explicitlyRequested: boolean,
  onChunk?: (c: any) => void,
) =>
  tool(async ({ action, booked, issuer, from, to, limit }: {
    action?: 'documents' | 'suppliers' | 'status';
    booked?: 'all' | 'only_unbooked' | 'only_booked';
    issuer?: string; from?: string; to?: string; limit?: number;
  }) => {
    const denied = await moduleGate(workspaceId, 'sales-finance');
    if (denied) return denied;
    const sb = svc();
    const act = action ?? 'documents';

    // FAIL CLOSED on the wrong table. `status` is exempt — it returns no expense data, only
    // whether the integration is connected, and the model uses it as a preamble.
    if (act !== 'status' && !explicitlyRequested && !mentionsMyDataFeed(turnText)) {
      return JSON.stringify({
        success: false,
        error: 'This request did not ask for the myDATA / ΑΑΔΕ feed, so this tool does not apply. '
          + 'Expenses means the ones recorded in our own books — use list_recent_expenses '
          + '(its `source` parameter filters to the ones that originally came from myDATA). '
          + 'Only reach for the feed when the person names myDATA / ΑΑΔΕ / myAADE or the expenses inbox.',
      });
    }

    try {
      if (act === 'status') {
        // As the USER, not the service role — see `userClient`. Read through the service client
        // this answers "not configured" for every workspace, forever, and reads like data.
        const { data, error } = await userClient(jwt).rpc('workspace_inbound_status', { p_workspace_id: workspaceId });
        if (error) throw error;
        if (!data) {
          // The RPC yields no row to a caller who is not a finance manager. That is a permission
          // answer, and saying "not connected" instead would be a lie about the integration.
          return JSON.stringify({
            success: false,
            error: 'Only a workspace owner or admin can see the myDATA connection status.',
          });
        }
        onChunk?.({ type: 'mydata_inbound_status', data });
        return JSON.stringify({ success: true, status: data });
      }

      if (act === 'suppliers') {
        const { data, error } = await sb.rpc('inbound_issuers_summary', { p_workspace_id: workspaceId });
        if (error) throw error;
        let rows = (data ?? []) as any[];
        if (issuer) {
          const q = issuer.trim().toLowerCase();
          rows = rows.filter((r) =>
            String(r.issuer_name ?? '').toLowerCase().includes(q)
            || String(r.crm_company_name ?? '').toLowerCase().includes(q)
            || String(r.issuer_vat ?? '').includes(q));
        }
        // Reshaped so the columns the card picks are the ones worth reading — it takes the first
        // seven scalar keys, and the RPC's own order leads with the ΑΦΜ and buries the totals.
        const suppliers = rows.slice(0, Math.min(Math.max(limit ?? 25, 1), 200)).map((r) => ({
          crm_company_id: r.crm_company_id ?? null,
          issuer_name: r.issuer_name ?? r.crm_company_name ?? null,
          issuer_vat: r.issuer_vat,
          crm_company_name: r.crm_company_name ?? null,
          documents: r.docs,
          unfiled: r.unfiled,
          in_books: r.in_books,
          total_gross: r.total_gross,
          currency: r.currency,
          first_issue_date: r.first_issue_date,
          last_issue_date: r.last_issue_date,
        }));
        onChunk?.({ type: 'mydata_expense_suppliers', data: { count: rows.length, suppliers } });
        return JSON.stringify({ success: true, count: rows.length, suppliers });
      }

      // ── documents ──
      let q = sb.from('inbound_documents')
        .select('id, issue_date, issuer_vat, issuer_name, series, aa, doc_type, currency, total_net, total_vat, total_gross, mark, status, created_supplier_bill_id')
        .eq('workspace_id', workspaceId)
        .order('issue_date', { ascending: false, nullsFirst: false })
        .limit(Math.min(Math.max(limit ?? 25, 1), 200));
      // "Not yet in our books" is the operator's real question far more often than "everything
      // ΑΑΔΕ ever sent" — but it is asked for, never assumed.
      if (booked === 'only_unbooked') q = q.is('created_supplier_bill_id', null);
      if (booked === 'only_booked') q = q.not('created_supplier_bill_id', 'is', null);
      if (from) q = q.gte('issue_date', from);
      if (to) q = q.lte('issue_date', to);
      if (issuer) {
        const t = issuer.trim();
        // An ΑΦΜ is digits; anything else is a name. Matching a name against the VAT column would
        // silently return nothing rather than saying it could not find them.
        q = /^[0-9]{6,}$/.test(t) ? q.eq('issuer_vat', t) : q.ilike('issuer_name', `%${t}%`);
      }
      const { data, error } = await q;
      if (error) throw error;

      // Which CRM company each ΑΦΜ is. Read from `inbound_issuers_summary` rather than matched
      // here: that RPC already owns the rule (`crm_vat_norm(issuer_vat) = crm_companies.vat_norm`,
      // oldest first) and the supplier list, the document peek and this table must not each hold
      // their own idea of who an ΑΦΜ belongs to. One call for the whole workspace, not one per row.
      const crmByVat = new Map<string, { id: string; name: string | null }>();
      try {
        const { data: issuers } = await sb.rpc('inbound_issuers_summary', { p_workspace_id: workspaceId });
        for (const i of (issuers ?? []) as any[]) {
          if (i.issuer_vat && i.crm_company_id) {
            crmByVat.set(String(i.issuer_vat), { id: i.crm_company_id, name: i.crm_company_name ?? null });
          }
        }
      } catch { /* No CRM link is a missing link, not a missing document. */ }

      const documents = (data ?? []).map((d: any) => {
        const crm = d.issuer_vat ? crmByVat.get(String(d.issuer_vat)) : undefined;
        return {
          id: d.id,
          issuer_company_id: crm?.id ?? null,
          // ΑΑΔΕ identifies the issuer by ΑΦΜ only and never sends a name (measured: of 1,146
          // unnamed documents, zero carried a <name> tag), so the CRM name is the fallback.
          document: [d.series, d.aa].filter(Boolean).join(' ') || d.mark || '—',
          issuer_name: d.issuer_name ?? crm?.name ?? null,
          issuer_vat: d.issuer_vat,
          issued_at: d.issue_date,
          total_gross: d.total_gross,
          currency: d.currency,
          // The reader's question is "is this in our books yet"; `created_supplier_bill_id` answers
          // it and is hidden from the table as a join key, so the answer is stated as a value too.
          booked: d.created_supplier_bill_id ? 'booked' : 'not booked',
          doc_type: d.doc_type,
          mark: d.mark,
          total_net: d.total_net,
          total_vat: d.total_vat,
          created_supplier_bill_id: d.created_supplier_bill_id,
        };
      });

      // A count over the whole feed, not over the page — "25 documents" under a 25-row limit is a
      // number that means nothing, and this feed is thousands of rows deep.
      let total: number | null = null;
      try {
        let c = sb.from('inbound_documents').select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId);
        if (booked === 'only_unbooked') c = c.is('created_supplier_bill_id', null);
        if (booked === 'only_booked') c = c.not('created_supplier_bill_id', 'is', null);
        if (from) c = c.gte('issue_date', from);
        if (to) c = c.lte('issue_date', to);
        const { count } = await c;
        total = count ?? null;
      } catch { total = null; }

      onChunk?.({
        type: 'mydata_expense_documents',
        data: { count: documents.length, total_matching: total, booked: booked ?? 'all', documents },
      });
      return JSON.stringify({ success: true, count: documents.length, total_matching: total, documents });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not read the myDATA expenses feed' });
    }
  }, {
    name: 'list_mydata_expenses',
    description:
      'ONLY when the request explicitly names myDATA / ΑΑΔΕ / myAADE (or "the expenses inbox", '
      + '"what suppliers have filed against us"). For every other question about expenses — '
      + '"our expenses", "recent expenses", "expenses by supplier", "unpaid expenses", "what did we '
      + 'spend" — use list_recent_expenses instead; this tool will REFUSE those. '
      + 'What it returns: the ΑΑΔΕ feed itself — documents suppliers filed against us, most of which '
      + 'have never been booked into our books, so it is a DIFFERENT and far larger set than our own '
      + 'expenses. action: "documents" (the documents; filter by booked/issuer/date), "suppliers" '
      + '(who has filed against us, totals, how much is still unfiled), "status" (is myDATA connected '
      + '— so "nothing here" and "never connected" are different answers). 0 credits.',
    schema: z.object({
      action: z.enum(['documents', 'suppliers', 'status']).optional()
        .describe('What to return. Default "documents".'),
      booked: z.enum(['all', 'only_unbooked', 'only_booked']).optional()
        .describe('Whether the document has been turned into an expense in our books yet. Default all.'),
      issuer: z.string().optional().describe('Supplier name (partial) or their ΑΦΜ / VAT number.'),
      from: z.string().optional().describe('Earliest issue date, YYYY-MM-DD.'),
      to: z.string().optional().describe('Latest issue date, YYYY-MM-DD.'),
      limit: z.number().optional().describe('How many to return (default 25, max 200)'),
    }),
  });
