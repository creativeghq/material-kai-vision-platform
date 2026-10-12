/** Finance Tools — agent-chat READ surface for invoices + customer balances. */

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
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MODULE_SLUG = 'sales-finance';

// Invoice statuses that count as "owed" for the unpaid filter.
const UNPAID_STATUSES = ['issued', 'partially_paid', 'overdue', 'sent'];

import { serviceClient as svcClient } from '../supabase-client.ts';
import { attachPartyNames } from './record-labels.ts';
import { roleGate } from './module-gate.ts';

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStartMonthsAgo = (n: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1)).toISOString().slice(0, 10);
};
/** User-scoped client so RLS + membership-asserting RPCs behave exactly as on the page. */
function userClient(jwt: string | undefined) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
  });
}

async function moduleReady(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = svcClient();
    const { data: mod } = await sb.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
    if (!mod?.enabled) return { ok: false, error: 'The Finance module is not enabled on this platform.' };
    if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
    const { data: entitled } = await sb.rpc('is_workspace_entitled', { p_workspace_id: workspaceId, p_module_slug: MODULE_SLUG });
    if (entitled !== true) return { ok: false, error: 'This workspace has not activated Finance. Enable it under Profile → Modules.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Finance availability check failed: ${(e as Error).message}` };
  }
}

/** Resolve a customer company by explicit id or fuzzy name (workspace-scoped via RLS). */
async function resolveCompany(sb: ReturnType<typeof userClient>, workspaceId: string, companyId?: string, name?: string) {
  if (companyId) {
    const { data } = await sb.from('crm_companies').select('id, name').eq('id', companyId).eq('workspace_id', workspaceId).maybeSingle();
    return data;
  }
  if (name) {
    const { data } = await sb.from('crm_companies').select('id, name').eq('workspace_id', workspaceId).ilike('name', `%${name}%`).limit(1).maybeSingle();
    return data;
  }
  return null;
}

