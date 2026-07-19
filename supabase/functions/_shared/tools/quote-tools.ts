/**
 * Quote Tools — agent-chat surface for the Quotes module.
 *
 * Tools:
 *   - create_quote        — create a REAL quote (quotes + quote_items rows) from a
 *                           list of catalog and/or custom line items, run the same
 *                           pricing + totals engine the web UI uses, then generate the
 *                           branded PDF via the shared `generate-quote-pdf` edge fn and
 *                           open it in the Studio canvas.
 *   - generate_quote_pdf  — (re)generate the PDF for an existing quote by id.
 *   - list_my_quotes      — the user's recent quotes with status + totals.
 *
 * This mirrors `QuotesService` / `QuotePDFService` exactly so a quote the agent
 * builds is a first-class quote — it shows up (and is editable) in the Quotes
 * module UI with the same PDF. Pricing:
 *   - catalog line (product_id, no explicit price) → `get_product_price_for_workspace`
 *     audience 'seller' → suggested_sell / retail / cost_basis (same as addItem).
 *   - explicit unit_price → used verbatim (custom items or price override).
 * Totals replicate `QuotePDFService.saveItemPrices` (subtotal → optional cash
 * discount when paid_upfront → VAT → grand_total).
 *
 * Security: user_id + workspace_id are server-derived from the verified JWT (never
 * from the model), satisfying the tenancy-binding + mass-assignment invariants. The
 * PDF invoke carries the user's JWT so `generate-quote-pdf`'s workspace-membership
 * check passes. Quote DB tools are 0 credits (no AI spend; the PDF is deterministic).
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// One line item as the model supplies it. Either `product_id` (catalog, auto-priced)
// or `name` + `unit_price` (custom). `unit_price` on a catalog line overrides pricing.
const itemSchema = z.object({
  product_id: z.string().uuid().optional().describe('Catalog product UUID. When set and no unit_price is given, the seller price is resolved automatically from the workspace pricing rules.'),
  name: z.string().optional().describe('Custom product name (required when product_id is not set).'),
  description: z.string().optional().describe('Custom product description.'),
  sku: z.string().optional().describe('Custom SKU / code.'),
  unit: z.string().optional().describe("Unit of measure for a custom item, e.g. 'sqm', 'pcs', 'm'. Defaults to 'pcs'."),
  quantity: z.number().positive().describe('Quantity (e.g. 75 for 75 sqm).'),
  unit_price: z.number().nonnegative().optional().describe('Unit price ex-VAT. Required for custom items; on a catalog line it overrides the auto-resolved price.'),
  discounted_price: z.number().nonnegative().optional().describe('Optional per-line discounted unit price; wins over unit_price for the line total.'),
  image_url: z.string().optional().describe('Optional image URL for a custom item (ignored for catalog items, which use the product image).'),
  room: z.string().optional().describe('FF&E: room / area this item belongs to.'),
  dimensions: z.string().optional().describe('FF&E: dimensions, e.g. "120×60×45".'),
  installation_requirements: z.string().optional().describe('FF&E: installation notes shown in the Specifications section.'),
  delivery_date: z.string().optional().describe('FF&E: delivery date (YYYY-MM-DD).'),
});

type QuoteItemInput = z.infer<typeof itemSchema>;

interface ResolvedLine {
  payload: Record<string, unknown>;
  line_total: number;
  label: string;
}

/**
 * Resolve one input line into a quote_items insert payload + its line total.
 * Returns { error } when the line can't be priced (mirrors the PDF's rejection of
 * NULL-priced items — fail loudly rather than persist an unpriced quote).
 */
