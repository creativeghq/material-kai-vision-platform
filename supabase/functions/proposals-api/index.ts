import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Proposals API
 * Handles proposal operations: create, list, get, update pricing, send, accept
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.split('/').slice(4); // Remove /functions/proposals-api

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

    // Check if user is admin
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role_id')
      .eq('user_id', user.id)
      .single();

    const { data: adminRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'admin')
      .single();

    const isAdmin = userProfile?.role_id === adminRole?.id;

    // POST /api/proposals - Create proposal (admin only)
    if (method === 'POST' && path.length === 0) {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: corsHeaders },
        );
      }

      const body = await req.json();
      const { quote_request_id, items, subtotal, tax, discount, notes } = body;

      const total = (subtotal || 0) + (tax || 0) - (discount || 0);

      const { data: proposal, error } = await supabase
        .from('proposals')
        .insert({
          quote_request_id,
          user_id: (await supabase.from('quote_requests').select('user_id').eq('id', quote_request_id).single()).data?.user_id,
          admin_id: user.id,
          status: 'draft',
          items,
          subtotal,
          tax,
          discount,
          total,
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

      return new Response(
        JSON.stringify({ data: proposal }),
        { status: 201, headers: corsHeaders },
      );
    }

    // GET /api/proposals - List proposals
    if (method === 'GET' && path.length === 0) {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      let query = supabase
        .from('proposals')
        .select('*')
        .range(offset, offset + limit - 1);

      // If not admin, only show user's own proposals
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

    // GET /api/proposals/{id} - Get proposal details
    if (method === 'GET' && path.length === 1) {
      const proposalId = path[0];

      const { data: proposal, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Proposal not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Verify user owns this proposal or is admin
      if (proposal.user_id !== user.id && !isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 403, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data: proposal }),
        { status: 200, headers: corsHeaders },
      );
    }

    // PATCH /api/proposals/{id} - Update proposal pricing
    if (method === 'PATCH' && path.length === 1) {
      const proposalId = path[0];
      const body = await req.json();
      const { subtotal, tax, discount, notes } = body;

      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: corsHeaders },
        );
      }

      const { data: proposal } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      const total = (subtotal !== undefined ? subtotal : proposal.subtotal || 0) +
                   (tax !== undefined ? tax : proposal.tax || 0) -
                   (discount !== undefined ? discount : proposal.discount || 0);

      const { data: updated, error } = await supabase
        .from('proposals')
        .update({
          ...(subtotal !== undefined && { subtotal }),
          ...(tax !== undefined && { tax }),
          ...(discount !== undefined && { discount }),
          ...(notes !== undefined && { notes }),
          total,
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposalId)
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

    // PATCH /api/proposals/{id}/send - Send proposal to user
    if (method === 'PATCH' && path.length === 2 && path[1] === 'send') {
      const proposalId = path[0];

      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: corsHeaders },
        );
      }

      const { data: updated, error } = await supabase
        .from('proposals')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposalId)
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

    // PATCH /api/proposals/{id}/accept - User accepts proposal
    if (method === 'PATCH' && path.length === 2 && path[1] === 'accept') {
      const proposalId = path[0];

      const { data: proposal } = await supabase
        .from('proposals')
        .select('user_id')
        .eq('id', proposalId)
        .single();

      if (proposal?.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 403, headers: corsHeaders },
        );
      }

      const { data: updated, error } = await supabase
        .from('proposals')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposalId)
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

