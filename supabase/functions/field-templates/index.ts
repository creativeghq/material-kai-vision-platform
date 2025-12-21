import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Authentication failed');

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // GET /field-templates?workspace_id=xxx
    if (req.method === 'GET') {
      const workspaceId = url.searchParams.get('workspace_id');
      if (!workspaceId) throw new Error('workspace_id required');

      const { data, error } = await supabase
        .from('field_templates')
        .select('*')
        .or(`workspace_id.eq.${workspaceId},is_global.eq.true`)
        .order('usage_count', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /field-templates
    if (req.method === 'POST') {
      const body = await req.json();
      const { workspace_id, name, description, fields } = body;

      if (!workspace_id || !name || !fields) {
        throw new Error('workspace_id, name, and fields are required');
      }

      const { data, error } = await supabase
        .from('field_templates')
        .insert({
          workspace_id,
          name,
          description,
          fields,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /field-templates/:id/use
    if (req.method === 'POST' && pathParts[1] === 'use') {
      const templateId = pathParts[0];

      const { error } = await supabase.rpc('increment_template_usage', {
        template_id: templateId,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /field-templates/:id
    if (req.method === 'DELETE') {
      const templateId = pathParts[0];

      const { error } = await supabase
        .from('field_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

