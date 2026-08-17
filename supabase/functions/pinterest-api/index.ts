// Pinterest pin import — URL/oEmbed only.
//   extract_pin, import_pin, import_pins_bulk
//
// The OAuth half (get_auth_url / callback / get_boards / get_board_pins / disconnect) is GONE.
// It stored Pinterest tokens in `social_accounts.access_token` / `refresh_token` /
// `token_expires_at` / `platform_account_id` / `account_name`, and that table was reshaped for
// Zernio — it now carries `zernio_account_id`, `handle`, `display_name`. None of those columns
// exist any more, so every OAuth call had been failing outright; `loadBoards()` swallowed the
// error and the board picker simply stayed empty.
//
// It is not rebuilt on Zernio because Zernio cannot do this job. Zernio is the OAuth broker and
// publisher (it does list `pinterest` in SUPPORTED_PLATFORMS, so CONNECTING a Pinterest account
// belongs there and works today) — but its API is profiles / accounts / usage / webhooks / inbox /
// media. It exposes no "list this account's boards" or "list a board's pins" endpoint and hands
// back no Pinterest access token, so board browsing cannot be served through it. Reviving it would
// mean standing a direct Pinterest OAuth app back up and storing tokens again, which is a product
// decision, not a repair.
//
// What the feature is actually for — getting pins into a moodboard — is fully served by the URL
// path below, which needs no OAuth at all.

import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { handlePinterestImport } from './handlers/import.ts';

const IMPORT_ACTIONS = new Set(['extract_pin', 'import_pin', 'import_pins_bulk']);

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

  return new Response(JSON.stringify({
    success: false,
    error: `Unknown action '${action}'. Supported: ${[...IMPORT_ACTIONS].join(', ')}.`,
  }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
