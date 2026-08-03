// Real Estate agent toolkit (`manage_real_estate`) for the `kai` agent. All-users; module +
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

import { serviceClient as svcClient } from '../supabase-client.ts';
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
    async ({ action, status, property_type, transaction_type, title, price, town, scheduled_at, property_id, work_order_title, work_order_description, sale_price, commission_pct, deal_id, stage, deal_value, buyer_contact_id, area, crm_contact_id }) => {
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
        case 'list_lettings': {
          const [tRes, mRes] = await Promise.all([
            callApi(jwt, workspaceId, 'list-tenancies', property_id ? { property_id } : {}),
            callApi(jwt, workspaceId, 'list-maintenance', { status: 'open' }),
          ]);
          if (!tRes.ok) return JSON.stringify({ success: false, error: tRes.error });
          const tenancies = tRes.data?.tenancies ?? [];
          const openWork = mRes.ok ? (mRes.data?.work_orders ?? []) : [];
          const lettingsPayload = {
            tenancy_count: tenancies.length,
            tenancies: tenancies.slice(0, 25).map((t: any) => ({ id: t.id, property: t.property?.title, tenant: t.tenant?.name, rent: t.rent_amount, currency: t.currency, frequency: t.rent_frequency, status: t.status })),
            open_work_orders: openWork.slice(0, 25).map((w: any) => ({ id: w.id, property: w.property?.title, title: w.title, priority: w.priority, status: w.status })),
          };
          onChunk?.({ type: 'real_estate_lettings', ...lettingsPayload, timestamp: Date.now() });
          return JSON.stringify({ success: true, ...lettingsPayload });
        }
        case 'log_maintenance': {
          if (!property_id || !work_order_title) return JSON.stringify({ success: false, error: 'property_id and work_order_title are required' });
          const res = await callApi(jwt, workspaceId, 'upsert-maintenance', { property_id, title: work_order_title, description: work_order_description });
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          onChunk?.({ type: 'real_estate_work_order', work_order: res.data?.work_order, timestamp: Date.now() });
          return JSON.stringify({ success: true, work_order: res.data?.work_order, note: 'Work order logged. Assign a contractor and track it in the listing Lettings tab.' });
        }
        case 'complete_sale': {
          if (!property_id || !sale_price) return JSON.stringify({ success: false, error: 'property_id and sale_price are required' });
          const res = await callApi(jwt, workspaceId, 'complete-sale', { property_id, sale_price, ...(commission_pct !== undefined ? { commission_pct } : {}) });
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          const s = res.data?.sale;
          onChunk?.({ type: 'real_estate_sale', sale: s, commission_net: s?.commission_base, currency: s?.currency, timestamp: Date.now() });
          return JSON.stringify({ success: true, sale: s, commission_net: s?.commission_base, currency: s?.currency, note: 'Listing marked sold and commission calculated. Issue the commission invoice from the listing Offers tab in Finance when ready.' });
        }
        case 'list_deals': {
          const res = await callApi(jwt, workspaceId, 'list-deals');
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          const deals = (res.data?.deals ?? []).filter((d: any) => d.status !== 'lost');
          const byStage: Record<string, any[]> = {};
          for (const d of deals) (byStage[d.stage] ??= []).push({ id: d.id, property: d.property?.title, buyer: d.buyer?.name, value: d.value, tasks: `${d.task_done}/${d.task_total}` });
          onChunk?.({ type: 'real_estate_deals', open_count: deals.length, by_stage: byStage, timestamp: Date.now() });
          return JSON.stringify({ success: true, open_count: deals.length, by_stage: byStage });
        }
        case 'manage_deal': {
          if (!property_id && !deal_id) return JSON.stringify({ success: false, error: 'property_id (to create) or deal_id (to update) is required' });
          const fields: Record<string, unknown> = {};
          if (deal_id) fields.deal_id = deal_id;
          if (property_id) fields.property_id = property_id;
          if (stage) fields.stage = stage;
          if (deal_value !== undefined) fields.value = deal_value;
          if (buyer_contact_id) fields.buyer_contact_id = buyer_contact_id;
          if (status === 'won' || status === 'lost' || status === 'open') fields.status = status;
          const res = await callApi(jwt, workspaceId, 'upsert-deal', fields);
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          onChunk?.({ type: 'real_estate_deal', deal: res.data?.deal, timestamp: Date.now() });
          return JSON.stringify({ success: true, deal: res.data?.deal });
        }
        case 'cma_report': {
          if (!property_id && !property_type) return JSON.stringify({ success: false, error: 'property_id or property_type is required' });
          const res = await callApi(jwt, workspaceId, 'cma-report', { property_id, property_type, town, area });
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          const r = res.data;
          const cma = { suggested_price: r?.suggestion?.estimate ?? null, price_range: r?.suggestion ? [r.suggestion.low, r.suggestion.high] : null, median_per_sqm: r?.stats?.median_per_sqm, comparables: r?.stats?.count, avg_days_on_market: r?.stats?.avg_days_on_market, currency: r?.subject?.currency };
          onChunk?.({ type: 'real_estate_cma', ...cma, timestamp: Date.now() });
          return JSON.stringify({ success: true, ...cma, note: 'Comps-based CMA. Open the CMA button on the listing to save a client PDF.' });
        }
        case 'list_investments': {
          const res = await callApi(jwt, workspaceId, 'list-investments');
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          const r = res.data;
          const invPayload = { portfolio: r?.portfolio, investments: (r?.investments ?? []).slice(0, 25).map((iv: any) => ({ property_id: iv.property_id, property: iv.property?.title, net_yield_pct: iv.metrics?.net_yield_pct, cap_rate_pct: iv.metrics?.cap_rate_pct, monthly_cash_flow: iv.metrics?.monthly_cash_flow })) };
          onChunk?.({ type: 'real_estate_investments', ...invPayload, timestamp: Date.now() });
          return JSON.stringify({ success: true, ...invPayload });
        }
        case 'buyer_portal_link': {
          const res = await callApi(jwt, workspaceId, 'list-buyer-requirements', crm_contact_id ? { crm_contact_id } : {});
          if (!res.ok) return JSON.stringify({ success: false, error: res.error });
          const base = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/$/, '');
          const portals = (res.data?.requirements ?? []).filter((r: any) => r.portal_token).map((r: any) => ({ buyer: r.contact?.name, label: r.label, url: `${base}/buyer/${r.portal_token}` }));
          onChunk?.({ type: 'real_estate_portals', count: portals.length, portals, timestamp: Date.now() });
          return JSON.stringify({ success: true, count: portals.length, portals, note: 'Share a portal URL with the buyer — it shows their live matches and lets them favourite + request viewings.' });
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
        '  • list_lettings    — active tenancies + open maintenance work orders (optional property_id).',
        '  • list_deals       — the deal pipeline, grouped by stage (lead→viewing→offer→under_offer→conveyancing→exchanged→completed).',
        '  • list_investments — investment portfolio roll-up + per-property yield/cash-flow (needs the Investments add-on).',
        '  • cma_report       — comparative market analysis: suggested price + comps stats (property_id, or property_type+town+area).',
        '  • buyer_portal_link— the shareable portal URL(s) for registered buyers (optional crm_contact_id).',
        'Writes:',
        '  • create_listing   — create a DRAFT listing (title + property_type + transaction_type; optional price, town). Returns the id to finish in the workbench.',
        '  • publish_listing  — take a listing live (needs property_id). Fails with the missing fields if compliance requirements aren’t met (GR: energy class + Electronic Building ID, short-let: ΑΜΑ).',
        '  • schedule_viewing — book a viewing (needs property_id + scheduled_at ISO datetime). Syncs to the calendar with a reminder.',
        '  • draft_description — AI-generate listing copy (needs property_id). CREDIT-METERED. Returns a draft to review, does not auto-save.',
        '  • log_maintenance  — raise a maintenance work order on a rental (needs property_id + work_order_title).',
        '  • complete_sale    — mark a listing sold + calculate commission (needs property_id + sale_price; optional commission_pct, else the listing’s stored rate). Does NOT issue the invoice — that’s a deliberate step in the workbench.',
        '  • manage_deal      — create a pipeline deal (property_id) or update one (deal_id): move stage, set deal_value/buyer_contact_id, or set status won/lost/open.',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['list_properties', 'get_property', 'find_leads', 'list_lettings', 'list_deals', 'list_investments', 'cma_report', 'buyer_portal_link', 'create_listing', 'publish_listing', 'schedule_viewing', 'draft_description', 'log_maintenance', 'complete_sale', 'manage_deal']).describe('Which action to run.'),
        status: z.string().optional().describe('Filter by listing_status (properties) or inquiry status (leads).'),
        property_type: z.string().optional().describe('residential/commercial/land/other — filter, or category for create_listing.'),
        transaction_type: z.string().optional().describe('sale/rent/short_let/business_transfer — for create_listing.'),
        title: z.string().optional().describe('Listing title for create_listing.'),
        price: z.number().optional().describe('Asking price for create_listing.'),
        town: z.string().optional().describe('Town/area for create_listing.'),
        scheduled_at: z.string().optional().describe('ISO datetime for schedule_viewing.'),
        property_id: z.string().optional().describe('Target a specific listing (required for get_property/publish/schedule/draft/log_maintenance).'),
        work_order_title: z.string().optional().describe('Maintenance issue summary for log_maintenance.'),
        work_order_description: z.string().optional().describe('Optional detail for log_maintenance.'),
        sale_price: z.number().optional().describe('Agreed final sale price for complete_sale.'),
        commission_pct: z.number().optional().describe('Commission percent for complete_sale (defaults to the listing’s stored rate).'),
        deal_id: z.string().optional().describe('Target a pipeline deal for manage_deal (update/move/win/lose).'),
        stage: z.string().optional().describe('Pipeline stage for manage_deal: lead/viewing/offer/under_offer/conveyancing/exchanged/completed.'),
        deal_value: z.number().optional().describe('Deal value for manage_deal.'),
        buyer_contact_id: z.string().optional().describe('CRM contact id of the buyer for manage_deal.'),
        area: z.number().optional().describe('Floor area (m²) for an ad-hoc cma_report.'),
        crm_contact_id: z.string().optional().describe('Filter buyer_portal_link to one CRM contact.'),
      }),
    },
  );
};
