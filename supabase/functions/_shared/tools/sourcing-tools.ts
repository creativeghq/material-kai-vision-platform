/**
 * Sourcing Tools — agent-chat surface for the #237 sourcing/fulfillment spine.
 *
 * Tools (all 0-credit — internal flow, mirrors price/mention internal usage):
 *   - source_product        — rank supply options for a product (resolve_sourcing_options RPC)
 *   - create_purchase_order — commit a sourcing plan → allocations + draft POs (commit_sourcing_options RPC)
 *   - send_purchase_order   — email a PO to the supplier (generate-purchase-sheet-pdf {order_id, send})
 *
 * The RPCs are SECURITY DEFINER and gate on auth.uid() (resolve = workspace member,
 * commit = finance manager), so we call them with the USER's JWT — not the service
 * role — and surface any 42501 ('finance manager required') as a friendly error.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// User-context client so the RPC's auth.uid() membership/finance checks resolve.
function userClient(jwt?: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 1) source_product — rank supply options
// ───────────────────────────────────────────────────────────────────────────
export const createSourceProductTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, quantity, deliver_to_address_unit_id }) => {
      onChunk?.({ type: 'tool_progress', status: 'Resolving supply options…', timestamp: Date.now() });
      try {
        const sb = userClient(jwt);
        const { data, error } = await sb.rpc('resolve_sourcing_options', {
          p_workspace_id: workspaceId,
          p_product_id: product_id,
          p_qty: quantity,
          p_deliver_to_address_unit_id: deliver_to_address_unit_id ?? null,
        });
        if (error) return JSON.stringify({ success: false, error: error.message });

        const opts = (data?.options ?? {}) as Record<string, any[]>;
        const counts = {
          warehouse: opts.warehouse?.length ?? 0,
          inbound_po: opts.inbound_po?.length ?? 0,
          supplier: opts.supplier?.length ?? 0,
          marketplace: opts.marketplace?.length ?? 0,
        };
        onChunk?.({ type: 'sourcing_options', product_id, quantity, result: data, counts, timestamp: Date.now() });
        return JSON.stringify({ success: true, counts, options: data?.options, sell_price: data?.sell_price });
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'resolve failed' });
      }
    },
    {
      name: 'source_product',
      description:
        'Rank where stock for a product can come from (own warehouse by delivery proximity, uncommitted inbound purchase orders, and suppliers by cost/lead/MOQ). Returns the options + the operator sell price as a margin reference. Read-only, 0 credits.',
      schema: z.object({
        product_id: z.string().describe('Product UUID to source.'),
        quantity: z.number().positive().describe('Quantity required.'),
        deliver_to_address_unit_id: z.string().optional().describe('Optional crm_address_units id — ranks warehouses by proximity to this destination.'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 2) create_purchase_order — commit a sourcing plan
// ───────────────────────────────────────────────────────────────────────────
export const createCreatePurchaseOrderTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ demand_type, demand_id, selections, customer_company_id, customer_contact_id, deliver_to_address_unit_id, currency }) => {
      onChunk?.({ type: 'tool_progress', status: 'Committing sourcing plan…', timestamp: Date.now() });
      try {
        const sb = userClient(jwt);
        const { data, error } = await sb.rpc('commit_sourcing_options', {
          p_workspace_id: workspaceId,
          p_demand_type: demand_type,
          p_demand_id: demand_id,
          p_selections: selections,
          p_customer_company_id: customer_company_id ?? null,
          p_customer_contact_id: customer_contact_id ?? null,
          p_deliver_to_address_unit_id: deliver_to_address_unit_id ?? null,
          p_currency: currency ?? 'EUR',
        });
        if (error) {
          const friendly = error.message?.includes('finance manager')
            ? 'You need the finance-manager role to create purchase orders.'
            : error.message;
          return JSON.stringify({ success: false, error: friendly });
        }
        onChunk?.({ type: 'purchase_order_created', result: data, timestamp: Date.now() });
        return JSON.stringify({ success: true, ...data });
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'commit failed' });
      }
    },
    {
      name: 'create_purchase_order',
      description:
        'Commit a sourcing decision for one demand line: reserves warehouse stock, allocates against inbound POs, and groups supplier picks into draft purchase orders. Requires the finance-manager role. 0 credits.',
      schema: z.object({
        demand_type: z.enum(['order_item', 'quote_item']).describe('What the demand line is.'),
        demand_id: z.string().describe('The order_items.id or quote_items.id being sourced.'),
        selections: z.array(z.object({
          source_type: z.enum(['warehouse', 'inbound_po', 'supplier']),
          product_id: z.string().optional(),
          quantity: z.number().positive(),
          warehouse_item_id: z.string().optional().describe('Required when source_type=warehouse.'),
          supply_order_item_id: z.string().optional().describe('Required when source_type=inbound_po.'),
          supplier_company_id: z.string().optional().describe('Required when source_type=supplier (groups the draft PO).'),
          supplier_contact_id: z.string().optional(),
          unit_cost: z.number().optional().describe('Supplier unit cost (source_type=supplier).'),
          description: z.string().optional(),
        })).min(1).describe('Chosen supply options (from source_product).'),
        customer_company_id: z.string().optional().describe('Customer the demand is for (reserved-to-customer).'),
        customer_contact_id: z.string().optional(),
        deliver_to_address_unit_id: z.string().optional().describe('Deliver-to address (carried on the draft PO).'),
        currency: z.string().optional().describe('Defaults to EUR.'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 3) send_purchase_order — email the PO to the supplier
// ───────────────────────────────────────────────────────────────────────────
export const createSendPurchaseOrderTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ order_id, to, message }) => {
      onChunk?.({ type: 'tool_progress', status: 'Sending purchase order to supplier…', timestamp: Date.now() });
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-purchase-sheet-pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${jwt ?? SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ order_id, send: true, to, message }),
        });
        const text = await resp.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { data = text; }
        if (!resp.ok || !data?.success) {
          return JSON.stringify({ success: false, error: data?.error || `send failed (${resp.status})` });
        }
        onChunk?.({
          type: 'purchase_order_sent',
          order_id,
          order_number: data.order_number,
          recipient: data.recipient,
          pdf_url: data.pdf_url,
          timestamp: Date.now(),
        });
        return JSON.stringify({ success: true, order_number: data.order_number, recipient: data.recipient, pdf_url: data.pdf_url });
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'send failed' });
      }
    },
    {
      name: 'send_purchase_order',
      description:
        'Render a purchase order as a PDF and email it to the supplier, then mark the order placed. The supplier email is resolved from the order\'s own supplier contact/company. 0 credits.',
      schema: z.object({
        order_id: z.string().describe('The purchase order (orders.id with order_type=purchase) to send.'),
        to: z.string().optional().describe('Override recipient email.'),
        message: z.string().optional().describe('Optional note to include in the email.'),
      }),
    },
  );
};
