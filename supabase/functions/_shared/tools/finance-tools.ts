/**
 * Finance Tools — agent-chat READ surface for invoices + customer balances.
 *
 * ONE tool, actions:
 *   - list_invoices     — recent invoices (optionally for one customer / unpaid only)
 *   - customer_balance  — open A/R balance for a customer ("what does ACME owe?")
 *
 * READ-ONLY by design. Issuing an invoice is a legal/tax act with server-side numbering
 * (finance-issue-invoice + next_invoice_number) and MUST stay a deliberate action on the
 * Finance page — the agent does not create/issue invoices here. This delivers the high-value,
 * zero-risk half ("ask the agent about finance"); a confirmed draft-create tool can follow.
 *
 * Tenancy: reads run through a USER-JWT client so RLS scopes invoices to the workspace and the
 * membership-asserting `get_customer_open_balance` RPC passes (it needs auth.uid). Module gate
 * (`sales-finance` + entitlement) is checked via the service client. 0 credits.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODULE_SLUG = 'sales-finance';

// Invoice statuses that count as "owed" for the unpaid filter.
const UNPAID_STATUSES = ['issued', 'partially_paid', 'overdue', 'sent'];

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

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
    async ({ action, customer_company_id, customer_name, unpaid_only, limit = 20, invoice_id, direction, confirm }) => {
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
        onChunk?.({ type: 'finance_invoices_list', workspace_id: workspaceId, customer: company, unpaid_only: !!unpaid_only, invoices: data ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, count: (data ?? []).length, invoices: (data ?? []).slice(0, 15) });
      }

      if (action === 'list_orders') {
        let company: { id: string; name: string } | null = null;
        if (customer_company_id || customer_name) {
          company = await resolveCompany(sb, workspaceId, customer_company_id, customer_name);
          if (!company) return JSON.stringify({ success: false, error: 'customer not found in this workspace' });
        }
        let q = sb.from('orders').select('id, order_number, status, total, currency, created_at, customer_company_id')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(Math.min(limit, 50));
        if (company) q = q.eq('customer_company_id', company.id);
        const { data, error } = await q;
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'finance_orders_list', workspace_id: workspaceId, customer: company, orders: data ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, count: (data ?? []).length, orders: (data ?? []).slice(0, 15) });
      }

      if (action === 'list_payments') {
        let q = sb.from('payments').select('id, amount, currency, direction, method, paid_at, created_at')
          .eq('workspace_id', workspaceId)
          .order('paid_at', { ascending: false, nullsFirst: false })
          .limit(Math.min(limit, 50));
        if (direction) q = q.eq('direction', direction);
        const { data, error } = await q;
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'finance_payments_list', workspace_id: workspaceId, direction: direction || 'all', payments: data ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, count: (data ?? []).length, payments: (data ?? []).slice(0, 15) });
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

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_finance',
      description:
        'Finance documents: list_invoices (recent / per-customer / unpaid), list_orders (sales orders), ' +
        'list_payments (money in/out), customer_balance ("what does X owe?"), and issue_invoice (issue a ' +
        'DRAFT invoice + transmit to ΑΑΔΕ/myDATA). issue_invoice is a legal fiscal action — it ALWAYS asks ' +
        'the user to Approve/Decline first (never pass confirm:true yourself; the UI sets it when the user ' +
        'approves). Reads are 0 credits.',
      schema: z.object({
        action: z.enum(['list_invoices', 'list_orders', 'list_payments', 'customer_balance', 'issue_invoice']).default('list_invoices'),
        customer_company_id: z.string().optional().describe('CRM company UUID (preferred).'),
        customer_name: z.string().optional().describe('Customer company name to fuzzy-match if you don\'t have the id.'),
        unpaid_only: z.boolean().optional().describe('list_invoices: only invoices still owed (issued/partially paid/overdue).'),
        direction: z.enum(['in', 'out']).optional().describe('list_payments: filter money received (in) vs paid out (out).'),
        limit: z.number().int().min(1).max(50).default(20),
        invoice_id: z.string().optional().describe('issue_invoice: the DRAFT invoice UUID to issue.'),
        confirm: z.boolean().optional().describe('Do NOT set this — the Approve/Decline card sets confirm:true when the user approves.'),
      }),
    },
  );
};
