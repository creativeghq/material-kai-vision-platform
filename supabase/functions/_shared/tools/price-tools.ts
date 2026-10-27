/**
 * Price Tools: price_lookup (admin/owner only)
 *
 * Searches the Pricing category of the Knowledge Base and returns structured
 * matches so the agent can compose a reasoning chain (list price × discount rules).
 */

import { resolveContactPricingSource } from '../crm/party-inheritance.ts';

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type PriceDocType = 'price_list' | 'discount_rule' | 'contract_terms' | 'promotion' | 'supplier_cost_list';

interface CustomerDiscount {
  kind: 'company' | 'contact';
  id: string;
  name: string;
  discount_percent: number | null;
  discount_notes: string | null;
}

/**
 * Lookup the standing customer discount from CRM. Either the company OR the
 * contact will resolve, never both (matches the quotes.customer_company_id ⊕
 * customer_contact_id XOR constraint). Returns null when neither id is set,
 * the row is missing, or the row has no discount on file.
 */
async function loadCustomerDiscount(
  workspaceId: string,
  customer_company_id?: string,
  customer_contact_id?: string,
): Promise<CustomerDiscount | null> {
  if (!customer_company_id && !customer_contact_id) return null;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  // No workspace, no lookup. Failing closed matters more than usual here: the caller passes the
  // tool's server-derived workspace, so an empty one means something upstream changed shape, and
  // continuing would restore exactly the unscoped query this parameter exists to prevent.
  if (!workspaceId) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (customer_company_id) {
    const { data } = await supabase
      .from('crm_companies')
      .select('id, name, discount_percent, discount_notes')
      .eq('id', customer_company_id)
      // BOLA (#352 A2, security invariant 1). Both ids are MODEL-supplied tool arguments and
      // this is a service-role client, which CLAUDE.md names as the recurring root cause of
      // pentest #250: "service-role client + trust a body-supplied id". Without this filter,
      // workspace A could pass a workspace B company UUID and get back B's name,
      // `discount_percent` and `discount_notes` — and A's pricing guidance was then computed
      // from B's discount.
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!data) return null;
    return {
      kind: 'company',
      id: data.id,
      name: data.name,
      discount_percent: data.discount_percent ?? null,
      discount_notes: data.discount_notes ?? null,
    };
  }

  const { data } = await supabase
    .from('crm_contacts')
    .select('id, name, discount_percent, discount_notes')
    .eq('id', customer_contact_id!)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data) return null;
  // A contact attached to a business uses that company's pricing; an unattached
  // contact uses its own. resolveContactPricingSource returns the right row.
  const source = await resolveContactPricingSource(supabase, data);
  return {
    kind: 'contact',
    id: data.id,
    name: data.name,
    discount_percent: source.discount_percent ?? null,
    discount_notes: source.discount_notes ?? null,
  };
}

interface PriceMatch {
  doc_id?: string;
  doc_title: string;
  doc_type: PriceDocType | 'unknown';
  snippet: string;
  relevance_score: number;
  category_slug?: string;
}

interface ReasoningHints {
  total_matches: number;
  by_type: Record<string, number>;
  has_price_list: boolean;
  has_discount_rule: boolean;
  has_contract_terms: boolean;
  has_promotion: boolean;
  manufacturer_hint?: string;
}

