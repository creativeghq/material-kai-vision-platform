import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Moodboard Products API
 * Handles moodboard product operations: add, list, remove
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.split('/').slice(4); // Remove /functions/moodboard-products-api

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

    // POST /api/moodboards/{id}/products - Add product to moodboard
    if (method === 'POST' && path.length === 3 && path[1] === 'products') {
      const moodboardId = path[0];
      const body = await req.json();
      const { product_id, position_x, position_y, notes } = body;

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

      // Add product to moodboard
      const { data: moodboardProduct, error } = await supabase
        .from('moodboard_products')
        .insert({
          moodboard_id: moodboardId,
          product_id,
          position_x,
          position_y,
          notes,
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
        JSON.stringify({ data: moodboardProduct }),
        { status: 201, headers: corsHeaders }
      );
    }

    // GET /api/moodboards/{id}/products - List products in moodboard
    if (method === 'GET' && path.length === 3 && path[1] === 'products') {
      const moodboardId = path[0];
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      // Verify moodboard exists
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

      // Get products
      const { data: products, error } = await supabase
        .from('moodboard_products')
        .select('*')
        .eq('moodboard_id', moodboardId)
        .range(offset, offset + limit - 1)
        .order('added_at', { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data: products, count: products?.length || 0 }),
        { status: 200, headers: corsHeaders }
      );
    }

    // DELETE /api/moodboards/{id}/products/{productId} - Remove product from moodboard
    if (method === 'DELETE' && path.length === 4 && path[1] === 'products') {
      const moodboardId = path[0];
      const productId = path[3];

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

      // Delete product from moodboard
      const { error } = await supabase
        .from('moodboard_products')
        .delete()
        .eq('moodboard_id', moodboardId)
        .eq('product_id', productId);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
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

