/**
 * Trip Card Tools — agent-chat surface for sales-team expense reports.
 *
 * Tools (all 0 credits, DB-only):
 *   - create_trip_card  — start a new trip card (owned by the calling user)
 *   - add_trip_expense  — add a day expense line to a draft card (+ optional receipt later in the UI)
 *   - list_trip_cards   — list the caller's own trip cards
 *   - submit_trip_card  — submit a draft card to finance for approval
 *
 * Ownership is enforced explicitly (service-role bypasses RLS): every read/write
 * is scoped to user_id = the authenticated agent user. Module-gated on
 * `sales-finance`. Finance review (approve/reject) is intentionally NOT exposed
 * to the agent — that happens in the Finance UI.
 */

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

const MODULE_SLUG = 'sales-finance';
const CATEGORIES = ['transport', 'fuel', 'hotel', 'meals', 'parking', 'tolls', 'supplies', 'other'];

function svc() { return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); }

async function moduleEnabled(): Promise<boolean> {
  try {
    const { data } = await svc().from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
    return Boolean((data as any)?.enabled);
  } catch { return false; }
}
const disabledErr = () => JSON.stringify({ success: false, error: 'Finance module is disabled — ask an admin to enable it in /admin/modules.' });

async function resolveCard(userId: string, workspaceId: string, cardId?: string, cardTitle?: string): Promise<any | null> {
  const sb = svc();
  let q = sb.from('trip_expense_reports').select('*').eq('user_id', userId).eq('workspace_id', workspaceId);
  if (cardId) q = q.eq('id', cardId);
  else if (cardTitle) q = q.ilike('title', `%${cardTitle}%`).order('created_at', { ascending: false }).limit(1);
  else q = q.order('created_at', { ascending: false }).limit(1);
  const { data } = await q;
  return (data && data[0]) || null;
}

// ───────────────────────────── create_trip_card ─────────────────────────────
const CARD_TYPES = ['trip', 'monthly', 'other'];

export const createCreateTripCardTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ title, card_type, destination, purpose, trip_start, trip_end, currency }: {
    title: string; card_type?: string; destination?: string; purpose?: string; trip_start?: string; trip_end?: string; currency?: string;
  }) => {
    if (!await moduleEnabled()) return disabledErr();
    try {
      const ct = CARD_TYPES.includes((card_type || '').toLowerCase()) ? card_type!.toLowerCase() : 'trip';
      const { data, error } = await svc().from('trip_expense_reports').insert({
        workspace_id: workspaceId, user_id: userId, card_type: ct, title,
        destination: ct === 'trip' ? (destination ?? null) : null, purpose: purpose ?? null,
        trip_start: trip_start ?? null, trip_end: trip_end ?? null, currency: currency ?? 'EUR',
      }).select('*').single();
      if (error) throw error;
      onChunk?.({ type: 'trip_card_created', data: { id: data.id, title: data.title, card_type: data.card_type } });
      return JSON.stringify({ success: true, card_id: data.id, card_type: data.card_type, title: data.title, status: data.status, message: 'Expense card created. Add expenses, then submit for approval.' });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not create expense card' });
    }
  }, {
    name: 'create_trip_card',
    description: 'Create a new expense card for the current user — a sales trip (default), a month of expenses (card_type="monthly"), or other. Returns the card id to add expenses to.',
    schema: z.object({
      title: z.string().describe('Short title, e.g. "Athens client visits — June" or "June 2026 expenses"'),
      card_type: z.string().optional().describe('Card category: trip (default) | monthly | other'),
      destination: z.string().optional().describe('City / area visited (trip cards only)'),
      purpose: z.string().optional().describe('Reason / note'),
      trip_start: z.string().optional().describe('Start / period-from date YYYY-MM-DD'),
      trip_end: z.string().optional().describe('End / period-to date YYYY-MM-DD'),
      currency: z.string().optional().describe('ISO currency (default EUR)'),
    }),
  });

