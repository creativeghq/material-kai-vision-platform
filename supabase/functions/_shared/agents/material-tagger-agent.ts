/** Background Agent: Material Tagger */

import { loadPrompt } from '../prompt-utils.ts';
import { generateStructuredWithClaude, z } from '../ai-client.ts';
import { wrapUntrusted } from '../untrusted.ts';
import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

const META_FACET_KEYS = ['material_category', 'color', 'finish', 'style', 'application', 'room', 'lamp_type', 'color_temperature_k', 'mounting_type'];

const TAG_SCHEMA = z.object({
  material:      z.string().nullable(),
  color:         z.string().nullable(),
  finish:        z.string().nullable(),
  application:   z.string().nullable(),
  tags:          z.array(z.string()),
});

export class MaterialTaggerAgent implements AgentRunner {
  readonly agentType    = 'material-tagger';
  readonly name         = 'Material Tagger';
  readonly description  = 'Catches up canonical attributes for products missing them';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, input, log, heartbeat } = ctx;

    // Runs as the service role: the run's authorized workspace bounds every product read/write.
    const workspaceId = ctx.workspaceId;
    if (!workspaceId) {
      await log('error', 'Material tagging refused: run has no authorized workspace');
      return { success: false, output: { error: 'workspace_required' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    const cfg            = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const batchSize      = Math.min(Number(cfg.batch_size ?? 10), 20);
    const recanonicalize = Boolean(cfg.recanonicalize ?? false);

    await log('info', `Starting material tagging`, { batchSize, recanonicalize });

    let query = supabase
      .from('products')
      .select('id, name, description, metadata, attributes, attributes_raw')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (!recanonicalize) {
      query = query.eq('attributes', '{}');
    }

    const { data: products, error: fetchErr } = await query;
    if (fetchErr) {
      await log('error', 'Failed to fetch products', { error: fetchErr.message });
      return { success: false, output: { error: fetchErr.message }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    if (!products || products.length === 0) {
      await log('info', 'No products need tagging');
      return { success: true, output: { tagged: 0, message: 'No products to tag' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    await log('info', `Found ${products.length} products to tag`);

    const systemPrompt = agentConfig.system_prompt_override
      || await loadPrompt(supabase, 'agent', 'material-tagger');

    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    let taggedCount       = 0;
    const errors: string[] = [];

    for (const product of products) {
      await heartbeat();

      const m = (product.metadata || {}) as Record<string, unknown>;
      const facets: Record<string, unknown> = {};
      for (const k of META_FACET_KEYS) {
        if (m[k] !== undefined && m[k] !== null && m[k] !== '') facets[k] = m[k];
      }
      const userMessage = wrapUntrusted('product record', JSON.stringify({
        name: product.name,
        description: product.description ?? null,
        metadata_facets: facets,
      }), 8000);

      try {
        const result = await generateStructuredWithClaude(userMessage, TAG_SCHEMA, {
          model:        agentConfig.model,
          systemPrompt,
          temperature:  0,
          task:         'background_agent_material_tagger',
          userId:       agentConfig.created_by ?? undefined,
          workspaceId,
        });

        totalInputTokens  += result.usage.inputTokens;
        totalOutputTokens += result.usage.outputTokens;

        const tagData: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(result.output ?? {})) {
          if (Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== '') tagData[k] = v;
        }
        if (Object.keys(tagData).length === 0) {
          await log('debug', `Model returned no tags for ${product.id}`);
          continue;
        }

        let canonAttrs: Record<string, unknown> = {};
        let canonRaw: Record<string, unknown> = {};
        try {
          const canonResp = await supabase.functions.invoke('canonicalize-attributes', {
            body: {
              product_id: product.id,
              workspace_id: workspaceId,
              raw_attributes: tagData,
              source: 'agent_material_tagger',
            },
          });
          if (canonResp.error) {
            await log('warn', `canonicalize-attributes failed for ${product.id}`, { error: canonResp.error.message });
            errors.push(`canon_error:${product.id}`);
            continue;
          }
          canonAttrs = (canonResp.data?.attributes ?? {}) as Record<string, unknown>;
          canonRaw   = (canonResp.data?.attributes_raw ?? {}) as Record<string, unknown>;
        } catch (canonErr) {
          await log('warn', `canonicalize-attributes threw for ${product.id}`, { error: canonErr instanceof Error ? canonErr.message : String(canonErr) });
          errors.push(`canon_throw:${product.id}`);
          continue;
        }

        if (Object.keys(canonAttrs).length === 0) {
          await log('debug', `Canonicalizer returned no attributes for ${product.id} — leaving as-is`, tagData);
          continue;
        }

        const { error: updateErr } = await supabase
          .from('products')
          .update({
            attributes:     { ...((product.attributes ?? {}) as Record<string, unknown>), ...canonAttrs },
            attributes_raw: { ...((product.attributes_raw ?? {}) as Record<string, unknown>), ...canonRaw },
          })
          .eq('id', product.id)
          .eq('workspace_id', workspaceId);

        if (updateErr) {
          await log('warn', `Failed to update tags for product ${product.id}`, { error: updateErr.message });
          errors.push(`update_error:${product.id}`);
        } else {
          taggedCount++;
          await log('debug', `Tagged product ${product.id} (${product.name})`, canonAttrs);
        }
      } catch (err) {
        await log('warn', `Failed to tag product ${product.id}`, { error: err instanceof Error ? err.message : String(err) });
        errors.push(`ai_error:${product.id}`);
      }
    }

    await log('info', `Tagging complete`, { tagged: taggedCount, errors: errors.length });

    return {
      success:        errors.length === 0,
      output:         { tagged: taggedCount, errors: errors.length, total: products.length, error_ids: errors },
      inputTokens:    totalInputTokens,
      outputTokens:   totalOutputTokens,
      creditsDebited: 0,
      triggerChain:   taggedCount > 0,
    };
  }
}
