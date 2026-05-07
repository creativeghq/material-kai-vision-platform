/**
 * Background Agent: Material Tagger
 *
 * Auto-tags materials with structured attributes using Claude vision.
 * Processes products that have images but no material_type / tags.
 *
 * Config params (background_agents.config):
 *   batch_size     number  Products per run (default 10, max 20)
 *   tag_fields     string[]  Which fields to fill: ['material_type','color','finish','application']
 *   overwrite_tags boolean  Whether to overwrite existing tags (default false)
 */

import { runLangGraphAgent, logAgentAiUsage } from './base-agent.ts';
import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

const DEFAULT_TAG_FIELDS = ['material_type', 'color', 'finish', 'application'];

export class MaterialTaggerAgent implements AgentRunner {
  readonly agentType    = 'material-tagger';
  readonly name         = 'Material Tagger';
  readonly description  = 'Auto-tags materials with type, color, finish, and application using AI';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, run, input, log, heartbeat } = ctx;

    const cfg          = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const batchSize    = Math.min(Number(cfg.batch_size     ?? 10), 20);
    const tagFields    = (cfg.tag_fields    as string[] | undefined) || DEFAULT_TAG_FIELDS;
    const overwriteTags = Boolean(cfg.overwrite_tags ?? false);

    await log('info', `Starting material tagging`, { batchSize, tagFields, overwriteTags });

    // Fetch products with images but missing tags
    let query = supabase
      .from('products')
      .select('id, name, description, material_type, tags, image_url, category')
      .not('image_url', 'is', null)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (!overwriteTags) {
      query = query.or('material_type.is.null,tags.eq.{}');
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

    const systemPrompt = agentConfig.system_prompt_override || `You are a material classification expert for a building materials platform.
Analyze the product information provided and return structured attribute tags.

For each product return a JSON object with these fields (only include fields that apply):
- material_type: primary material (e.g. "Porcelain Tile", "Solid Oak", "Marble", "Concrete")
- color: primary color or color range (e.g. "White", "Grey Tones", "Warm Beige")
- finish: surface finish (e.g. "Polished", "Matte", "Brushed", "Textured")
- application: where it's used (e.g. "Floor", "Wall", "Indoor/Outdoor", "Countertop")
- tags: array of 3-6 relevant tags for search

Respond with a JSON object only. No markdown, no explanation.`;

    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    let taggedCount       = 0;
    const errors: string[] = [];

    for (const product of products) {
      await heartbeat();

      const userMessage = `Tag this product:
Name: ${product.name}
Category: ${product.category || 'unknown'}
Description: ${product.description || '(none)'}
Image URL: ${product.image_url}

Return JSON with applicable fields from: material_type, color, finish, application, tags[]`;

      try {
        const result = await runLangGraphAgent({
          anthropicApiKey: ctx.anthropicApiKey,
          model:           agentConfig.model,
          systemPrompt,
          tools:           [],
          userMessage,
          maxIterations:   1,
          onLog:           (level, msg, data) => log(level, msg, data),
        });

        totalInputTokens  += result.inputTokens;
        totalOutputTokens += result.outputTokens;

        let tagData: Record<string, unknown>;
        try {
          const clean = result.finalResponse.replace(/```json\n?|\n?```/g, '').trim();
          tagData = JSON.parse(clean);
        } catch {
          await log('warn', `Could not parse tags for product ${product.id}`, { raw: result.finalResponse.slice(0, 200) });
          errors.push(`parse_error:${product.id}`);
          continue;
        }

        // Build update object from requested tag_fields
        const updateData: Record<string, unknown> = {};
        if (tagFields.includes('material_type') && tagData.material_type) {
          updateData.material_type = tagData.material_type;
        }
        if (tagFields.includes('color') && tagData.color) {
          updateData.color = tagData.color;
        }
        if (tagFields.includes('finish') && tagData.finish) {
          updateData.finish = tagData.finish;
        }
        if (tagFields.includes('application') && tagData.application) {
          updateData.application = tagData.application;
        }
        if (tagData.tags && Array.isArray(tagData.tags)) {
          updateData.tags = tagData.tags;
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateErr } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', product.id);

          if (updateErr) {
            await log('warn', `Failed to update tags for product ${product.id}`, { error: updateErr.message });
            errors.push(`update_error:${product.id}`);
          } else {
            taggedCount++;
            await log('debug', `Tagged product ${product.id} (${product.name})`, tagData);
          }
        }
      } catch (err: any) {
        await log('warn', `Failed to tag product ${product.id}`, { error: err.message });
        errors.push(`ai_error:${product.id}`);
      }
    }

    await log('info', `Tagging complete`, { tagged: taggedCount, errors: errors.length });

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
        metadata:     { tagged: taggedCount, total: products.length },
      });
    }

    return {
      success:        taggedCount > 0 || errors.length < products.length,
      output:         { tagged: taggedCount, errors: errors.length, total: products.length },
      inputTokens:    totalInputTokens,
      outputTokens:   totalOutputTokens,
      creditsDebited: 0,
      triggerChain:   taggedCount > 0,
    };
  }
}
