import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Shopping Cart API
 * Handles shopping cart operations: create, get, add items, remove items, update
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.split('/').slice(4); // Remove /functions/shopping-cart-api

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

    // POST /api/cart - Create new cart
    if (method === 'POST' && path.length === 0) {
      const body = await req.json();
      const { workspace_id } = body;

      const { data: cart, error } = await supabase
        .from('shopping_carts')
        .insert({
          user_id: user.id,
          workspace_id,
          status: 'active',
          total_items: 0,
        })
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data: cart }),
        { status: 201, headers: corsHeaders },
      );
    }

    // GET /api/cart/{id} - Get cart details
    if (method === 'GET' && path.length === 1) {
      const cartId = path[0];

      const { data: cart, error: cartError } = await supabase
        .from('shopping_carts')
        .select('*')
        .eq('id', cartId)
        .eq('user_id', user.id)
        .single();

      if (cartError) {
        return new Response(
          JSON.stringify({ error: 'Cart not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Get cart items
      const { data: items, error: itemsError } = await supabase
        .from('cart_items')
        .select('*')
        .eq('cart_id', cartId);

      if (itemsError) {
        return new Response(
          JSON.stringify({ error: itemsError.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data: { ...cart, items } }),
        { status: 200, headers: corsHeaders },
      );
    }

    // POST /api/cart/{id}/items - Add item to cart
    if (method === 'POST' && path.length === 2 && path[1] === 'items') {
      const cartId = path[0];
      const body = await req.json();
      const { product_id, quantity, unit_price, notes } = body;

      // Verify cart belongs to user
      const { data: cart, error: cartError } = await supabase
        .from('shopping_carts')
        .select('*')
        .eq('id', cartId)
        .eq('user_id', user.id)
        .single();

      if (cartError) {
        return new Response(
          JSON.stringify({ error: 'Cart not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Add item
      const { data: item, error: itemError } = await supabase
        .from('cart_items')
        .insert({
          cart_id: cartId,
          product_id,
          quantity: quantity || 1,
          unit_price,
          notes,
        })
        .select()
        .single();

      if (itemError) {
        return new Response(
          JSON.stringify({ error: itemError.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Update cart total_items
      const { data: updatedCart } = await supabase
        .from('shopping_carts')
        .update({
          total_items: (cart.total_items || 0) + (quantity || 1),
          updated_at: new Date().toISOString(),
        })
        .eq('id', cartId)
        .select()
        .single();

      return new Response(
        JSON.stringify({ data: item }),
        { status: 201, headers: corsHeaders },
      );
    }

    // DELETE /api/cart/{id}/items/{itemId} - Remove item from cart
    if (method === 'DELETE' && path.length === 3 && path[1] === 'items') {
      const cartId = path[0];
      const itemId = path[2];

      // Verify cart belongs to user
      const { data: cart } = await supabase
        .from('shopping_carts')
        .select('*')
        .eq('id', cartId)
        .eq('user_id', user.id)
        .single();

      if (!cart) {
        return new Response(
          JSON.stringify({ error: 'Cart not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Get item to know quantity
      const { data: item } = await supabase
        .from('cart_items')
        .select('quantity')
        .eq('id', itemId)
        .single();

      // Delete item
      const { error: deleteError } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: deleteError.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Update cart total_items
      await supabase
        .from('shopping_carts')
        .update({
          total_items: Math.max(0, (cart.total_items || 0) - (item?.quantity || 1)),
          updated_at: new Date().toISOString(),
        })
        .eq('id', cartId);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders },
      );
    }

    // PATCH /api/cart/{id} - Update cart
    if (method === 'PATCH' && path.length === 1) {
      const cartId = path[0];
      const body = await req.json();
      const { status } = body;

      const { data: cart, error } = await supabase
        .from('shopping_carts')
        .update({
          ...(status && { status }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', cartId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data: cart }),
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

