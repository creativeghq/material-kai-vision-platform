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
      return handleModuleAction(req, body);
    default:
      return new Response(JSON.stringify({
        error: `Unknown action '${action}'. Available: checkout, customer_portal, activate-module, deactivate-module, request-module, list-stripe-products`,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
  }
}));
