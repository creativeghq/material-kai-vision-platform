import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Moodboard Quote API
 * Handles moodboard quote requests and commission tracking
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.split('/').slice(4); // Remove /functions/moodboard-quote-api

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // POST /api/moodboards/{id}/request-quote - Request quote for moodboard
    if (method === 'POST' && path.length === 3 && path[1] === 'request-quote') {
      const moodboardId = path[0];
      const body = await req.json();
      const { workspace_id, notes } = body;

      // Get moodboard and verify it's public
      const { data: moodboard } = await supabase
        .from('moodboards')
        .select('*')
        .eq('id', moodboardId)
        .single();

      if (!moodboard) {
        return new Response(
          JSON.stringify({ error: 'Moodboard not found' }),
          { status: 404, headers: corsHeaders }
        );
      }

      if (!moodboard.is_public) {
        return new Response(
          JSON.stringify({ error: 'Moodboard is not public' }),
          { status: 403, headers: corsHeaders }
        );
      }

      // Get moodboard products
      const { data: moodboardProducts } = await supabase
        .from('moodboard_products')
        .select('product_id')
        .eq('moodboard_id', moodboardId);

      if (!moodboardProducts || moodboardProducts.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Moodboard has no products' }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Create shopping cart
      const { data: cart } = await supabase
        .from('shopping_carts')
        .insert({
          user_id: user.id,
          workspace_id,
          status: 'active',
          total_items: moodboardProducts.length,
        })
        .select()
        .single();

      // Add products to cart
      for (const mp of moodboardProducts) {
        await supabase
          .from('cart_items')
          .insert({
            cart_id: cart.id,
            product_id: mp.product_id,
            quantity: 1,
          });
      }

      // Create quote request
      const { data: quoteRequest } = await supabase
        .from('quote_requests')
        .insert({
          user_id: user.id,
          cart_id: cart.id,
          workspace_id,
          status: 'pending',
          items_count: moodboardProducts.length,
          notes,
        })
        .select()
        .single();

      // Create moodboard quote request with commission tracking
      const { data: moodboardQuote, error } = await supabase
        .from('moodboard_quote_requests')
        .insert({
          moodboard_id: moodboardId,
          moodboard_creator_id: moodboard.user_id,
          requester_id: user.id,
          quote_request_id: quoteRequest.id,
          commission_percentage: 10.0,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data: moodboardQuote }),
        { status: 201, headers: corsHeaders }
      );
    }

    // GET /api/moodboards/{id}/quote-requests - List quote requests for moodboard
    if (method === 'GET' && path.length === 3 && path[1] === 'quote-requests') {
      const moodboardId = path[0];
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      // Verify user owns this moodboard
      const { data: moodboard } = await supabase
        .from('moodboards')
        .select('user_id')
        .eq('id', moodboardId)
        .single();

      if (moodboard?.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 403, headers: corsHeaders }
        );
      }

      // Get quote requests
      const { data: quoteRequests, error } = await supabase
        .from('moodboard_quote_requests')
        .select('*')
        .eq('moodboard_id', moodboardId)
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data: quoteRequests, count: quoteRequests?.length || 0 }),
        { status: 200, headers: corsHeaders }
      );
    }

    // GET /api/user/commissions - Get user's commissions
    if (method === 'GET' && path.length === 2 && path[0] === 'user' && path[1] === 'commissions') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      // Get commissions for user as moodboard creator
      const { data: commissions, error } = await supabase
        .from('moodboard_quote_requests')
        .select('*')
        .eq('moodboard_creator_id', user.id)
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Calculate totals
      const totalCommission = commissions?.reduce((sum, c) => {
        return sum + (c.commission_amount || 0);
      }, 0) || 0;

      const pendingCommission = commissions
        ?.filter(c => c.status === 'pending')
        .reduce((sum, c) => sum + (c.commission_amount || 0), 0) || 0;

      return new Response(
        JSON.stringify({
          data: commissions,
          count: commissions?.length || 0,
          totals: {
            total_commission: totalCommission,
            pending_commission: pendingCommission,
          },
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});

