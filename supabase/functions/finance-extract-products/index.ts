// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { generateStructuredWithClaude, z } from '../_shared/ai-client.ts';

// Finance — AI extraction of clean, sellable product attributes from raw supplier
// expense lines (myDATA inbound docs). Used by the "Receive into warehouse" flow so an
// operator can turn a noisy supplier-invoice line into a proper catalog product +
// warehouse item (name, sku, unit, size, attributes) in one click.
//
// Cheapest model (Haiku 4.5). Credit-metered via debit_user_credits (refunded on hard
// failure); AI usage (tokens/model/cost) auto-logged to ai_usage_logs by the ai-client
// under task='expense_product_extraction'.
//
// Body: { workspace_id, lines: [{ description, quantity? }] }
// Out:  { suggestions: [{ index, name, sku, unit, size, attributes }], credits_used, balance }

const CREDIT_COST = 1;          // per analyze call (one batched Haiku request)
const MODEL = 'claude-haiku-4-5';

const SuggestionSchema = z.object({
  suggestions: z.array(z.object({
    index: z.number().int(),
    name: z.string(),
    sku: z.string().nullable(),
    unit: z.string().nullable(),
    size: z.string().nullable(),
    attributes: z.string().nullable(),
  })),
});

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(withApiLogging('finance-extract-products', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const auth = await authenticate(req, {
    requireUser: true,
    allowedRoles: ['admin', 'super_admin', 'owner', 'finance', 'sales'],
  });
  if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const workspaceId = body.workspace_id;
  const lines: { description?: string; quantity?: number }[] = Array.isArray(body.lines) ? body.lines : [];
  if (!workspaceId) throw new HttpError(400, 'workspace_id is required');
  if (lines.length === 0) return json({ suggestions: [] });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Credit debit — fail closed on insufficient balance.
  const { data: debit, error: debitErr } = await supabase.rpc('debit_user_credits', {
    p_user_id: auth.userId, p_amount: CREDIT_COST,
    p_operation_type: 'expense_product_extraction',
    p_description: `AI product extraction from ${lines.length} expense line(s)`,
  });
  const drow = Array.isArray(debit) ? debit[0] : debit;
  if (debitErr || !drow?.success) {
    return json({ error: 'insufficient_credits', balance: Number(drow?.new_balance ?? 0) }, 402);
  }

  const lineText = lines
    .map((l, i) => `${i}. ${String(l.description ?? '').slice(0, 220)}${l.quantity != null ? ` (qty ${l.quantity})` : ''}`)
    .join('\n');
  const prompt = `These are line items from a Greek supplier invoice. For each line, extract a clean, sellable product. Be conservative — never invent values; use null when unknown.
- name: concise product name (drop tax/qty noise, keep brand/model)
- sku: product/model code if present, else null
- unit: unit of measure (pcs, m, m2, kg, lt, …) if inferable, else null
- size: dimensions/size if present (e.g. "60x60", "10mm", "1.5L"), else null
- attributes: short summary of other attributes (color, finish, material), else null
Return exactly one suggestion per input line, preserving its index.

Lines:
${lineText}`;

  let suggestions: any[] = [];
  try {
    const res = await generateStructuredWithClaude(prompt, SuggestionSchema, {
      model: MODEL, task: 'expense_product_extraction', temperature: 0.2, maxTokens: 1500,
    });
    suggestions = res.output?.suggestions ?? [];
  } catch (e: any) {
    // Refund — the caller got nothing for their credit.
    await supabase.rpc('credit_user_credits', {
      p_user_id: auth.userId, p_amount: CREDIT_COST,
      p_operation_type: 'expense_product_extraction_refund',
      p_description: 'Refund — AI extraction failed',
    }).catch(() => {});
    throw new HttpError(502, `AI extraction failed: ${e?.message ?? e}`);
  }

  return json({ suggestions, credits_used: CREDIT_COST, balance: Number(drow?.new_balance ?? 0) });
}));
