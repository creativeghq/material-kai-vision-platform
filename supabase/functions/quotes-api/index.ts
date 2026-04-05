import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

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

    // POST /api/quote-requests - Create quote request
    if (method === 'POST' && path[0] === 'quote-requests') {
      const body = await req.json();
      const { quote_id, workspace_id, notes } = body; // Changed from cart_id

      if (!quote_id) {
        return new Response(
          JSON.stringify({ error: 'Missing quote_id' }), // Changed from cart_id
          { status: 400, headers: corsHeaders },
        );
      }

      // Get quote items count
      const { data: quoteItems, error: quoteError } = await supabase
        .from('quote_items') // Changed from cart_items
        .select('id')
        .eq('quote_id', quote_id); // Changed from cart_id

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
          quote_id, // Changed from cart_id
          workspace_id: workspace_id || null,
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
      const body = await req.json();
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

    // GET /api/proposals - List proposals for user's quote requests
    if (method === 'GET' && path[0] === 'proposals' && !path[1]) {
      // Get user's quote request IDs
      const { data: quoteRequests } = await supabase
        .from('quote_requests')
        .select('id')
        .eq('user_id', user.id);

      const quoteRequestIds = quoteRequests?.map((q) => q.id) || [];

      if (quoteRequestIds.length === 0) {
        return new Response(
          JSON.stringify({ data: [] }),
          { status: 200, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase
        .from('proposals')
        .select(`
          *,
          quote_requests(id, quote_id, status, created_at)
        `)
        .in('quote_request_id', quoteRequestIds)
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

    // GET /api/proposals/:id - Get specific proposal
    if (method === 'GET' && path[0] === 'proposals' && path[1]) {
      const proposalId = path[1];

      const { data, error } = await supabase
        .from('proposals')
        .select(`
          *,
          quote_requests(id, quote_id, user_id, status, created_at)
        `)
        .eq('id', proposalId)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: 'Proposal not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Verify user owns the quote request
      if (data.quote_requests?.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 403, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders },
      );
    }

    // PATCH /api/proposals/:id - Update proposal status (accept/reject)
    if (method === 'PATCH' && path[0] === 'proposals' && path[1]) {
      const proposalId = path[1];
      const body = await req.json();
      const { status } = body;

      if (!status || !['accepted', 'rejected'].includes(status)) {
        return new Response(
          JSON.stringify({ error: 'Invalid status. Must be "accepted" or "rejected"' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Get proposal and verify ownership
      const { data: proposal } = await supabase
        .from('proposals')
        .select(`
          *,
          quote_requests(user_id)
        `)
        .eq('id', proposalId)
        .single();

      if (!proposal || proposal.quote_requests?.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Proposal not found or unauthorized' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Update proposal status
      const updateData: any = { status };
      if (status === 'accepted') {
        updateData.accepted_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', proposalId)
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

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: corsHeaders },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: corsHeaders },
    );
  }
}));