async function resolveLine(
  sb: ReturnType<typeof svcClient>,
  workspaceId: string,
  quoteId: string,
  item: QuoteItemInput,
  customerCompanyId: string | null,
  customerContactId: string | null,
): Promise<ResolvedLine | { error: string }> {
  const label = item.name || item.product_id || 'item';
  let unitPrice = item.unit_price ?? null;
  let retailPrice: number | null = null;
  let costSnapshot: number | null = null;
  let unpriced = false;

  // Catalog line without an explicit price → resolve the seller price the same way
  // QuotesService.addItem does (audience 'seller' folds in customer discounts).
  if (item.product_id && unitPrice == null) {
    const { data: priced } = await sb.rpc('get_product_price_for_workspace', {
      p_workspace_id: workspaceId,
      p_product_id: item.product_id,
      p_company_id: customerCompanyId,
      p_contact_id: customerContactId,
      p_audience: 'seller',
    });
    const p = (priced || {}) as Record<string, unknown>;
    unitPrice = p.suggested_sell != null ? Number(p.suggested_sell) : null;
    retailPrice = p.retail != null ? Number(p.retail) : null;
    costSnapshot = p.cost_basis != null ? Number(p.cost_basis) : null;
    unpriced = p.unpriced === true;
  }

  // #237 Phase 4: a catalog product the resolver can't price becomes a "call for price"
  // line (NULL price, excluded from totals, RFQ-able) rather than a hard error.
  const callForPrice = item.product_id != null && (unitPrice == null || Number.isNaN(unitPrice)) && (unpriced || item.unit_price == null);

  if (!callForPrice && (unitPrice == null || Number.isNaN(unitPrice))) {
    return {
      error: item.product_id
        ? `Could not resolve a price for product ${item.product_id}. Provide a unit_price for it.`
        : `Custom item "${label}" needs a unit_price.`,
    };
  }
  if (!item.product_id && !item.name) {
    return { error: 'Each custom line needs a name.' };
  }

  const effective = item.discounted_price != null ? item.discounted_price : unitPrice;
  const lineTotal = callForPrice ? null : round2((effective as number) * item.quantity);

  const payload: Record<string, unknown> = {
    quote_id: quoteId,
    quantity: item.quantity,
    unit_price: callForPrice ? null : round2(unitPrice as number),
    discounted_price: item.discounted_price != null ? round2(item.discounted_price) : null,
    line_total: lineTotal,
    pricing_status: callForPrice ? 'call_for_price' : 'priced',
    added_from: 'agent',
    room: item.room ?? null,
    dimensions: item.dimensions ?? null,
    installation_requirements: item.installation_requirements ?? null,
    delivery_date: item.delivery_date ?? null,
  };
  if (item.product_id) {
    payload.product_id = item.product_id;
    if (retailPrice != null) payload.retail_price = retailPrice;
    if (costSnapshot != null) payload.cost_snapshot = costSnapshot;
  } else {
    payload.custom_product_name = item.name;
    payload.custom_product_description = item.description ?? null;
    payload.custom_sku = item.sku ?? null;
    payload.custom_unit = item.unit || 'pcs';
    if (item.image_url) payload.custom_image_url = item.image_url;
  }
  return { payload, line_total: lineTotal, label };
}

