/**
 * Price Tools: price_lookup (admin/owner only)
 *
 * Searches the Pricing category of the Knowledge Base and returns structured
 * matches so the agent can compose a reasoning chain (list price × discount rules).
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');

type PriceDocType = 'price_list' | 'discount_rule' | 'contract_terms' | 'promotion';

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
    async ({ product_name, sku, manufacturer, quantity, unit, category_slug = 'pricing', top_k = 8, product_id }) => {
      try {
        onChunk?.({
          type: 'tool_progress',
          status: `Searching price knowledge base for "${product_name}"...`,
          timestamp: Date.now(),
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
          const response = await fetch(`${MIVAA_GATEWAY_URL}/api/rag/search/knowledge-base`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

        // Emit a progress update for the UI
        onChunk?.({
          type: 'tool_progress',
          status: `Found ${matches.length} price reference(s). Composing proposal...`,
          timestamp: Date.now(),
        });

        // Emit a lightweight pre-proposal chunk so the UI can show the sources immediately.
        // The agent will produce the final price_proposal chunk from its reasoning in a follow-up message.
        if (matches.length > 0) {
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
            timestamp: Date.now(),
          });
        }

        const guidance = matches.length === 0
          ? 'No matching price documents found. Respond: "No pricing information found in the Knowledge Base for this product. Please enter price manually."'
          : [
              'Compose a reasoning chain using the matches below.',
              'Steps:',
              '1. Identify the base LIST PRICE (from price_list docs). Prefer exact SKU matches.',
              '2. Identify any applicable DISCOUNTS or CONTRACT TERMS (same manufacturer).',
              '3. Check effective dates — flag expired rules.',
              '4. Verify UNIT (€/m² vs €/piece) matches the quote line expected unit.',
              '5. Apply QUANTITY tiers / MOQ if present in snippets.',
              '6. If price list and discount both exist: final = list × (1 - discount).',
              '7. If there is a conflict (specific SKU price vs general rule), prefer specific and flag the conflict.',
              '8. Emit a `price_proposal` chunk with: list_price, discount_percent, final_unit_price, currency, unit, quantity_applied, total, source_doc_ids[], reasoning_chain[], warnings[], confidence (high|medium|low).',
              '9. If you cannot determine a reliable price, set confidence="low" and ask the admin to confirm or enter manually.',
            ].join('\n');

        return JSON.stringify({
          success: true,
          query_used: query,
          matches,
          hints,
          guidance,
          product_context: { product_name, sku, manufacturer, quantity, unit, product_id },
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
      description: 'Look up a product price from the Pricing Knowledge Base (admin only). Returns structured chunks from price lists, discount rules, contract terms, and promotions — the agent composes the final price by combining them with a visible reasoning chain. Use when an admin asks for a price, or when triggered from the product detail page or a quote line. Always emit a final `price_proposal` chunk so the UI can show the proposal with a "Use this price" button.',
      schema: z.object({
        product_name: z.string().describe('Full product name to look up.'),
        sku: z.string().optional().describe('SKU if known — strongest match signal.'),
        manufacturer: z.string().optional().describe('Manufacturer name — narrows discount rule scope.'),
        quantity: z.number().optional().describe('Quote line quantity — used for MOQ/tier math.'),
        unit: z.string().optional().describe('Expected unit (e.g. "m²", "piece", "box") — used for sanity check.'),
        category_slug: z.string().default('pricing').describe('KB category slug to search. Defaults to "pricing".'),
        top_k: z.number().default(8).describe('Max number of price chunks to return.'),
        product_id: z.string().optional().describe('Product UUID — passed through to the price_proposal chunk so the UI can commit back to the right product.'),
      }),
    },
  );
};