/** LangChain Tool: Price Lookup from KB (admin-gated) */
export const createPriceLookupTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({
      product_name,
      sku,
      manufacturer,
      quantity,
      unit,
      category_slug = 'pricing',
      top_k = 8,
      product_id,
      customer_company_id,
      customer_contact_id,
    }) => {
      try {
        onChunk?.({
          type: 'tool_progress',
          status: `Searching price knowledge base for "${product_name}"...`,
          timestamp: Date.now(),
        });

        // Customer-side standing discount (CRM-managed). Looked up in parallel
        // with the KB search so the agent's reasoning chain can compose both
        // the supplier/contract layer (from KB docs) and the customer layer
        // (from crm_companies/contacts) into a single proposed unit price.
        const customerDiscountPromise = loadCustomerDiscount(
          // Server-derived, from the tool factory — never from the model's arguments.
          workspaceId,
          customer_company_id,
          customer_contact_id,
        ).catch((err) => {
          console.warn('price_lookup: customer discount lookup failed', err);
          return null;
        });

        const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

        // Build a tight query: prefer SKU if present, then manufacturer+name, else just name.
        const queryParts = [product_name];
        if (sku) queryParts.push(`SKU ${sku}`);
        if (manufacturer) queryParts.push(manufacturer);
        const query = queryParts.join(' ').trim();

        let resolvedPrices: any[] = [];
        let resolvedError: string | null = null;
        let supplierLines: any[] = [];
        if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          try {
            const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const { data: rrows, error: rerr } = await sb.rpc('resolve_purchase_prices', {
              p_workspace_id: workspaceId,
              p_query: [product_name, manufacturer, sku].filter(Boolean).join(' '),
              p_limit: 8,
            });
            if (rerr) resolvedError = rerr.message;
            else resolvedPrices = rrows ?? [];
            if (!rerr && resolvedPrices.length === 0) {
              const { data: sh } = await sb.rpc('price_supplier_hints', { p_workspace_id: workspaceId, p_query: [product_name, manufacturer, sku].filter(Boolean).join(' ') });
              supplierLines = sh ?? [];
            }
          } catch (e) {
            resolvedError = e instanceof Error ? e.message : String(e);
          }
        }
        const hasResolved = resolvedPrices.length > 0;
        const resolvedGuidance = hasResolved
          ? [
              'RESOLVED PRICES (derived in SQL from the structured price store — use these numbers verbatim, never recompute):',
              '- status purchase_price / discount_applied: final_net and final_gross are what we pay. Quote them as is and name the supplier, list and price_label.',
              '- status list_price_conditional_rule or list_price_no_rule: the printed price is a LIST price. Do NOT present it as the purchase price. Show conditional_options (each with its own condition and net_if_applied) and say which condition decides it; if the same supplier has a purchase_price row for the same item, that row wins.',
              '- Always repeat the warnings array to the admin.',
              '- When you call submit_price_proposal, cite resolved_prices[].doc_id in source_doc_ids.',
            ].join('\n')
          : null;

        if (hasResolved) {
          onChunk?.({
            type: 'price_resolution',
            workspace_id: workspaceId,
            rows: resolvedPrices.slice(0, 5).map((r: any) => ({
              row_id: r.row_id,
              doc_id: r.doc_id,
              supplier: r.supplier,
              item_text: r.item_text,
              price_label: r.price_label,
              unit: r.unit,
              currency: r.currency,
              effective_date: r.effective_date,
              price_role: r.price_role,
              printed_net: r.printed_net,
              final_net: r.final_net,
              final_gross: r.final_gross,
              vat_rate: r.vat_rate,
              status: r.status,
              warnings: r.warnings,
              conditional_options: r.conditional_options,
            })),
            timestamp: Date.now(),
          });
        }
        const kbFailure = (msg: string): string =>
          hasResolved
            ? JSON.stringify({
                success: true,
                kb_search_error: msg,
                query_used: query,
                matches: [],
                resolved_prices: resolvedPrices,
                resolved_prices_error: resolvedError,
                guidance: resolvedGuidance,
              })
            : JSON.stringify({ success: false, error: msg, matches: [] });

        const body: Record<string, any> = {
          query,
          workspace_id: workspaceId,
          search_types: ['kb_docs'],
          top_k,
          similarity_threshold: 0.35, // lower — price docs use different vocabulary than catalog
          caller: 'admin',
          category_slug,
        };

        const TIMEOUT_MS = 45000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let data: any;
        try {
          // MIVAA KB search now requires auth — authenticate as the platform service.
          const mivaaKey = Deno.env.get('MIVAA_API_KEY') || Deno.env.get('MATERIAL_KAI_API_KEY') || '';
          const response = await fetch(`${MIVAA_GATEWAY_URL}/api/rag/search/knowledge-base`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(mivaaKey ? { Authorization: `Bearer ${mivaaKey}` } : {}),
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`price_lookup: KB search failed: ${response.status} ${errorText}`);
            return kbFailure(`Knowledge Base search failed (${response.status}). Cannot determine price from documents.`);
          }

          data = await response.json();

          const kbBranch = data?.search_metadata?.branch_status?.kb_docs;
          if (typeof kbBranch === 'string' && kbBranch.startsWith('failed')) {
            console.error(`price_lookup: kb_docs branch failed: ${kbBranch}`);
            return kbFailure(`Knowledge Base search failed (${kbBranch.slice(0, 120)}). This is an error, not "no price on file" — retry before telling the user nothing exists.`);
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
          return kbFailure(isAbort ? 'Price lookup timed out.' : `Network error: ${String(fetchErr)}`);
        }

        // Procurement cost lists feed products.cost; they are confidential and are not a quote price.
        const rawChunks: any[] = (data?.chunks || []).filter((c: any) => c.price_doc_type !== 'supplier_cost_list');
        const matches: PriceMatch[] = rawChunks.map((c: any) => ({
          doc_id: c.id,
          doc_title: c.document_title || c.title || 'Untitled',
          doc_type: (c.price_doc_type as PriceDocType | undefined) || 'unknown',
          snippet: String(c.content || '').slice(0, 800),
          relevance_score: Number(c.relevance_score || c.similarity_score || 0),
          category_slug: c.category_slug,
        }));

        // Reasoning hints to guide Claude's response composition
        const byType: Record<string, number> = {};
        for (const m of matches) {
          byType[m.doc_type] = (byType[m.doc_type] || 0) + 1;
        }
        const hints: ReasoningHints = {
          total_matches: matches.length,
          by_type: byType,
          has_price_list: (byType['price_list'] || 0) > 0,
          has_discount_rule: (byType['discount_rule'] || 0) > 0,
          has_contract_terms: (byType['contract_terms'] || 0) > 0,
          has_promotion: (byType['promotion'] || 0) > 0,
          manufacturer_hint: manufacturer,
        };

        // Resolve the customer-side discount (await the parallel lookup we kicked off
        // before the KB search). Either company or contact, never both.
        const customerDiscount = await customerDiscountPromise;
        const hasCustomerDiscount =
          customerDiscount != null &&
          customerDiscount.discount_percent != null &&
          customerDiscount.discount_percent > 0;

        // Emit a progress update for the UI
        onChunk?.({
          type: 'tool_progress',
          status: `Found ${matches.length} price reference(s). Composing proposal...`,
          timestamp: Date.now(),
        });

        // Emit a lightweight pre-proposal chunk so the UI can show the sources immediately.
        // The agent will produce the final price_proposal chunk from its reasoning in a follow-up message.
        if (matches.length > 0 || hasCustomerDiscount) {
          onChunk?.({
            type: 'price_lookup_matches',
            product_name,
            sku,
            manufacturer,
            quantity,
            unit,
            product_id,
            matches: matches.map((m) => ({
              doc_id: m.doc_id,
              doc_title: m.doc_title,
              doc_type: m.doc_type,
              snippet: m.snippet,
              relevance_score: m.relevance_score,
            })),
            hints,
            customer_discount: customerDiscount,
            timestamp: Date.now(),
          });
        }

        const customerLine = hasCustomerDiscount
          ? `CUSTOMER DISCOUNT — ${customerDiscount!.name} (CRM ${customerDiscount!.kind}) has a standing discount of ${customerDiscount!.discount_percent}% on file${
              customerDiscount!.discount_notes ? ` ("${customerDiscount!.discount_notes}")` : ''
            }. Apply this AFTER any supplier/catalog discounts: final = list × (1 - supplier_discount) × (1 - customer_discount).`
          : null;

        const baseSteps = [
          '1. Identify the base LIST PRICE (from price_list docs). Prefer exact SKU matches.',
          '2. Identify any applicable SUPPLIER DISCOUNTS or CONTRACT TERMS (same manufacturer, from KB docs).',
          '3. Check effective dates — flag expired rules.',
          '4. Verify UNIT (€/m² vs €/piece) matches the quote line expected unit.',
          '5. Apply QUANTITY tiers / MOQ if present in snippets.',
        ];
        const compositionSteps = hasCustomerDiscount
          ? [
              '6. Compose the price in TWO layers: (a) supplier layer — list × (1 - supplier_discount); (b) customer layer — × (1 - customer_discount). Show both lines in the reasoning_chain so the admin can audit.',
              '7. If a conflict exists (specific SKU price vs general rule), prefer specific and flag the conflict.',
              '8. Call submit_price_proposal with: list_price, supplier_discount_percents[] (the cascade exactly as printed, e.g. [30,15,5,3]), the customer ids you were given, currency, unit, quantity, source_doc_ids[], reasoning_chain[] (show both layers as separate lines), warnings[], confidence (high|medium|low). The platform computes the final price and total - do not do the arithmetic yourself.',
              '9. If you cannot determine a reliable LIST PRICE, set confidence="low" and ask the admin to confirm or enter manually. The customer discount alone (without a list price) is not enough.',
            ]
          : [
              '6. If price list and discount both exist: final = list × (1 - discount).',
              '7. If there is a conflict (specific SKU price vs general rule), prefer specific and flag the conflict.',
              '8. Call submit_price_proposal with: list_price, supplier_discount_percents[] (the cascade exactly as printed, e.g. [30,15,5,3]), currency, unit, quantity, source_doc_ids[], reasoning_chain[], warnings[], confidence (high|medium|low). The platform computes the final price and total - do not do the arithmetic yourself.',
              '9. If you cannot determine a reliable price, set confidence="low" and ask the admin to confirm or enter manually.',
            ];

        const guidance = matches.length === 0 && !hasCustomerDiscount && !hasResolved
          ? 'No matching price documents found and no customer discount on file. Respond: "No pricing information found in the Knowledge Base for this product. Please enter price manually."'
          : matches.length === 0 && hasCustomerDiscount
            ? `No KB price documents matched, but ${customerDiscount!.name} has a ${customerDiscount!.discount_percent}% discount on file. Without a list price you cannot compute a final price. Respond: "No catalog price found in the Knowledge Base — please enter the list price manually. I will apply the ${customerDiscount!.discount_percent}% customer discount on top." Emit confidence="low".`
            : [
                resolvedGuidance,
                'Compose a reasoning chain using the matches below.',
                customerLine,
                'Steps:',
                ...baseSteps,
                ...compositionSteps,
              ]
                .filter(Boolean)
                .join('\n');

        return JSON.stringify({
          success: true,
          query_used: query,
          matches,
          resolved_prices: resolvedPrices,
          resolved_prices_error: resolvedError,
          supplier_product_lines: supplierLines.length > 0 ? supplierLines : undefined,
          supplier_product_lines_note: supplierLines.length > 0
            ? 'The query names a supplier but no price row matched the other words. Do NOT guess a price: list these product lines and ask which product (name or size) is meant.'
            : undefined,
          hints,
          guidance,
          customer_discount: customerDiscount,
          product_context: {
            product_name,
            sku,
            manufacturer,
            quantity,
            unit,
            product_id,
            customer_company_id,
            customer_contact_id,
          },
        });
      } catch (error) {
        console.error('price_lookup error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Price lookup failed',
          matches: [],
        });
      }
    },
    {
      name: 'price_lookup',
      description: 'Look up a product price from the Pricing Knowledge Base (admin only). Returns structured chunks from price lists, discount rules, contract terms, and promotions — and, when a quote customer is in scope, the customer\'s standing CRM-managed discount. After this call, call submit_price_proposal with the list price and the supplier discount cascade you found; the platform applies the cascade and the customer layer and shows the proposal with its reasoning. Use when an admin asks for a price, or when triggered from the product detail page or a quote line.',
      schema: z.object({
        product_name: z.string().describe('Full product name to look up.'),
        sku: z.string().optional().describe('SKU if known — strongest match signal.'),
        manufacturer: z.string().optional().describe('Manufacturer name — narrows discount rule scope.'),
        quantity: z.number().optional().describe('Quote line quantity — used for MOQ/tier math.'),
        unit: z.string().optional().describe('Expected unit (e.g. "m²", "piece", "box") — used for sanity check.'),
        category_slug: z.string().default('pricing').describe('KB category slug to search. Defaults to "pricing".'),
        top_k: z.number().default(8).describe('Max number of price chunks to return.'),
        product_id: z.string().optional().describe('Product UUID — passed through to the price_proposal chunk so the UI can commit back to the right product.'),
        customer_company_id: z.string().optional().describe('CRM company UUID of the quote customer (B2B). When set, the tool reads crm_companies.discount_percent and folds the customer-side discount into the reasoning chain. Mutually exclusive with customer_contact_id.'),
        customer_contact_id: z.string().optional().describe('CRM contact UUID of the quote customer (B2C / private). When set, the tool reads crm_contacts.discount_percent and folds the customer-side discount into the reasoning chain. Mutually exclusive with customer_company_id.'),
      }),
    },
  );
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** LangChain Tool: submit the price proposal the drawer shows (admin-gated). The server does the arithmetic. */
export const createSubmitPriceProposalTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({
      product_name,
      product_id,
      list_price,
      supplier_discount_percents,
      customer_company_id,
      customer_contact_id,
      currency,
      unit,
      quantity,
      source_doc_ids,
      reasoning_chain,
      warnings,
      confidence,
      effective_through,
    }) => {
      try {
        const warn: string[] = [...(warnings ?? [])];
        let confidenceOut: 'high' | 'medium' | 'low' = confidence === 'high' || confidence === 'low' ? confidence : 'medium';
        const capAtMedium = () => { if (confidenceOut === 'high') confidenceOut = 'medium'; };

        // Source documents come from the model: keep only the ones that exist in THIS workspace.
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const ids = Array.from(new Set(source_doc_ids ?? []));
        let docs: any[] = [];
        if (ids.length > 0 && workspaceId) {
          const { data } = await supabase
            .from('kb_docs')
            .select('id, title, status, price_doc_type, metadata')
            .eq('workspace_id', workspaceId)
            .in('id', ids);
          docs = data ?? [];
          const missing = ids.filter((id) => !docs.some((d) => d.id === id));
          if (missing.length > 0) {
            const { data: rows } = await supabase
              .from('kb_price_rows')
              .select('kb_doc_id, doc_slug')
              .eq('workspace_id', workspaceId)
              .in('kb_doc_id', missing)
              .limit(200);
            const bySrc = new Map((rows ?? []).map((r: any) => [r.kb_doc_id, r.doc_slug]));
            for (const [id, slug] of bySrc) docs.push({ id, title: slug, status: 'published', price_doc_type: null, metadata: { retrieval: 'structured' } });
          }
        }
        if (docs.length < ids.length) warn.push(`${ids.length - docs.length} cited source document(s) were not found in this workspace and were dropped.`);
        if (docs.some((d) => d.price_doc_type === 'supplier_cost_list')) {
          docs = docs.filter((d) => d.price_doc_type !== 'supplier_cost_list');
          warn.push('A cited procurement cost list was dropped: cost lists are confidential and are not a quote price source.');
        }
        if (docs.length === 0) {
          confidenceOut = 'low';
          warn.push('No verifiable source document is cited - confirm the price manually.');
        }
        if (docs.some((d) => d.status !== 'published' && d?.metadata?.retrieval !== 'structured')) {
          capAtMedium();
          warn.push('A cited source document is not published (archived or draft) - it may be outdated.');
        }

        const regimes = Array.from(new Set(docs.map((d) => d?.metadata?.vat_regime).filter(Boolean))) as string[];
        if (regimes.includes('unknown')) {
          capAtMedium();
          warn.push('VAT basis of the supplier price is not stated in the source - confirm before quoting.');
        }
        if (regimes.some((r) => r === 'eu_non_gr_net' || r === 'non_eu_net')) warn.push('Supplier price is NET with no VAT added (non-Greek supplier).');
        if (regimes.includes('gr_excl')) warn.push('Greek supplier price excludes VAT (24% is added on top).');
        if (regimes.includes('gr_incl')) warn.push('Greek supplier price already includes VAT.');
        if (docs.some((d) => d?.metadata?.supplier)) warn.push("This is the supplier's purchase price, not a customer price - apply your margin before quoting.");

        const isoDay = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
        const now = new Date();
        const cutoffDate = new Date(now);
        cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - 18);
        const [today, cutoff] = [isoDay(now), isoDay(cutoffDate)];
        const old = docs
          .map((d) => d?.metadata?.effective_date)
          .filter((d: unknown): d is string => typeof d === 'string' && ISO_DAY.test(d) && d < cutoff);
        if (old.length > 0) {
          capAtMedium();
          warn.push(`A cited price list is dated ${old.sort()[0]} (more than 18 months old).`);
        }
        if (effective_through && ISO_DAY.test(effective_through) && effective_through < today) {
          capAtMedium();
          warn.push(`The cited price validity ended on ${effective_through}.`);
        }

        let price = list_price;
        const lines: string[] = [`List price ${round2(list_price)} ${currency}${unit ? ` / ${unit}` : ''}`];
        for (const d of supplier_discount_percents ?? []) {
          price = price * (1 - d / 100);
          lines.push(`Supplier discount ${d}% -> ${round2(price)} ${currency}`);
        }
        if (customer_company_id || customer_contact_id) {
          const customer = await loadCustomerDiscount(workspaceId, customer_company_id, customer_contact_id).catch(() => undefined);
          const pct = customer?.discount_percent;
          if (customer === undefined || customer === null) {
            capAtMedium();
            warn.push('The customer discount could NOT be looked up (unknown customer for this workspace or a lookup error) - it is NOT applied.');
          } else if (pct != null && pct > 0 && pct < 100) {
            price = price * (1 - pct / 100);
            lines.push(`Customer discount ${pct}% (${customer.name}, CRM) -> ${round2(price)} ${currency}`);
          } else if (pct != null && (pct >= 100 || pct < 0)) {
            capAtMedium();
            warn.push(`The customer discount on file (${pct}%) is not a valid percentage - it is NOT applied.`);
          }
        }
        const finalUnit = round2(price);
        if (!(finalUnit > 0)) {
          confidenceOut = 'low';
          warn.push('The computed unit price is not positive - check the discounts.');
        }
        const discountPercent = round2((1 - price / list_price) * 100);
        const total = quantity != null ? round2(finalUnit * quantity) : null;

        const proposal = {
          type: 'price_proposal',
          product_id,
          product_name,
          list_price: round2(list_price),
          discount_percent: discountPercent,
          final_unit_price: finalUnit,
          currency,
          unit,
          quantity_applied: quantity ?? null,
          total,
          source_doc_ids: docs.map((d) => d.id),
          source_titles: docs.map((d) => d.title),
          reasoning_chain: [...(reasoning_chain ?? []), `Computed by the platform: ${lines.join(' | ')}`],
          warnings: warn,
          confidence: confidenceOut,
          effective_through: effective_through ?? null,
          timestamp: Date.now(),
        };
        onChunk?.(proposal);
        return JSON.stringify({ success: true, proposal });
      } catch (error) {
        console.error('submit_price_proposal error:', error);
        return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Proposal failed' });
      }
    },
    {
      name: 'submit_price_proposal',
      description: 'Submit the final price proposal for the admin to review (admin only). Call it ONCE, after price_lookup, with the list price and the supplier discount cascade exactly as printed in the cited documents. The platform verifies the cited documents, applies the supplier cascade and the CRM customer discount, and shows the proposal with its reasoning and warnings. Do not compute the final price yourself.',
      schema: z.object({
        product_name: z.string().describe('Product name the proposal is for.'),
        product_id: z.string().optional().describe('Product UUID if known.'),
        list_price: z.number().positive().describe('Unit list price as printed in the cited document, before any discount.'),
        supplier_discount_percents: z.array(z.number().min(0).max(95)).max(6).default([]).describe('Supplier discount cascade as printed, in order, e.g. [30,15,5,3] for "30 15 5 3". Empty when the price is already net.'),
        customer_company_id: z.string().optional().describe('CRM company UUID of the quote customer; the platform reads its standing discount itself.'),
        customer_contact_id: z.string().optional().describe('CRM contact UUID of the quote customer (when there is no company).'),
        currency: z.string().length(3).default('EUR').describe('ISO currency of the printed price.'),
        unit: z.string().optional().describe('Unit of the printed price (m2, piece, box ...). Omit if the document does not say.'),
        quantity: z.number().positive().optional().describe('Quote line quantity, for the total.'),
        source_doc_ids: z.array(z.string()).max(12).default([]).describe('IDs (doc_id from price_lookup matches) of the documents the numbers came from.'),
        reasoning_chain: z.array(z.string().max(400)).max(12).default([]).describe('Short audit lines: which document, which row, which discount.'),
        warnings: z.array(z.string().max(300)).max(8).default([]).describe('Conflicts, expired validity, unit mismatches, missing data.'),
        confidence: z.string().default('medium').describe('One of: high, medium, low.'),
        effective_through: z.string().optional().describe('Validity end date (YYYY-MM-DD) if the document states one.'),
      }),
    },
  );
};
