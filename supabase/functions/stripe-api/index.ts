// Unified Stripe API (admin/customer-facing actions).
// Body: { action: 'checkout' | 'customer_portal', ...params }
// stripe-webhooks stays separate — it's the public webhook receiver registered
// in the Stripe dashboard; that URL must not change.
// crm-stripe-api is reachable through crm-api as { resource: 'stripe' }.

import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { handleCheckout } from './handlers/checkout.ts';
import { handleCustomerPortal } from './handlers/customer-portal.ts';
import { handleModuleAction } from './handlers/modules.ts';

Deno.serve(withApiLogging('stripe-api', async (req) => {
  // Populate Deno.env from platform_secrets BEFORE dispatching — handlers
  // create their Stripe client per-request from env, env-first DB-fallback.
  await bootstrapForFunction();

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
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const action = body?.action;
  switch (action) {
    case 'checkout':
      return handleCheckout(req, body);
    case 'customer_portal':
      return handleCustomerPortal(req, body);
    case 'activate-module':
    case 'deactivate-module':
    case 'request-module':
    case 'list-stripe-products':
    case 'create-addon-product':
    case 'verify-catalogue-prices':
    case 'request-self-hosting':
      return handleModuleAction(req, body);
    default:
      return new Response(JSON.stringify({
        // Listed exhaustively and kept in step with the switch above: 'create-addon-product' was
        // routable and unlisted for its whole life, so the only way to discover it was to read
        // the source. An action the error message denies existing is an action nobody calls.
        error: `Unknown action '${action}'. Available: checkout, customer_portal, activate-module, `
          + `deactivate-module, request-module, list-stripe-products, create-addon-product, `
          + `verify-catalogue-prices, request-self-hosting`,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
  }
}));
