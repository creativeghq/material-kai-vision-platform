// Unified Oxygen API.
//
// Body: { action: 'create_pre_invoice' | 'get_settings' | 'save_settings' |
//                  'list_taxes' | 'list_warehouses' | 'test_connection', ...params }

import { corsHeaders } from '../_shared/cors.ts';
import { handleOxygenCreatePreInvoice } from './handlers/create-pre-invoice.ts';
import { handleOxygenAdmin } from './handlers/admin.ts';

const ADMIN_ACTIONS = new Set(['get_settings', 'save_settings', 'list_taxes', 'list_warehouses', 'test_connection']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const action = body?.action;
  if (action === 'create_pre_invoice') return handleOxygenCreatePreInvoice(req, body);
  if (ADMIN_ACTIONS.has(action)) return handleOxygenAdmin(req, body);

  return new Response(JSON.stringify({
    error: `Unknown action '${action}'. Available: create_pre_invoice, ${[...ADMIN_ACTIONS].join(', ')}`,
  }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
