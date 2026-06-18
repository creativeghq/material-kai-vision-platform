// Unified CRM API — REST resource routing.
//
//   POST /crm-api/companies/...   → handleCompanies
//   POST /crm-api/contacts/...    → handleContacts
//   POST /crm-api/users/...       → handleUsers
//   POST /crm-api/stripe/...      → handleCrmStripe
//
// HTTP method (POST/GET/PUT/DELETE) and remaining path segments are preserved.
// Each handler does its own auth + RLS.

import { corsHeaders } from '../_shared/cors.ts';
import { handleCompanies } from './handlers/companies-api-handler.ts';
import { handleContacts } from './handlers/contacts-api-handler.ts';
import { handleUsers } from './handlers/users-api-handler.ts';
import { handleCrmStripe } from './handlers/stripe-api-handler.ts';
import { handleAddressUnits } from './handlers/address-units-api-handler.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const ROUTES: Record<string, (req: Request) => Promise<Response>> = {
  companies: handleCompanies,
  contacts: handleContacts,
  users: handleUsers,
  stripe: handleCrmStripe,
  'address-units': handleAddressUnits,
};

Deno.serve(withApiLogging('crm-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  // Match /crm-api/<resource>/...
  const stripped = url.pathname.replace(/^\/(functions\/v1\/)?crm-api/, '');
  const segments = stripped.split('/').filter(Boolean);
  const resource = segments[0];

  const handler = resource ? ROUTES[resource] : undefined;
  if (!handler) {
    return new Response(JSON.stringify({
      error: `Missing or unknown resource. Available: ${Object.keys(ROUTES).join(', ')}`,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return handler(req);
}));
