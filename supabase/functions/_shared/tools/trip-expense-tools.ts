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

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
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
export const createCreateTripCardTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ title, destination, purpose, trip_start, trip_end, currency }: {
    title: string; destination?: string; purpose?: string; trip_start?: string; trip_end?: string; currency?: string;
  }) => {
    if (!await moduleEnabled()) return disabledErr();
    try {
      const { data, error } = await svc().from('trip_expense_reports').insert({
        workspace_id: workspaceId, user_id: userId, title,
        destination: destination ?? null, purpose: purpose ?? null,
        trip_start: trip_start ?? null, trip_end: trip_end ?? null, currency: currency ?? 'EUR',
      }).select('*').single();
      if (error) throw error;
      onChunk?.({ type: 'trip_card_created', data: { id: data.id, title: data.title } });
      return JSON.stringify({ success: true, card_id: data.id, title: data.title, status: data.status, message: 'Trip card created. Add expenses, then submit for approval.' });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not create trip card' });
    }
  }, {
    name: 'create_trip_card',
    description: 'Create a new trip expense card (sales trip) for the current user. Returns the card id to add expenses to.',
    schema: z.object({
      title: z.string().describe('Short title, e.g. "Athens client visits — June"'),
      destination: z.string().optional().describe('City / area visited'),
      purpose: z.string().optional().describe('Reason for the trip'),
      trip_start: z.string().optional().describe('Start date YYYY-MM-DD'),
      trip_end: z.string().optional().describe('End date YYYY-MM-DD'),
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
      return JSON.stringify({ success: true, card_id: card.id, item_count: fresh?.item_count, total: fresh?.total_amount, currency: fresh?.currency, message: 'Expense added. Attach the receipt in the Trip cards screen, then submit when done.' });
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
  tool(async ({ status }: { status?: string }) => {
    if (!await moduleEnabled()) return disabledErr();
    try {
      let q = svc().from('trip_expense_reports').select('id, title, destination, status, item_count, total_amount, approved_amount, pending_amount, currency, created_at')
        .eq('user_id', userId).eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(25);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      onChunk?.({ type: 'trip_cards_list', data: { count: data?.length || 0 } });
      return JSON.stringify({ success: true, cards: data || [] });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Could not list trip cards' });
    }
  }, {
    name: 'list_trip_cards',
    description: 'List the current user\'s trip expense cards with their status and totals.',
    schema: z.object({ status: z.string().optional().describe('Optional filter: draft | submitted | partially_approved | approved | rejected | reimbursed') }),
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
