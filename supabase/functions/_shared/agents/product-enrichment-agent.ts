/** Background Agent: Product Enrichment */

import { loadPrompt } from '../prompt-utils.ts';
import { generateStructuredWithClaude, z } from '../ai-client.ts';
import { wrapUntrusted } from '../untrusted.ts';
import { loadMaterialCategoryVocab, resolveMaterialCategory } from './material-category-vocab.ts';
import { DelegateToMivaaError } from './types.ts';
import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

/** material_category is constrained to the registry vocabulary by the server, not by the prompt. */
function enrichmentSchema(vocab: Set<string>) {
  return z.object({
    description:       z.string(),
    keywords:          z.array(z.string()),
    material_category: z.enum([...vocab] as [string, ...string[]]).nullable(),
  });
}

export class ProductEnrichmentAgent implements AgentRunner {
  readonly agentType    = 'product-enrichment';
  readonly name         = 'Product Enrichment';
  readonly description  = 'Auto-generates AI descriptions, keywords, and category tags for products';
  // EMPTY, and it must stay in step with what `run` actually builds — this passes `tools: []`
  // (see the call below: one prompt, one turn, no lookups). It declared material_search and
  // knowledge_base_search, neither of which was ever constructed. Harmless here only because
  // nothing reads the list; the identical lie in kai-task-agent, where the model DID read it,
  // is how a research task with no working tools produced a fabricated report.
  readonly defaultTools: string[] = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, input, log, heartbeat } = ctx;

    // Runs as the service role: the run's authorized workspace bounds every product read/write.
    const workspaceId = ctx.workspaceId;
    if (!workspaceId) {
      await log('error', 'Product enrichment refused: run has no authorized workspace');
      return { success: false, output: { error: 'workspace_required' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    const cfg           = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const batchSize     = Math.min(Number(cfg.batch_size     ?? 10), 50);
    const categoryFilter = (cfg.category_filter as string | undefined) || null;
    const forceRewrite  = Boolean(cfg.force_rewrite ?? false);

    if (batchSize > 20) {
      throw new DelegateToMivaaError('Batch too large for edge function', {
        batch_size: batchSize, category_filter: categoryFilter, force_rewrite: forceRewrite,
        workspace_id: workspaceId,
      });
    }

    await log('info', `Starting product enrichment`, { batchSize, categoryFilter, forceRewrite });

    let query = supabase
      .from('products')
      .select('id, name, description, metadata, attributes, attributes_raw')
      .eq('workspace_id', workspaceId)
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

    const systemPrompt = agentConfig.system_prompt_override
      || await loadPrompt(supabase, 'agent', 'product-enrichment');
    const vocab = await loadMaterialCategoryVocab(supabase);
    const schema = enrichmentSchema(vocab);

    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    let enrichedCount     = 0;
    const errors: string[] = [];

    for (const product of products) {
      await heartbeat();

      const productMeta = (product.metadata || {}) as Record<string, unknown>;
      const userMessage = wrapUntrusted('product record', JSON.stringify({
        name: product.name,
        material_category: productMeta.material_category ?? null,
        description: product.description ?? null,
        factory: productMeta.factory_name ?? null,
      }), 8000);

      try {
        const result = await generateStructuredWithClaude(userMessage, schema, {
          model:        agentConfig.model,
          systemPrompt,
          temperature:  0,
          task:         'background_agent_product_enrichment',
          userId:       agentConfig.created_by ?? undefined,
          workspaceId,
        });

        totalInputTokens  += result.usage.inputTokens;
        totalOutputTokens += result.usage.outputTokens;

        const enriched = result.output;
        if (!enriched) {
          errors.push(`no_output:${product.id}`);
          continue;
        }
        const category = resolveMaterialCategory(enriched.material_category, vocab);
        if (enriched.material_category && !category) {
          await log('warn', `Rejected material_category outside the registry for ${product.id}`, { value: enriched.material_category });
        }

        const updateData: Record<string, unknown> = {};
        if (enriched.description?.trim()) updateData.description = enriched.description.trim();
        const keywords = (enriched.keywords ?? []).map((k) => k.trim()).filter(Boolean);
        if (keywords.length > 0 || category) {
          const metaUpdate = { ...productMeta };
          if (keywords.length > 0) metaUpdate.search_keywords = keywords;
          if (category) metaUpdate.material_category = category;
          updateData.metadata = metaUpdate;
        }

        if (category) {
          const canonResp = await supabase.functions.invoke('canonicalize-attributes', {
            body: {
              product_id: product.id,
              workspace_id: workspaceId,
              raw_attributes: { material_category: category },
              source: 'agent_product_enrichment',
            },
          });
          if (canonResp.error) {
            await log('warn', `canonicalize-attributes failed for ${product.id}`, { error: canonResp.error.message });
          } else if (canonResp.data && Object.keys(canonResp.data.attributes || {}).length > 0) {
            updateData.attributes = {
              ...((product.attributes ?? {}) as Record<string, unknown>),
              ...(canonResp.data.attributes as Record<string, unknown>),
            };
            updateData.attributes_raw = {
              ...((product.attributes_raw ?? {}) as Record<string, unknown>),
              ...((canonResp.data.attributes_raw ?? {}) as Record<string, unknown>),
            };
          }
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateErr } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', product.id)
            .eq('workspace_id', workspaceId);

          if (updateErr) {
            await log('warn', `Failed to update product ${product.id}`, { error: updateErr.message });
            errors.push(`update_error:${product.id}`);
          } else {
            enrichedCount++;
            await log('debug', `Enriched product ${product.id} (${product.name})`);
          }
        }
      } catch (err) {
        await log('warn', `Failed to enrich product ${product.id}`, { error: err instanceof Error ? err.message : String(err) });
        errors.push(`ai_error:${product.id}`);
      }
    }

    await log('info', `Enrichment complete`, { enriched: enrichedCount, errors: errors.length, total: products.length });

    return {
      success:        errors.length === 0,
      output:         { enriched: enrichedCount, errors: errors.length, total: products.length, error_ids: errors },
      inputTokens:    totalInputTokens,
      outputTokens:   totalOutputTokens,
      creditsDebited: 0,
      triggerChain:   enrichedCount > 0,
    };
  }
}
