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
export const createListExpensesTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ limit }: { limit?: number }) => {
    const denied = await moduleGate(workspaceId, 'sales-finance');
    if (denied) return denied;
    try {
      const sb = svc();
      const { data, error } = await sb.from('supplier_bills')
        .select('id, supplier_bill_number, total, amount_due, currency, status, issued_at, category_id, notes')
        .eq('workspace_id', workspaceId)
        .order('issued_at', { ascending: false, nullsFirst: false })
        .limit(Math.min(Math.max(limit ?? 15, 1), 50));
      if (error) throw error;
      // Ship the rows in the chunk (not just a count) so the card renders line items, like the
      // finance-tools list chunks — a count-only chunk rendered an empty-looking card.
      onChunk?.({ type: 'expenses_list', data: { count: data?.length || 0, expenses: data || [] } });
      return JSON.stringify({ success: true, expenses: data || [] });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not list expenses' });
    }
  }, {
    name: 'list_recent_expenses',
    description: "List the workspace's recent recorded expenses / supplier bills with their status and amount due.",
    schema: z.object({
      limit: z.number().optional().describe('How many to return (default 15, max 50)'),
    }),
  });
