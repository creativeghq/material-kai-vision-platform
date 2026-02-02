import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';

interface BatchUpdateRequest {
  sessionIds: string[];
  fieldMappings: any;
}

/**
 * Batch Update Sessions API
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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

    const { sessionIds, fieldMappings }: BatchUpdateRequest = await req.json();

    if (!sessionIds || sessionIds.length === 0) {
      throw new Error('No session IDs provided');
    }

    if (!fieldMappings) {
      throw new Error('Field mappings are required');
    }

    // Update all sessions with the new field mappings
    const { data, error } = await supabase
      .from('scraping_sessions')
      .update({ field_mappings: fieldMappings })
      .in('id', sessionIds)
      .select('id');

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        updated: data?.length || 0,
        sessionIds: data?.map((s) => s.id) || [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error batch updating sessions:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to update sessions',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

