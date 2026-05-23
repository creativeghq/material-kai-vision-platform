// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

// Sales/Finance — issue an invoice from an accepted quote.
//
// Flow:
//   1. Call `issue_invoice_from_quote(quote_id)` RPC. Creates a draft invoice + items
//      with cost_snapshot copied from quote_items. Idempotent — returns existing invoice
//      if one exists for the quote.
//   2. If body.issue_now=true, flip status draft → issued (stamps issued_at + due_at).
//   3. If body.push_to_oxygen=true AND quote has no oxygen_notice_id yet, invoke the
//      existing oxygen-create-pre-invoice function. The notice id flows back to both
//      quotes.oxygen_notice_id and (mirrored at next read) invoices.oxygen_notice_id.
//
// Auth: admin / super_admin / owner / finance.

interface RequestBody {
  quote_id: string;
  issue_now?: boolean;
  push_to_oxygen?: boolean;
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = await authenticate(req, {
      requireUser: true,
      allowedRoles: ['admin', 'super_admin', 'owner', 'finance'],
    });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const body = (await req.json()) as RequestBody;
    if (!body.quote_id) return json({ error: 'quote_id is required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // 1. Idempotent create of invoice draft via RPC
    const { data: invoiceId, error: rpcErr } = await supabase.rpc('issue_invoice_from_quote', {
      p_quote_id: body.quote_id,
    });
    if (rpcErr) return json({ error: `issue_invoice_from_quote failed: ${rpcErr.message}` }, 500);

    // 2. Optional issue (draft → issued)
    let invoiceState: any = null;
    if (body.issue_now) {
      // Skip if already issued — mark_invoice_issued errors out on non-draft state.
      const { data: current } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', invoiceId)
        .single();
      if (current?.status === 'draft') {
        const { error: issueErr } = await supabase.rpc('mark_invoice_issued', {
          p_invoice_id: invoiceId,
        });
        if (issueErr) return json({ error: `mark_invoice_issued failed: ${issueErr.message}` }, 500);
      }
    }

    // 3. Optional Oxygen push (reuses existing oxygen-create-pre-invoice function)
    let oxygenResult: any = null;
    if (body.push_to_oxygen) {
      try {
        const oxygenRes = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/oxygen-create-pre-invoice`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: req.headers.get('Authorization') ?? '',
              apikey: req.headers.get('apikey') ?? '',
            },
            body: JSON.stringify({ quote_id: body.quote_id }),
          },
        );
        oxygenResult = await oxygenRes.json();

        // Mirror oxygen_notice_id back onto the invoice if Oxygen returned one
        if (oxygenResult?.oxygen_notice_id) {
          await supabase
            .from('invoices')
            .update({ oxygen_notice_id: oxygenResult.oxygen_notice_id })
            .eq('id', invoiceId)
            .is('oxygen_notice_id', null);
        }
      } catch (err: any) {
        oxygenResult = { error: err?.message ?? 'oxygen push failed' };
      }
    }

    // 4. Read final state for the response
    const { data: finalInvoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    return json({
      ok: true,
      invoice_id: invoiceId,
      invoice: finalInvoice,
      oxygen: oxygenResult,
    });
  } catch (err: any) {
    console.error('finance-issue-invoice error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
});
