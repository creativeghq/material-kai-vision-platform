// Unified Pinterest API.
//
// Inner action determines which handler runs:
//   - Import-side actions:  extract_pin, import_pin, import_pins_bulk
//   - OAuth-side actions:   get_auth_url, callback, get_boards, get_board_pins, disconnect

import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { handlePinterestImport } from './handlers/import.ts';
import { handlePinterestOauth } from './handlers/oauth.ts';

const IMPORT_ACTIONS = new Set(['extract_pin', 'import_pin', 'import_pins_bulk']);
const OAUTH_ACTIONS = new Set(['get_auth_url', 'callback', 'get_boards', 'get_board_pins', 'disconnect']);

Deno.serve(withApiLogging('pinterest-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const action = body?.action;
  if (IMPORT_ACTIONS.has(action)) return handlePinterestImport(req, body);
  if (OAUTH_ACTIONS.has(action)) return handlePinterestOauth(req, body);

  return new Response(JSON.stringify({
    success: false,
    error: `Unknown action '${action}'. Import: ${[...IMPORT_ACTIONS].join(', ')}. OAuth: ${[...OAUTH_ACTIONS].join(', ')}.`,
  }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
