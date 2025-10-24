import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Quote Request API
 * Handles quote request operations: submit, list, get, update status
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.split('/').slice(4); // Remove /functions/quote-request-api

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

    // POST /api/quote-requests - Submit quote request
    if (method === 'POST' && path.length === 0) {
      const body = await req.json();
      const { cart_id, workspace_id, notes } = body;

      // Get cart items count and total
      const { data: cartItems, error: itemsError } = await supabase
        .from('cart_items')
        .select('quantity, unit_price')
        .eq('cart_id', cart_id);

      if (itemsError) {
        return new Response(
          JSON.stringify({ error: itemsError.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      const itemsCount = cartItems?.length || 0;
      const totalEstimated = cartItems?.reduce((sum, item) => {
        return sum + ((item.unit_price || 0) * (item.quantity || 1));
      }, 0) || 0;

      // Create quote request
      const { data: quoteRequest, error } = await supabase
        .from('quote_requests')
        .insert({
          user_id: user.id,
          cart_id,
          workspace_id,
          status: 'pending',
          items_count: itemsCount,
          total_estimated: totalEstimated,
          notes,
        })
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Update cart status
      await supabase
        .from('shopping_carts')
        .update({ status: 'submitted' })
        .eq('id', cart_id);

      return new Response(
        JSON.stringify({ data: quoteRequest }),
        { status: 201, headers: corsHeaders },
      );
    }

    // GET /api/quote-requests - List quote requests (admin or user's own)
    if (method === 'GET' && path.length === 0) {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const isAdmin = url.searchParams.get('admin') === 'true';

      let query = supabase
        .from('quote_requests')
        .select('*')
        .range(offset, offset + limit - 1);

      // If not admin, only show user's own requests
      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data, count: data?.length || 0 }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/quote-requests/{id} - Get quote request details
    if (method === 'GET' && path.length === 1) {
      const requestId = path[0];

      const { data: quoteRequest, error } = await supabase
        .from('quote_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Quote request not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Verify user owns this request or is admin
      if (quoteRequest.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 403, headers: corsHeaders },
        );
      }

      // Get cart items
      const { data: cartItems } = await supabase
        .from('cart_items')
        .select('*')
        .eq('cart_id', quoteRequest.cart_id);

      return new Response(
        JSON.stringify({ data: { ...quoteRequest, items: cartItems } }),
        { status: 200, headers: corsHeaders },
      );
    }

    // PATCH /api/quote-requests/{id} - Update quote request status
    if (method === 'PATCH' && path.length === 1) {
      const requestId = path[0];
      const body = await req.json();
      const { status } = body;

      // Verify user owns this request
      const { data: quoteRequest } = await supabase
        .from('quote_requests')
        .select('user_id')
        .eq('id', requestId)
        .single();

      if (quoteRequest?.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 403, headers: corsHeaders },
        );
      }

      const { data: updated, error } = await supabase
        .from('quote_requests')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data: updated }),
        { status: 200, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: corsHeaders },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders },
    );
  }
});

