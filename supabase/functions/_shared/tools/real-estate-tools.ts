// #249 — Real Estate agent toolkit (`manage_real_estate`) for the `kai` agent. All-users; module +
// entitlement + realestate.* RBAC are enforced server-side in real-estate-api (this tool just calls
// it with the caller's JWT). Read-only actions today (0 credits) — AI listing copy (draft_description)
// lands with the P2 AI wave; syndicate lands with the P3 engine.
const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MODULE_SLUG = 'real-estate';

function svcClient() { return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); }

async function moduleEnabled(): Promise<boolean> {
  try {
    const { data } = await svcClient().from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
    return Boolean(data?.enabled);
  } catch { return false; }
}

async function callApi(jwt: string, workspaceId: string, action: string, extra: Record<string, unknown> = {}): Promise<any> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/real-estate-api`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, workspace_id: workspaceId, ...extra }),
    });
    const text = await resp.text();
    let parsed: any = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { error: text }; }
    if (!resp.ok) return { ok: false, status: resp.status, error: parsed?.error || `real-estate-api ${action} failed (${resp.status})` };
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: `real-estate-api ${action} call failed: ${(e as Error).message}` };
  }
}

export const createManageRealEstateTool = (
  _userId: string,
  workspaceId: string | undefined,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, status, property_type, transaction_type, title, price, town, scheduled_at, property_id }) => {
      if (!workspaceId) return JSON.stringify({ success: false, error: 'No active workspace.' });
      if (!jwt) return JSON.stringify({ success: false, error: 'Real Estate tools require an authenticated session.' });
      if (!await moduleEnabled()) return JSON.stringify({ success: false, error: 'The Real Estate module is not enabled on this platform.' });

      onChunk?.({ type: 'tool_progress', status: `real estate: ${action}...`, timestamp: Date.now() });

      switch (action) {
        case 'list_properties': {
          const res = await callApi(jwt, workspaceId, 'list-properties', { status, property_type });
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          const properties = res.data?.properties ?? [];
          onChunk?.({ type: 'real_estate_properties', properties, timestamp: Date.now() });
          return JSON.stringify({ success: true, count: properties.length, properties: properties.slice(0, 25) });
        }
        case 'get_property': {
          if (!property_id) return JSON.stringify({ success: false, error: 'property_id is required' });
          const res = await callApi(jwt, workspaceId, 'get-property', { property_id });
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          onChunk?.({ type: 'real_estate_property', property: res.data?.property, photos: res.data?.photos ?? [], timestamp: Date.now() });
          return JSON.stringify({ success: true, property: res.data?.property, photo_count: (res.data?.photos ?? []).length, inquiry_count: (res.data?.inquiries ?? []).length });
        }
        case 'find_leads': {
          const res = await callApi(jwt, workspaceId, 'list-inquiries', { status, property_id });
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          const inquiries = res.data?.inquiries ?? [];
          onChunk?.({ type: 'real_estate_leads', inquiries, timestamp: Date.now() });
          return JSON.stringify({ success: true, count: inquiries.length, inquiries: inquiries.slice(0, 25) });
        }
        case 'create_listing': {
          const fields: Record<string, unknown> = { title: title || 'Untitled listing', property_type: property_type || 'residential', transaction_type: transaction_type || 'sale' };
          if (price !== undefined) fields.price = price;
          if (town) fields.town = town;
          const res = await callApi(jwt, workspaceId, 'create-property', fields);
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          onChunk?.({ type: 'real_estate_listing_created', property: res.data?.property, timestamp: Date.now() });
          return JSON.stringify({ success: true, property: res.data?.property, note: 'Draft created. Add photos and details in the /properties workbench, then publish.' });
        }
        case 'publish_listing': {
          if (!property_id) return JSON.stringify({ success: false, error: 'property_id is required' });
          const res = await callApi(jwt, workspaceId, 'publish-property', { property_id });
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          // real-estate-api returns a 422 { code:'publish_blocked', errors } — surfaced via res.error above.
          onChunk?.({ type: 'real_estate_listing_published', property: res.data?.property, warnings: res.data?.warnings ?? [], timestamp: Date.now() });
          return JSON.stringify({ success: true, published: true, warnings: res.data?.warnings ?? [] });
        }
        case 'schedule_viewing': {
          if (!property_id || !scheduled_at) return JSON.stringify({ success: false, error: 'property_id and scheduled_at (ISO datetime) are required' });
          const res = await callApi(jwt, workspaceId, 'create-viewing', { property_id, scheduled_at });
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          onChunk?.({ type: 'real_estate_viewing_scheduled', viewing: res.data?.viewing, timestamp: Date.now() });
          return JSON.stringify({ success: true, viewing: res.data?.viewing, note: 'Added to your calendar with a reminder.' });
        }
        case 'draft_description': {
          if (!property_id) return JSON.stringify({ success: false, error: 'property_id is required' });
          const res = await callApi(jwt, workspaceId, 'draft-description', { property_id });
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          onChunk?.({ type: 'real_estate_description_draft', draft: res.data, timestamp: Date.now() });
          return JSON.stringify({ success: true, title: res.data?.title, description_en: res.data?.description_en, credits: res.data?.credits, note: 'Draft copy — review and Save it on the listing.' });
        }
        default:
          return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
      }
    },
    {
      name: 'manage_real_estate',
      description: [
        'Manage the workspace real-estate portfolio, leads, and viewings (Real Estate module).',
        'Reads (0 credits):',
        '  • list_properties — listings; optional status or property_type filter.',
        '  • get_property     — one listing with photo/inquiry counts (needs property_id).',
        '  • find_leads       — inquiries/leads; optional status/property_id. An invited agent sees only their own.',
        'Writes:',
        '  • create_listing   — create a DRAFT listing (title + property_type + transaction_type; optional price, town). Returns the id to finish in the workbench.',
        '  • publish_listing  — take a listing live (needs property_id). Fails with the missing fields if compliance requirements aren’t met (GR: energy class + Electronic Building ID, short-let: ΑΜΑ).',
        '  • schedule_viewing — book a viewing (needs property_id + scheduled_at ISO datetime). Syncs to the calendar with a reminder.',
        '  • draft_description — AI-generate listing copy (needs property_id). CREDIT-METERED. Returns a draft to review, does not auto-save.',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['list_properties', 'get_property', 'find_leads', 'create_listing', 'publish_listing', 'schedule_viewing', 'draft_description']).describe('Which action to run.'),
        status: z.string().optional().describe('Filter by listing_status (properties) or inquiry status (leads).'),
        property_type: z.string().optional().describe('residential/commercial/land/other — filter, or category for create_listing.'),
        transaction_type: z.string().optional().describe('sale/rent/short_let/business_transfer — for create_listing.'),
        title: z.string().optional().describe('Listing title for create_listing.'),
        price: z.number().optional().describe('Asking price for create_listing.'),
        town: z.string().optional().describe('Town/area for create_listing.'),
        scheduled_at: z.string().optional().describe('ISO datetime for schedule_viewing.'),
        property_id: z.string().optional().describe('Target a specific listing (required for get_property/publish/schedule/draft).'),
      }),
    },
  );
};
