/**
 * Background Agent: Product Enrichment
 *
 * Uses Claude to enrich products with AI-generated descriptions,
 * search keywords, and material category tags.
 *
 * Config params (background_agents.config):
 *   batch_size       number  Products to process per run (default 10, max 20)
 *   category_filter  string  Optional: only enrich products in this category
 *   force_rewrite    boolean Re-enrich products that already have descriptions
 *
 * Delegation: throws DelegateToMivaaError when batch_size > 20
 */

import { loadPrompt } from '../prompt-utils.ts';
import { runLangGraphAgent, logAgentAiUsage } from './base-agent.ts';
import { DelegateToMivaaError } from './types.ts';
import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

export class ProductEnrichmentAgent implements AgentRunner {
  readonly agentType    = 'product-enrichment';
  readonly name         = 'Product Enrichment';
  readonly description  = 'Auto-generates AI descriptions, keywords, and category tags for products';
  readonly defaultTools = ['material_search', 'knowledge_base_search'];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, run, input, log, heartbeat } = ctx;

    const cfg           = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const batchSize     = Math.min(Number(cfg.batch_size     ?? 10), 50);
    const categoryFilter = (cfg.category_filter as string | undefined) || null;
    const forceRewrite  = Boolean(cfg.force_rewrite ?? false);

    // Delegate large batches to Python
    if (batchSize > 20) {
      throw new DelegateToMivaaError('Batch too large for edge function', {
        batch_size: batchSize, category_filter: categoryFilter, force_rewrite: forceRewrite,
      });
    }

    await log('info', `Starting product enrichment`, { batchSize, categoryFilter, forceRewrite });

    // Fetch products that need enrichment
    let query = supabase
      .from('products')
      .select('id, name, description, metadata')
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (!forceRewrite) {
      query = query.or('description.is.null,description.eq.');
    }
    if (categoryFilter) {
      query = query.filter('metadata->>material_category', 'eq', categoryFilter);
    }

    const { data: products, error: fetchErr } = await query;
    if (fetchErr) {
      await log('error', 'Failed to fetch products', { error: fetchErr.message });
      return { success: false, output: { error: fetchErr.message }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    if (!products || products.length === 0) {
      await log('info', 'No products need enrichment');
      return { success: true, output: { enriched: 0, message: 'No products to enrich' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    await log('info', `Found ${products.length} products to enrich`);

    // The default lives in `prompts` (prompt_type='agent', category='product-enrichment').
    // It used to be a hardcoded literal here: the override path existed, so an admin could
    // change this — but only by overriding a default nobody could see (#347 phase 3P).
    const systemPrompt = agentConfig.system_prompt_override
      || await loadPrompt(supabase, 'agent', 'product-enrichment');

    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    let enrichedCount     = 0;
    const errors: string[] = [];

    for (const product of products) {
      await heartbeat();

      const productMeta = (product.metadata || {}) as Record<string, unknown>;
      const userMessage = `Enrich this product:
Name: ${product.name}
Material category: ${productMeta.material_category || 'unknown'}
Current description: ${product.description || '(none)'}
Factory: ${productMeta.factory_name || 'unknown'}

Return JSON: { "description": "...", "keywords": ["..."], "material_category": "..." }`;

      try {
        const result = await runLangGraphAgent({
          anthropicApiKey: ctx.anthropicApiKey,
          model:           agentConfig.model,
          systemPrompt,
          tools:           [],   // no tools needed for simple enrichment
          userMessage,
          maxIterations:   1,
          onLog:           (level, msg, data) => log(level, msg, data),
        });

        totalInputTokens  += result.inputTokens;
        totalOutputTokens += result.outputTokens;

        // Parse JSON response
        let enriched: Record<string, unknown>;
        try {
          const clean = result.finalResponse.replace(/```json\n?|\n?```/g, '').trim();
          enriched = JSON.parse(clean);
        } catch {
          await log('warn', `Could not parse JSON for product ${product.id}`, { raw: result.finalResponse.slice(0, 200) });
          errors.push(`parse_error:${product.id}`);
          continue;
        }

        // Update product — material_category lives inside metadata (JSONB), not a top-level column
        const updateData: Record<string, unknown> = {};
        if (enriched.description) updateData.description = enriched.description;
        if (enriched.keywords || enriched.material_category) {
          const metaUpdate = { ...productMeta };
          if (enriched.keywords) metaUpdate.search_keywords = enriched.keywords;
          if (enriched.material_category) metaUpdate.material_category = enriched.material_category;
          updateData.metadata = metaUpdate;
        }

        // ── Auto-canonicalize material_category through the facet pipeline ──
        // material_category is whitelisted, so the canonicalizer's L0.5+L1+L2
        // collapse "Πορσελάνη" / "Porcelain" / "Porzellan" → canonical "porcelain".
        // The enrichment agent's other outputs (description, keywords) are NOT
        // canonicalizable facets so they pass through unchanged.
        try {
          const canonResp = await supabase.functions.invoke('canonicalize-attributes', {
            body: {
              product_id: product.id,
              raw_attributes: enriched.material_category ? { material_category: enriched.material_category } : {},
              source: 'agent_product_enrichment',
            },
          });
          if (canonResp.error) {
            await log('warn', `canonicalize-attributes failed for ${product.id}`, { error: canonResp.error.message });
          } else if (canonResp.data && Object.keys(canonResp.data.attributes || {}).length > 0) {
            updateData.attributes     = canonResp.data.attributes;
            updateData.attributes_raw = canonResp.data.attributes_raw;
          }
        } catch (canonErr: any) {
          await log('warn', `canonicalize-attributes threw for ${product.id}`, { error: canonErr?.message });
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateErr } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', product.id);

          if (updateErr) {
            await log('warn', `Failed to update product ${product.id}`, { error: updateErr.message });
            errors.push(`update_error:${product.id}`);
          } else {
            enrichedCount++;
            await log('debug', `Enriched product ${product.id} (${product.name})`);
          }
        }
      } catch (err: any) {
        await log('warn', `Failed to enrich product ${product.id}`, { error: err.message });
        errors.push(`ai_error:${product.id}`);
      }
    }

    await log('info', `Enrichment complete`, { enriched: enrichedCount, errors: errors.length, total: products.length });

    // Cost attribution — historically zero ai_usage_logs writes from any
    // background agent, so the Operations dashboard underreported spend.
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      logAgentAiUsage(supabase, {
        runId:        run.id,
        agentId:      agentConfig.id,
        agentType:    this.agentType,
        userId:       agentConfig.created_by,
        workspaceId:  agentConfig.workspace_id,
        model:        agentConfig.model,
        inputTokens:  totalInputTokens,
        outputTokens: totalOutputTokens,
        metadata:     { enriched: enrichedCount, total: products.length },
      });
    }

    return {
      success:        enrichedCount > 0 || errors.length < products.length,
      output:         { enriched: enrichedCount, errors: errors.length, total: products.length, error_ids: errors },
      inputTokens:    totalInputTokens,
      outputTokens:   totalOutputTokens,
      creditsDebited: 0,
      triggerChain:   enrichedCount > 0,
    };
  }
}
