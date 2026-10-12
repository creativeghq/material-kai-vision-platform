/** store-api — operator actions on a connected sales channel. The inbound order webhook stays separate: its URL is registered with each store. */
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { handleSyncOrders } from './handlers/sync-orders.ts';
import { handleSkroutz, SKROUTZ_ACTIONS } from './handlers/skroutz.ts';
import { handleDocumentWriteback } from './handlers/document-writeback.ts';

Deno.serve(withApiLogging('store-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? '');

  if (action === 'sync_orders') return handleSyncOrders(req, body);
  if (action === 'document_writeback') return handleDocumentWriteback(req, body);
  if (SKROUTZ_ACTIONS.has(action)) return handleSkroutz(req, body);
  throw new HttpError(400, `Unknown action '${action}'. Available: sync_orders, document_writeback, ${[...SKROUTZ_ACTIONS].join(', ')}`);
}));