// ───────────────────────────── add_trip_expense ─────────────────────────────
export const createAddTripExpenseTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ card_id, card_title, amount, category, description, vendor, expense_date, currency, payment_method }: {
    card_id?: string; card_title?: string; amount: number; category?: string; description?: string;
    vendor?: string; expense_date?: string; currency?: string; payment_method?: string;
  }) => {
    if (!await moduleEnabled()) return disabledErr();
    try {
      const card = await resolveCard(userId, workspaceId, card_id, card_title);
      if (!card) return JSON.stringify({ success: false, error: 'No matching trip card found. Create one first or check the title.' });
      if (card.status !== 'draft') return JSON.stringify({ success: false, error: `Card "${card.title}" is ${card.status} and can no longer be edited.` });
      if (!(amount > 0)) return JSON.stringify({ success: false, error: 'Amount must be greater than zero.' });
      const cat = CATEGORIES.includes((category || '').toLowerCase()) ? category!.toLowerCase() : 'other';
      const { error } = await svc().from('trip_expense_items').insert({
        report_id: card.id, expense_date: expense_date || new Date().toISOString().slice(0, 10),
        category: cat, description: description ?? null, vendor: vendor ?? null,
        amount, currency: currency || card.currency || 'EUR', payment_method: payment_method || 'personal',
      });
      if (error) throw error;
      const { data: fresh } = await svc().from('trip_expense_reports').select('item_count, total_amount, currency').eq('id', card.id).single();
      onChunk?.({ type: 'trip_expense_added', data: { card_id: card.id } });
      return JSON.stringify({ success: true, card_id: card.id, item_count: fresh?.item_count, total: fresh?.total_amount, currency: fresh?.currency, message: 'Expense added. Attach the receipt in the Expense cards screen, then submit when done.' });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not add expense' });
    }
  }, {
    name: 'add_trip_expense',
    description: 'Add a single day expense line (transport/hotel/meals/etc.) to one of the user\'s DRAFT trip cards. Resolve the card by card_id or card_title; defaults to the most recent draft.',
    schema: z.object({
      card_id: z.string().optional().describe('Target card id (preferred)'),
      card_title: z.string().optional().describe('Or a fuzzy card title to match'),
      amount: z.number().describe('Expense amount'),
      category: z.string().optional().describe('One of: transport, fuel, hotel, meals, parking, tolls, supplies, other'),
      description: z.string().optional(),
      vendor: z.string().optional(),
      expense_date: z.string().optional().describe('YYYY-MM-DD (defaults to today)'),
      currency: z.string().optional(),
      payment_method: z.string().optional().describe('cash | card | personal | company_card | other'),
    }),
  });

// ───────────────────────────── list_trip_cards ─────────────────────────────
export const createListTripCardsTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ status, card_type }: { status?: string; card_type?: string }) => {
    if (!await moduleEnabled()) return disabledErr();
    try {
      let q = svc().from('trip_expense_reports').select('id, card_type, title, destination, status, item_count, total_amount, approved_amount, pending_amount, currency, created_at')
        .eq('user_id', userId).eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(25);
      if (status) q = q.eq('status', status);
      if (card_type) q = q.eq('card_type', card_type);
      const { data, error } = await q;
      if (error) throw error;
      onChunk?.({ type: 'trip_cards_list', data: { count: data?.length || 0 } });
      return JSON.stringify({ success: true, cards: data || [] });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not list trip cards' });
    }
  }, {
    name: 'list_trip_cards',
    description: 'List the current user\'s expense cards (trips, monthly, …) with their status and totals.',
    schema: z.object({
      status: z.string().optional().describe('Optional filter: draft | submitted | partially_approved | approved | rejected | reimbursed'),
      card_type: z.string().optional().describe('Optional filter: trip | monthly | other'),
    }),
  });

// ───────────────────────────── submit_trip_card ─────────────────────────────
export const createSubmitTripCardTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ card_id, card_title }: { card_id?: string; card_title?: string }) => {
    if (!await moduleEnabled()) return disabledErr();
    try {
      const card = await resolveCard(userId, workspaceId, card_id, card_title);
      if (!card) return JSON.stringify({ success: false, error: 'No matching trip card found.' });
      if (card.status !== 'draft') return JSON.stringify({ success: false, error: `Card "${card.title}" is already ${card.status}.` });
      if ((card.item_count || 0) < 1) return JSON.stringify({ success: false, error: 'Add at least one expense before submitting.' });
      // Service-role submit (the SQL RPC keys on auth.uid(), which is null here);
      // ownership is already enforced by resolveCard's user_id filter.
      const { error } = await svc().from('trip_expense_reports')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', card.id).eq('user_id', userId).eq('status', 'draft');
      if (error) throw error;
      // Notify finance reviewers (via Flows), mirroring the web submit path.
      try {
        const { emitFlowEvent } = await import('../flow-events.ts');
        const { data: reviewers } = await svc().from('workspace_members').select('user_id')
          .eq('workspace_id', workspaceId).in('role', ['owner', 'admin']);
        await emitFlowEvent('expense_card_submitted', {
          card_id: card.id,
          workspace_id: workspaceId,
          reviewer_ids: (reviewers || []).map((m: any) => m.user_id),
          type: 'expense_card_submitted',
          title: `Expense card submitted: ${card.title}`,
          body: 'An expense card is waiting for your review.',
          action_url: '/finance?tab=trip_cards',
        });
      } catch (_) { /* fire-and-forget */ }
      onChunk?.({ type: 'trip_card_submitted', data: { card_id: card.id } });
      return JSON.stringify({ success: true, card_id: card.id, status: 'submitted', message: `"${card.title}" submitted to finance for approval.` });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not submit trip card' });
    }
  }, {
    name: 'submit_trip_card',
    description: 'Submit one of the user\'s DRAFT trip cards to finance for approval. Resolve by card_id or card_title.',
    schema: z.object({
      card_id: z.string().optional(),
      card_title: z.string().optional(),
    }),
  });
