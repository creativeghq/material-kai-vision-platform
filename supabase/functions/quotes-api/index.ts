import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { assertEntitled } from '../_shared/entitlement.ts';

async function parseJsonBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Quotes & Proposals API
 * Handles quote requests and proposal management
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
Deno.serve(withApiLogging('quotes-api', async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.replace('/quotes-api', '').split('/').filter(Boolean);

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const user = auth.user;
    const userId = auth.userId;
    if (!user) {
      // Every route below is scoped to the caller's own rows — a secret-key caller with no
      // user identity has nothing to scope against.
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

    // POST /api/quote-requests - Create quote request
    if (method === 'POST' && path[0] === 'quote-requests') {
      const body = await parseJsonBody(req);
      const { quote_id, notes } = body;

      if (!quote_id) {
        return new Response(
          JSON.stringify({ error: 'Missing quote_id' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // The quote's workspace comes from the quote row, never the request body (#250 inv. 1),
      // and 404 (not 403) hides quote-id existence from non-owners.
      const { data: quoteRow, error: quoteRowError } = await supabase
        .from('quotes')
        .select('id, user_id, workspace_id')
        .eq('id', quote_id)
        .single();

      if (quoteRowError || !quoteRow || quoteRow.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Quote not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Workspace-owned quotes require the workspace to own the quotes module (#212).
      if (quoteRow.workspace_id) {
        const ent = await assertEntitled(supabase, quoteRow.workspace_id, 'quotes');
        if (!ent.ok) return ent.response;
      }

      // Get quote items count
      const { data: quoteItems, error: quoteError } = await supabase
        .from('quote_items')
        .select('id')
        .eq('quote_id', quote_id);

      if (quoteError) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch quote items' }), // Changed from cart items
          { status: 500, headers: corsHeaders },
        );
      }

      // Create quote request
      const { data, error } = await supabase
        .from('quote_requests')
        .insert({
          user_id: user.id,
          quote_id,
          workspace_id: quoteRow.workspace_id,
          status: 'pending',
          items_count: quoteItems?.length || 0, // Changed from cartItems
          notes: notes || null,
        })
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 201, headers: corsHeaders },
      );
    }

    // GET /api/quote-requests - List user's quote requests
    if (method === 'GET' && path[0] === 'quote-requests' && !path[1]) {
      const { data, error } = await supabase
        .from('quote_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/quote-requests/:id - Get specific quote request
    if (method === 'GET' && path[0] === 'quote-requests' && path[1]) {
      const quoteId = path[1];

      const { data, error } = await supabase
        .from('quote_requests')
        .select('*')
        .eq('id', quoteId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Quote request not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders },
      );
    }

    // PATCH /api/quote-requests/:id - Update quote request status
    if (method === 'PATCH' && path[0] === 'quote-requests' && path[1]) {
      const quoteId = path[1];
      const body = await parseJsonBody(req);
      const { status } = body;

      if (!status || !['pending', 'updated', 'approved', 'rejected'].includes(status)) {
        return new Response(
          JSON.stringify({ error: 'Invalid status' }),
          { status: 400, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase
        .from('quote_requests')
        .update({ status })
        .eq('id', quoteId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders },
      );
    }

    // The `proposals` routes were removed here on 2026-08-30 with the table (#378 N9). It was
    // a second, abandoned quoting system: 0 rows, no UI, and 0 requests in the whole lifetime
    // of api_usage_logs. Serving it made it read as live to anyone browsing this file — and
    // kept the dead-schema guard from seeing the table, because that scan counts any mention
    // in source as a reference. Quotes are `quotes` / `quote_items`.

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: corsHeaders },
    );
  } catch (error) {
    // Client errors carry their own status and skip Sentry via the wrapper.
    if (error instanceof HttpError) throw error;
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: corsHeaders },
    );
  }
}));