/** create_quote */
export const createCreateQuoteTool = (
  userId: string,
  workspaceId: string,
  userJwt: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async (input: {
      name?: string;
      items: QuoteItemInput[];
      customer_company_id?: string;
      customer_contact_id?: string;
      notes?: string;
      vat_rate?: number;
      paid_upfront?: boolean;
      generate_pdf?: boolean;
    }) => {
      const sb = svcClient();
      try {
        if (!workspaceId) {
          return JSON.stringify({ success: false, error: 'No active workspace for this user.' });
        }
        const items = input.items || [];
        if (items.length === 0) {
          return JSON.stringify({ success: false, error: 'A quote needs at least one line item.' });
        }
        if (input.customer_company_id && input.customer_contact_id) {
          return JSON.stringify({ success: false, error: 'Set only one customer — a company OR a contact, not both.' });
        }
        const vatRate = input.vat_rate ?? 24;
        const generatePdf = input.generate_pdf !== false; // default true
        const customerCompanyId = input.customer_company_id ?? null;
        const customerContactId = input.customer_contact_id ?? null;

        // Verify any customer reference belongs to THIS workspace before linking it —
        // a body-supplied id must not create a cross-tenant linkage (CLAUDE.md invariant 1).
        if (customerCompanyId) {
          const { data: co } = await sb.from('crm_companies').select('id')
            .eq('id', customerCompanyId).eq('workspace_id', workspaceId).maybeSingle();
          if (!co) return JSON.stringify({ success: false, error: 'Customer company not found in this workspace.' });
        }
        if (customerContactId) {
          const { data: ct } = await sb.from('crm_contacts').select('id')
            .eq('id', customerContactId).eq('workspace_id', workspaceId).maybeSingle();
          if (!ct) return JSON.stringify({ success: false, error: 'Customer contact not found in this workspace.' });
        }

        onChunk?.({ type: 'tool_progress', status: 'Creating quote…', timestamp: Date.now() });

        // 1) Insert the draft quote. Trust/identity fields are server-set.
        const { data: quote, error: quoteErr } = await sb
          .from('quotes')
          .insert({
            user_id: userId,
            workspace_id: workspaceId,
            name: input.name || 'New Quote',
            notes: input.notes ?? null,
            status: 'draft',
            customer_company_id: customerCompanyId,
            customer_contact_id: customerContactId,
            vat_rate: vatRate,
            paid_upfront: Boolean(input.paid_upfront),
            currency: 'EUR',
          })
          .select('id')
          .single();
        if (quoteErr || !quote) {
          return JSON.stringify({ success: false, error: `Failed to create quote: ${quoteErr?.message || 'unknown error'}` });
        }
        const quoteId = (quote as any).id as string;

        // 2) Resolve + insert line items. On any pricing failure, roll back the quote
        //    so we never leave a half-built empty quote lying around.
        const rollback = async () => { await sb.from('quotes').delete().eq('id', quoteId); };
        const payloads: Record<string, unknown>[] = [];
        // Compact per-line summary for the canvas card's line-items accordion
        // (the branded PDF already shows full detail; this surfaces it as data too).
        const lineSummaries: Array<{ label: string; line_total: number; pricing_status?: string; room?: string | null }> = [];
        let subtotal = 0;
        for (const it of items) {
          const resolved = await resolveLine(sb, workspaceId, quoteId, it, customerCompanyId, customerContactId);
          if ('error' in resolved) {
            await rollback();
            return JSON.stringify({ success: false, error: resolved.error });
          }
          payloads.push(resolved.payload);
          lineSummaries.push({
            label: resolved.label,
            line_total: resolved.line_total ?? 0,
            pricing_status: (resolved.payload as any).pricing_status,
            room: ((resolved.payload as any).room ?? null) as string | null,
          });
          subtotal += resolved.line_total ?? 0; // call-for-price lines contribute 0 to the total
        }
        const { error: itemsErr } = await sb.from('quote_items').insert(payloads);
        if (itemsErr) {
          await rollback();
          return JSON.stringify({ success: false, error: `Failed to add items: ${itemsErr.message}` });
        }

        // 3) Totals — replicate QuotePDFService.saveItemPrices (cash discount → VAT).
        let cashPct = 0;
        if (input.paid_upfront) {
          const { data: rule } = await sb
            .from('pricing_custom_rules')
            .select('discount_pct')
            .eq('workspace_id', workspaceId)
            .eq('rule_type', 'cash_payment')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .limit(1);
          cashPct = rule && rule[0] ? Number((rule[0] as any).discount_pct) || 0 : 0;
        }
        const netAfterCash = subtotal * (1 - cashPct / 100);
        const vatAmount = netAfterCash * (vatRate / 100);
        const grandTotal = netAfterCash + vatAmount;
        await sb.from('quotes').update({
          subtotal: round2(subtotal),
          vat_rate: vatRate,
          vat_amount: round2(vatAmount),
          grand_total: round2(grandTotal),
          cash_discount_pct: cashPct,
          total_items: payloads.length,
          updated_at: new Date().toISOString(),
        }).eq('id', quoteId);

        // 4) Generate the branded PDF via the shared edge fn (user JWT → membership check passes).
        let pdfUrl: string | null = null;
        let quoteNumber: string | null = null;
        if (generatePdf) {
          onChunk?.({ type: 'tool_progress', status: 'Rendering the quote PDF…', timestamp: Date.now() });
          const { data: pdfRes, error: pdfErr } = await sb.functions.invoke('generate-quote-pdf', {
            body: { quote_id: quoteId },
            headers: { Authorization: `Bearer ${userJwt}` },
          });
          if (pdfErr || !pdfRes?.success) {
            // Quote + items are saved; only the PDF failed. Surface it but don't roll back.
            onChunk?.({
              type: 'quote_created',
              quote_id: quoteId,
              name: input.name || 'New Quote',
              currency: 'EUR',
              subtotal: round2(subtotal),
              cash_discount_pct: cashPct,
              vat_rate: vatRate,
              vat_amount: round2(vatAmount),
              grand_total: round2(grandTotal),
              item_count: payloads.length,
              items: lineSummaries,
              pdf_url: null,
              pdf_error: pdfErr?.message || pdfRes?.error || 'PDF generation failed',
            });
            return JSON.stringify({
              success: true,
              quote_id: quoteId,
              grand_total: round2(grandTotal),
              warning: `Quote saved but PDF generation failed: ${pdfErr?.message || pdfRes?.error || 'unknown'}. It can be regenerated from the Quotes page.`,
            });
          }
          pdfUrl = pdfRes.pdf_url ?? null;
          quoteNumber = pdfRes.quote_number ?? null;
        }

        // 5) Open it on the canvas.
        onChunk?.({
          type: 'quote_created',
          quote_id: quoteId,
          quote_number: quoteNumber,
          name: input.name || 'New Quote',
          currency: 'EUR',
          subtotal: round2(subtotal),
          cash_discount_pct: cashPct,
          vat_rate: vatRate,
          vat_amount: round2(vatAmount),
          grand_total: round2(grandTotal),
          item_count: payloads.length,
          items: lineSummaries,
          pdf_url: pdfUrl,
        });

        return JSON.stringify({
          success: true,
          quote_id: quoteId,
          quote_number: quoteNumber,
          item_count: payloads.length,
          subtotal: round2(subtotal),
          vat_rate: vatRate,
          grand_total: round2(grandTotal),
          currency: 'EUR',
          pdf_generated: Boolean(pdfUrl),
          message: `Created quote${quoteNumber ? ` ${quoteNumber}` : ''} with ${payloads.length} item(s), total €${round2(grandTotal).toFixed(2)}. It's open on the canvas and available on the Quotes page.`,
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
    {
      name: 'create_quote',
      description:
        'Create a real, editable quote from a list of products and generate its branded PDF, then open it on the canvas. ' +
        'Use for "make/create/build a quote" requests. Each item is either a catalog product (pass product_id — the seller ' +
        'price is resolved automatically) or a custom item (pass name + unit_price + unit, e.g. 75 sqm at €34/sqm → ' +
        '{name:"Tagina", unit:"sqm", quantity:75, unit_price:34}). Optionally link a CRM customer (company OR contact). ' +
        'The quote is saved to the Quotes module and can be refined there. Returns the quote id, totals, and PDF.',
      schema: z.object({
        name: z.string().optional().describe('Quote title, e.g. "Tagina & Keros — Living room".'),
        items: z.array(itemSchema).min(1).describe('The line items. At least one.'),
        customer_company_id: z.string().uuid().optional().describe('CRM company UUID (B2B customer). Mutually exclusive with customer_contact_id.'),
        customer_contact_id: z.string().uuid().optional().describe('CRM contact UUID (B2C customer). Mutually exclusive with customer_company_id.'),
        notes: z.string().optional().describe('Free-text notes shown on the quote.'),
        vat_rate: z.number().optional().describe('VAT percentage. Defaults to 24.'),
        paid_upfront: z.boolean().optional().describe('When true, applies the workspace cash-payment discount before VAT.'),
        generate_pdf: z.boolean().optional().describe('Generate the PDF immediately (default true).'),
      }),
    },
  );
};

/** generate_quote_pdf — (re)generate the PDF for an existing quote the user owns. */
export const createGenerateQuotePdfTool = (
  userId: string,
  workspaceId: string,
  userJwt: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async (input: { quote_id: string; regenerate?: boolean }) => {
      const sb = svcClient();
      try {
        // Ownership: the quote must be in the caller's workspace (defence in depth on
        // top of generate-quote-pdf's own membership check).
        const { data: q } = await sb
          .from('quotes')
          .select('id, name, workspace_id, grand_total, currency')
          .eq('id', input.quote_id)
          .maybeSingle();
        if (!q || (q as any).workspace_id !== workspaceId) {
          return JSON.stringify({ success: false, error: 'Quote not found.' }); // 404-style, no enumeration
        }
        onChunk?.({ type: 'tool_progress', status: 'Rendering the quote PDF…', timestamp: Date.now() });
        const { data: pdfRes, error: pdfErr } = await sb.functions.invoke('generate-quote-pdf', {
          body: { quote_id: input.quote_id, regenerate: input.regenerate === true },
          headers: { Authorization: `Bearer ${userJwt}` },
        });
        if (pdfErr || !pdfRes?.success) {
          return JSON.stringify({ success: false, error: pdfErr?.message || pdfRes?.error || 'PDF generation failed' });
        }
        onChunk?.({
          type: 'quote_created',
          quote_id: input.quote_id,
          quote_number: pdfRes.quote_number ?? null,
          name: (q as any).name || 'Quote',
          currency: (q as any).currency || 'EUR',
          grand_total: (q as any).grand_total ?? null,
          pdf_url: pdfRes.pdf_url ?? null,
        });
        return JSON.stringify({ success: true, quote_id: input.quote_id, quote_number: pdfRes.quote_number ?? null, pdf_generated: true });
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
    {
      name: 'generate_quote_pdf',
      description: 'Generate (or regenerate) the branded PDF for an existing quote by id and open it on the canvas. Use after editing a quote or when the user asks to see/re-render a quote PDF.',
      schema: z.object({
        quote_id: z.string().uuid().describe('The quote id.'),
        regenerate: z.boolean().optional().describe('Force a fresh render even if a PDF already exists.'),
      }),
    },
  );
};

/** list_my_quotes — the user's recent quotes. */
export const createListMyQuotesTool = (
  userId: string,
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async (input: { limit?: number; status?: string }) => {
      const sb = svcClient();
      try {
        let q = sb
          .from('quotes')
          .select('id, name, status, quote_number, currency, grand_total, total_items, created_at')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(Math.min(input.limit ?? 10, 50));
        if (input.status) q = q.eq('status', input.status);
        const { data, error } = await q;
        if (error) return JSON.stringify({ success: false, error: error.message });
        const quotes = (data || []).map((r: any) => ({
          quote_id: r.id,
          name: r.name,
          status: r.status,
          quote_number: r.quote_number,
          currency: r.currency || 'EUR',
          grand_total: r.grand_total,
          item_count: r.total_items,
          created_at: r.created_at,
        }));
        onChunk?.({ type: 'quotes_list', quotes });
        return JSON.stringify({ success: true, count: quotes.length, quotes });
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
    {
      name: 'list_my_quotes',
      description: "List the workspace's recent quotes with status and totals. Use to reference or pick an existing quote (returns quote ids usable by generate_quote_pdf).",
      schema: z.object({
        limit: z.number().optional().describe('Max quotes to return (default 10, max 50).'),
        status: z.string().optional().describe("Optional status filter: draft / submitted / quoted / accepted / rejected / expired."),
      }),
    },
  );
};
