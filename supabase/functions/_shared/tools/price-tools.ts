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
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type PriceDocType = 'price_list' | 'discount_rule' | 'contract_terms' | 'promotion';

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
  customer_company_id?: string,
  customer_contact_id?: string,
): Promise<CustomerDiscount | null> {
  if (!customer_company_id && !customer_contact_id) return null;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (customer_company_id) {
    const { data } = await supabase
      .from('crm_companies')
      .select('id, name, discount_percent, discount_notes')
      .eq('id', customer_company_id)
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

/**
 * LangChain Tool: Price Lookup from KB (admin-gated)
 *
 * Returns top N chunks from the Pricing category. The agent is expected to:
 *  1. Read the snippets.
 *  2. Combine price_list + discount_rule / contract_terms where applicable.
 *  3. Apply MOQ/quantity tiers, effective dates, unit sanity.
 *  4. Emit a reasoning chain and final number (or say "cannot determine").
 *  5. Render the proposal via the `price_proposal` chunk for UI commit.
 */
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
            return JSON.stringify({
              success: false,
              error: `Knowledge Base search failed (${response.status}). Cannot determine price.`,
              matches: [],
            });
          }

          data = await response.json();
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
          return JSON.stringify({
            success: false,
            error: isAbort ? 'Price lookup timed out.' : `Network error: ${String(fetchErr)}`,
            matches: [],
          });
        }

        const rawChunks: any[] = data?.chunks || [];
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
              '8. Emit a `price_proposal` chunk with: list_price, discount_percent (combined effective % after BOTH layers, computed as 1 - (1-supplier)(1-customer)), final_unit_price, currency, unit, quantity_applied, total, source_doc_ids[], reasoning_chain[] (show both layers as separate lines), warnings[], confidence (high|medium|low).',
              '9. If you cannot determine a reliable LIST PRICE, set confidence="low" and ask the admin to confirm or enter manually. The customer discount alone (without a list price) is not enough.',
            ]
          : [
              '6. If price list and discount both exist: final = list × (1 - discount).',
              '7. If there is a conflict (specific SKU price vs general rule), prefer specific and flag the conflict.',
              '8. Emit a `price_proposal` chunk with: list_price, discount_percent, final_unit_price, currency, unit, quantity_applied, total, source_doc_ids[], reasoning_chain[], warnings[], confidence (high|medium|low).',
              '9. If you cannot determine a reliable price, set confidence="low" and ask the admin to confirm or enter manually.',
            ];

        const guidance = matches.length === 0 && !hasCustomerDiscount
          ? 'No matching price documents found and no customer discount on file. Respond: "No pricing information found in the Knowledge Base for this product. Please enter price manually."'
          : matches.length === 0 && hasCustomerDiscount
            ? `No KB price documents matched, but ${customerDiscount!.name} has a ${customerDiscount!.discount_percent}% discount on file. Without a list price you cannot compute a final price. Respond: "No catalog price found in the Knowledge Base — please enter the list price manually. I will apply the ${customerDiscount!.discount_percent}% customer discount on top." Emit confidence="low".`
            : [
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
      description: 'Look up a product price from the Pricing Knowledge Base (admin only). Returns structured chunks from price lists, discount rules, contract terms, and promotions — and, when a quote customer is in scope, the customer\'s standing CRM-managed discount. The agent composes the final price by combining the supplier/catalog layer with the customer layer and emits a `price_proposal` chunk with a visible reasoning chain. Use when an admin asks for a price, or when triggered from the product detail page or a quote line.',
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
