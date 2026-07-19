/**
 * Expense Tools — agent-chat surface for business operating expenses (rent, utilities, fees…).
 *
 * Mirrors the Finance "Add expense" page flow: an expense is a categorized supplier bill (the
 * canonical spend record that feeds Payables/AP + P&L per category). Payee is required by the
 * DB (supplier_bills CHECK). Tools:
 *   - record_expense        — create a categorized expense bill (optionally paid now)
 *   - list_recent_expenses  — read the workspace's recent expense bills
 *
 * All writes are scoped to the caller's workspace_id (resolved upstream by agent-chat).
 * Category + payee are resolved by name (find-or-create). record_payment_fx settles the
 * "paid now" case; its assert_workspace_member is a no-op under the service context.
 */

import { computeExpenseSplit } from '../finance/expense-math.ts';

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
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
    .insert({ workspace_id: workspaceId, name: name.trim(), is_supplier: true }).select('id, name').single();
  if (ins.error) throw ins.error;
  return { id: ins.data.id, name: ins.data.name };
}

// ───────────────────────────── record_expense ─────────────────────────────
export const createRecordExpenseTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ amount, category, payee, description, vat_amount, currency, expense_date, paid }: {
    amount: number; category: string; payee: string; description?: string;
    vat_amount?: number; currency?: string; expense_date?: string; paid?: boolean;
  }) => {
    try {
      // Validation + net/VAT/total split — pure, shared with tests/unit/expenseMath.test.ts.
      const split = computeExpenseSplit({ amount, vat_amount, category, payee, currency });
      if (!split.ok) return JSON.stringify({ success: false, error: split.error });
      const { total, vat, net, currency: cur } = split;
      const issued = expense_date || new Date().toISOString().slice(0, 10);

      const cat = await resolveCategory(workspaceId, category);
      const pay = await resolvePayee(workspaceId, payee);

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
      }).select('id').single();
      if (billIns.error) throw billIns.error;
      const billId = billIns.data.id;

      let paymentId: string | null = null;
      if (paid && total > 0) {
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
      }

      onChunk?.({ type: 'expense_recorded', data: { bill_id: billId, category: cat.name, payee: pay.name, total, currency: cur, paid: Boolean(paid) } });
      return JSON.stringify({
        success: true, bill_id: billId, payment_id: paymentId,
        category: cat.name, payee: pay.name, total, vat, net, currency: cur,
        status: paid ? 'paid' : 'payable',
        message: paid
          ? `Recorded ${total} ${cur} expense to ${pay.name} (${cat.name}) and marked it paid.`
          : `Recorded ${total} ${cur} expense to ${pay.name} (${cat.name}) as an open payable in AP.`,
      });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not record expense' });
    }
  }, {
    name: 'record_expense',
    description: 'Record a business operating expense (rent, utilities, fees…) as a categorized supplier bill. Creates the category and payee by name if they do not exist. Leave it as an open payable (default) or mark it paid. Use when the user says e.g. "record 500 euro rent to Acme for June" or "log the electricity bill, paid".',
    schema: z.object({
      amount: z.number().describe('Total amount including VAT'),
      category: z.string().describe('Expense category, e.g. Rent, Utilities, Insurance (created if new)'),
      payee: z.string().describe('Supplier / payee name, e.g. landlord or utility company (created if new)'),
      description: z.string().optional().describe('Short description, e.g. "Office rent — June 2026"'),
      vat_amount: z.number().optional().describe('VAT portion of the total (default 0)'),
      currency: z.string().optional().describe('ISO currency (default EUR)'),
      expense_date: z.string().optional().describe('YYYY-MM-DD (defaults to today)'),
      paid: z.boolean().optional().describe('true = also record the payment now (settled); false/omitted = leave as an open payable'),
    }),
  });

// ───────────────────────────── list_recent_expenses ─────────────────────────────
export const createListExpensesTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ limit }: { limit?: number }) => {
    try {
      const sb = svc();
      const { data, error } = await sb.from('supplier_bills')
        .select('id, supplier_bill_number, total, amount_due, currency, status, issued_at, category_id, notes')
        .eq('workspace_id', workspaceId)
        .order('issued_at', { ascending: false, nullsFirst: false })
        .limit(Math.min(Math.max(limit ?? 15, 1), 50));
      if (error) throw error;
      onChunk?.({ type: 'expenses_list', data: { count: data?.length || 0 } });
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
