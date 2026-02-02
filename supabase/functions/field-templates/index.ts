import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';

/**
 * Field Templates API
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      throw new Error(auth.error || 'Authentication failed');
    }

    const user = auth.user;
    const userId = auth.userId;

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