export const createManageFinanceTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, customer_company_id, customer_name, unpaid_only, limit = 20, invoice_id, direction, confirm, order_id, order_type, search, from_date, to_date }) => {
      const gate = await moduleReady(workspaceId);
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });
      const sb = userClient(jwt);

      if (action === 'issue_invoice') {
        if (!invoice_id) return JSON.stringify({ success: false, error: 'issue_invoice needs an invoice_id (a draft invoice).' });
        // Load + validate the draft in-workspace (RLS via the user client).
        const { data: inv } = await sb
          .from('invoices')
          // There is no `invoice_number` column. `internal_number` is NOT NULL and always
          // present; `legal_number` is assigned only once the invoice is issued to ΑΑΔΕ.
          // Naming the phantom column made PostgREST reject the whole select, so `inv` was
          // null and this tool answered "invoice not found in this workspace" for EVERY
          // invoice — blaming the user's data for a query bug.
          .select('id, legal_number, internal_number, status, total, currency')
          .eq('id', invoice_id).eq('workspace_id', workspaceId).maybeSingle();
        if (!inv) return JSON.stringify({ success: false, error: 'invoice not found in this workspace' });
        if (inv.status !== 'draft') return JSON.stringify({ success: false, error: `only draft invoices can be issued (this one is "${inv.status}")` });

        // HUMAN-IN-THE-LOOP GATE (invariant #9): preview instead of mutating until confirmed.
        if (confirm !== true) {
          onChunk?.({
            type: 'action_confirmation',
            tool: 'manage_finance',
            input: { action: 'issue_invoice', invoice_id },
            title: 'Issue this invoice?',
            summary: `Issue invoice ${inv.legal_number || inv.internal_number || '(draft)'} for ${inv.total ?? '—'} ${inv.currency || ''} and transmit it to ΑΑΔΕ / myDATA. This is a legal fiscal action and cannot be undone.`,
            danger: true,
            toolkit_id: 'finance',
            timestamp: Date.now(),
          });
          return JSON.stringify({ success: true, awaiting_confirmation: true, message: 'Awaiting the user\'s approval to issue this invoice. Do not retry — the user will approve or decline.' });
        }

        // Confirmed → issue + fiscal-transmit via the trusted server contract (numbering/tax server-side).
        const { data, error } = await sb.functions.invoke('finance-issue-invoice', {
          body: { invoice_id, submit_fiscal: true },
        });
        if (error) return JSON.stringify({ success: false, error: (error as any)?.message || 'issue failed' });
        onChunk?.({ type: 'finance_invoice_issued', invoice_id, result: data, timestamp: Date.now() });
        return JSON.stringify({ success: true, issued: true, invoice_id, result: data });
      }

      if (action === 'list_invoices') {
        let company: { id: string; name: string } | null = null;
        if (customer_company_id || customer_name) {
          company = await resolveCompany(sb, workspaceId, customer_company_id, customer_name);
          if (!company) return JSON.stringify({ success: false, error: 'customer not found in this workspace' });
        }
        // `invoice_number` does not exist — see the note in issue_invoice above. This select
        // was rejected outright, so list_invoices returned an error for every call.
        let q = sb.from('invoices').select('id, legal_number, internal_number, status, total, currency, issued_at, due_at, customer_company_id, customer_contact_id')
          .eq('workspace_id', workspaceId)
          .order('issued_at', { ascending: false, nullsFirst: false })
          .limit(Math.min(limit, 50));
        if (company) q = q.eq('customer_company_id', company.id);
        if (unpaid_only) q = q.in('status', UNPAID_STATUSES);
        const { data, error } = await q;
        if (error) return JSON.stringify({ success: false, error: error.message });
        // The customer id was already here; the NAME was not, so the card had a column of nothing
        // to link and the reader had a list of invoices with no counterparty on it.
        const invoices = await attachPartyNames(sb, data ?? [], [
          { idField: 'customer_company_id', nameField: 'customer_name' },
          { idField: 'customer_contact_id', nameField: 'customer_name', table: 'crm_contacts' },
        ]);
        onChunk?.({ type: 'finance_invoices_list', workspace_id: workspaceId, customer: company, unpaid_only: !!unpaid_only, invoices, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: invoices.length, invoices: invoices.slice(0, 15) });
      }

      if (action === 'list_orders') {
        let company: { id: string; name: string } | null = null;
        if (customer_company_id || customer_name) {
          company = await resolveCompany(sb, workspaceId, customer_company_id, customer_name);
          if (!company) return JSON.stringify({ success: false, error: 'customer not found in this workspace' });
        }
        const { data, error } = await sb.rpc('search_orders', {
          p_workspace_id: workspaceId, p_order_type: order_type ?? null, p_status: null,
          p_company_id: company?.id ?? null, p_contact_id: null, p_project_id: null, p_search: search ?? null,
          p_limit: Math.min(limit, 50), p_offset: 0, p_created_from: from_date ?? null, p_created_to: to_date ?? null,
          p_total_min: null, p_total_max: null, p_currency: null, p_payment_status: null,
        });
        if (error) return JSON.stringify({ success: false, error: error.message });
        const found = ((data ?? []) as Array<{ order_row: Record<string, any>; party_name: string | null }>);
        const ids = found.map((r) => r.order_row.id as string);
        const { data: settlements, error: sErr } = ids.length
          ? await sb.rpc('get_order_settlements', { p_order_ids: ids })
          : { data: [], error: null };
        if (sErr) return JSON.stringify({ success: false, error: sErr.message });
        const byOrder = new Map(((settlements ?? []) as Array<Record<string, any>>).map((s) => [s.order_id, s]));
        const orders = found.map(({ order_row: o, party_name }) => {
          const s = byOrder.get(o.id);
          return {
            id: o.id, order_number: o.order_number, order_type: o.order_type, status: o.status,
            total: o.total, currency: o.currency, created_at: o.created_at, project_id: o.project_id,
            customer_company_id: o.customer_company_id, supplier_company_id: o.supplier_company_id,
            party_name,
            settled: s?.settled ?? null, outstanding: s?.outstanding ?? null, payment_status: s?.payment_status ?? null,
          };
        });
        onChunk?.({ type: 'finance_orders_list', workspace_id: workspaceId, customer: company, orders, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: orders.length, orders: orders.slice(0, 15) });
      }

      if (action === 'list_payments') {
        let q = sb.from('payments').select('id, reference, amount, currency, direction, method, paid_at, counterparty_company_id, counterparty_contact_id, counterparty_name, order_id')
          .eq('workspace_id', workspaceId)
          .order('paid_at', { ascending: false, nullsFirst: false })
          .limit(Math.min(limit, 50));
        if (direction) q = q.eq('direction', direction);
        const { data, error } = await q;
        if (error) return JSON.stringify({ success: false, error: error.message });
        // "Who was this paid to" is the whole point of a payment row, and the select answered it
        // for nobody: a list of amounts and dates with no counterparty at all.
        const named = await attachPartyNames(sb, data ?? [], [
          { idField: 'counterparty_company_id', nameField: 'counterparty_name' },
          { idField: 'counterparty_contact_id', nameField: 'counterparty_name', table: 'crm_contacts' },
        ]);
        const paymentIds = named.map((p: Record<string, any>) => p.id as string);
        const { data: remainders, error: rErr } = paymentIds.length
          ? await sb.rpc('get_payment_remainders', { p_payment_ids: paymentIds })
          : { data: [], error: null };
        if (rErr) return JSON.stringify({ success: false, error: rErr.message });
        const byPayment = new Map(((remainders ?? []) as Array<Record<string, any>>).map((r) => [r.payment_id, r]));
        const payments = named.map((p: Record<string, any>) => ({
          ...p,
          allocated: byPayment.get(p.id)?.allocated ?? null,
          unallocated: byPayment.get(p.id)?.unallocated ?? null,
        }));
        onChunk?.({ type: 'finance_payments_list', workspace_id: workspaceId, direction: direction || 'all', payments, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: payments.length, payments: payments.slice(0, 15) });
      }

      if (action === 'customer_balance') {
        const company = await resolveCompany(sb, workspaceId, customer_company_id, customer_name);
        if (!company) return JSON.stringify({ success: false, error: 'Provide a customer_company_id or customer_name that exists in this workspace.' });
        const { data, error } = await sb.rpc('get_customer_open_balance', {
          p_workspace_id: workspaceId, p_company_id: company.id, p_contact_id: null,
        });
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'customer_balance_result', workspace_id: workspaceId, customer: company, balance: data, timestamp: Date.now() });
        return JSON.stringify({ success: true, customer: company, balance: data });
      }

      if (action === 'worklist') {
        // The whole verdict — state, action and severity — is derived by get_order_worklist. The
        // model reports it; it never decides what an order is waiting on.
        const { data, error } = await sb.rpc('get_order_worklist', {
          p_workspace_id: workspaceId, p_limit: limit,
        });
        if (error) return JSON.stringify({ success: false, error: error.message });
        const rows = (data as any[]) || [];
        onChunk?.({ type: 'finance_order_worklist', count: rows.length, items: rows, timestamp: Date.now() });
        return JSON.stringify({
          success: true,
          count: rows.length,
          // An empty list is a real answer here, not a missing one: orders with nothing
          // outstanding are omitted by the derivation.
          note: rows.length === 0 ? 'Nothing on the order book is waiting on us.' : undefined,
          items: rows.map((r) => ({
            order_id: r.order_id, order_number: r.order_number, customer: r.customer_name,
            total: r.total, currency: r.currency, age_days: r.age_days,
            state: r.state, next_action: r.next_action, detail: r.detail, severity: r.severity,
          })),
        });
      }

      if (action === 'monthly_pnl') {
        const denied = await roleGate(sb, workspaceId, 'is_workspace_sell_side');
        if (denied) return denied;
        const { data, error } = await sb.rpc('get_monthly_pnl', {
          p_workspace_id: workspaceId, p_from: from_date ?? monthStartMonthsAgo(11),
        });
        if (error) return JSON.stringify({ success: false, error: error.message });
        const months = (data ?? []) as Array<Record<string, unknown>>;
        onChunk?.({ type: 'finance_monthly_pnl', months, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: months.length, months });
      }

      if (action === 'profit_drawdown') {
        const denied = await roleGate(sb, workspaceId, 'is_workspace_finance_viewer');
        if (denied) return denied;
        const { data, error } = await sb.rpc('get_profit_drawdown', {
          p_workspace_id: workspaceId, p_from: from_date ?? monthStartMonthsAgo(11), p_to: to_date ?? todayIso(),
        });
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'finance_profit_drawdown', drawdown: data, timestamp: Date.now() });
        return JSON.stringify({ success: true, drawdown: data });
      }

      if (action === 'order_profit') {
        if (!order_id) return JSON.stringify({ success: false, error: 'order_profit needs an order_id (from list_orders).' });
        const denied = await roleGate(sb, workspaceId, 'is_workspace_sell_side');
        if (denied) return denied;
        const { data: own } = await sb.from('orders').select('id').eq('id', order_id).eq('workspace_id', workspaceId).maybeSingle();
        if (!own) return JSON.stringify({ success: false, error: 'order not found in this workspace' });
        const [pos, lines] = await Promise.all([
          sb.rpc('get_order_profit_positions', { p_order_ids: [order_id] }),
          sb.rpc('get_order_item_costs', { p_order_ids: [order_id] }),
        ]);
        if (pos.error || lines.error) return JSON.stringify({ success: false, error: (pos.error ?? lines.error)!.message });
        const position = ((pos.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
        if (!position) return JSON.stringify({ success: false, error: 'order_profit covers sales orders only — this is a purchase order.' });
        onChunk?.({ type: 'finance_order_profit', order_id, position, line_costs: lines.data ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, order_id, position, line_costs: lines.data ?? [] });
      }

      if (action === 'invoice_profit') {
        if (!invoice_id) return JSON.stringify({ success: false, error: 'invoice_profit needs an invoice_id (from list_invoices).' });
        const denied = await roleGate(sb, workspaceId, 'is_workspace_sell_side');
        if (denied) return denied;
        const { data, error } = await sb.rpc('get_invoice_item_costs', { p_invoice_ids: [invoice_id] });
        if (error) return JSON.stringify({ success: false, error: error.message });
        const lines = (data ?? []) as Array<Record<string, unknown>>;
        onChunk?.({ type: 'finance_invoice_profit', invoice_id, lines, timestamp: Date.now() });
        return JSON.stringify({ success: true, invoice_id, count: lines.length, lines });
      }

      if (action === 'order_customs') {
        if (!order_id) return JSON.stringify({ success: false, error: 'order_customs needs an order_id (from list_orders).' });
        const { data, error } = await sb.rpc('get_order_customs_preview', { p_order_id: order_id });
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'finance_order_customs', order_id, preview: data, timestamp: Date.now() });
        return JSON.stringify({ success: true, order_id, preview: data });
      }

      if (action === 'buyer_limits' || action === 'party_profit') {
        const company = await resolveCompany(sb, workspaceId, customer_company_id, customer_name);
        if (!company) return JSON.stringify({ success: false, error: 'Provide a customer_company_id or customer_name that exists in this workspace.' });
        if (action === 'buyer_limits') {
          const denied = await roleGate(sb, workspaceId, 'is_workspace_sell_side');
          if (denied) return denied;
          const { data, error } = await sb.rpc('get_buyer_finance_limits', {
            p_workspace_id: workspaceId, p_company_id: company.id, p_contact_id: null,
          });
          if (error) return JSON.stringify({ success: false, error: error.message });
          onChunk?.({ type: 'finance_buyer_limits', customer: company, limits: data, timestamp: Date.now() });
          return JSON.stringify({ success: true, customer: company, limits: data });
        }
        const denied = await roleGate(sb, workspaceId, 'is_workspace_finance_viewer');
        if (denied) return denied;
        const { data, error } = await sb.rpc('get_party_profit_position', {
          p_workspace_id: workspaceId, p_company_id: company.id, p_contact_id: null,
        });
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'finance_party_profit', customer: company, position: data, timestamp: Date.now() });
        return JSON.stringify({ success: true, customer: company, position: data });
      }

      if (action === 'supplier_inbound_orders') {
        const { data, error } = await sb.rpc('get_supplier_inbound_orders', { p_workspace_id: workspaceId });
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'finance_supplier_inbound_orders', result: data, timestamp: Date.now() });
        return JSON.stringify({ success: true, result: data });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_finance',
      description:
        'Finance documents: list_invoices (recent / per-customer / unpaid), list_orders (orders, filterable by '
        + 'customer, order_type, search text and created date, each with settled / outstanding / payment status '
        + 'already derived), list_payments (money in/out, each with how much is still unallocated), '
        + 'customer_balance ("what does X owe?"), worklist ("what needs doing" — '
        + 'every sales order waiting on something, with the blocking state and the next action), '
        + 'monthly_pnl ("how did we do this month" — revenue, cost of goods and gross margin per month from from_date), '
        + 'profit_drawdown (profit claimed vs drawn over from_date..to_date), order_profit (revenue, cost and margin '
        + 'of one sales order plus its line costs — order_id), invoice_profit (cost and margin per line of one '
        + 'invoice — invoice_id), order_customs (TARIC sub-headings and the low-value customs duty estimate for '
        + 'one order — order_id), buyer_limits (a customer\'s credit limit, exposure and minimum order — check it '
        + 'BEFORE drafting a quote or order for them), party_profit (margin earned on one customer), '
        + 'supplier_inbound_orders (for a claimed supplier workspace: what buyers on the platform ordered from us), and issue_invoice (issue a ' +
        'DRAFT invoice + transmit to ΑΑΔΕ/myDATA). issue_invoice is a legal fiscal action — it ALWAYS asks ' +
        'the user to Approve/Decline first (never pass confirm:true yourself; the UI sets it when the user ' +
        'approves). Every figure is derived by the platform — report it, never recompute it. Reads are 0 credits.',
      schema: z.object({
        action: z.enum([
          'list_invoices', 'list_orders', 'list_payments', 'customer_balance', 'worklist', 'issue_invoice',
          'monthly_pnl', 'profit_drawdown', 'order_profit', 'invoice_profit', 'order_customs',
          'buyer_limits', 'party_profit', 'supplier_inbound_orders',
        ]).default('list_invoices'),
        customer_company_id: z.string().optional().describe('CRM company UUID (preferred).'),
        customer_name: z.string().optional().describe('Customer company name to fuzzy-match if you don\'t have the id.'),
        unpaid_only: z.boolean().optional().describe('list_invoices: only invoices still owed (issued/partially paid/overdue).'),
        direction: z.enum(['in', 'out']).optional().describe('list_payments: filter money received (in) vs paid out (out).'),
        limit: z.number().int().min(1).max(50).default(20),
        invoice_id: z.string().optional().describe('issue_invoice: the DRAFT invoice UUID to issue. invoice_profit: the invoice UUID.'),
        order_id: z.string().optional().describe('order_profit / order_customs: the order UUID (from list_orders).'),
        order_type: z.string().optional().describe('list_orders: "sales" or "purchase". Omit for both.'),
        search: z.string().optional().describe('list_orders: free-text search over order number and party name.'),
        from_date: z.string().optional().describe('YYYY-MM-DD start for list_orders, monthly_pnl, profit_drawdown (default: 11 months back, first of the month).'),
        to_date: z.string().optional().describe('YYYY-MM-DD end for list_orders, profit_drawdown (default today).'),
        confirm: z.boolean().optional().describe('Do NOT set this — the Approve/Decline card sets confirm:true when the user approves.'),
      }),
    },
  );
};
