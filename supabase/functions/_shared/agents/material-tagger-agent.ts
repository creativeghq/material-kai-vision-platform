/**
 * Background Agent: Material Tagger
 *
 * Auto-tags materials with canonical structured attributes (color, material,
 * finish, application) for products that don't yet have populated attributes.
 *
 * What it does:
 *   1. Finds products with empty `attributes` (canonicalization hasn't run yet)
 *   2. Asks Claude Haiku to extract attribute values from name + description + metadata
 *   3. Routes the AI output through the `canonicalize-attributes` edge function
 *      so values land canonical English in `products.attributes` (and raw in
 *      `products.attributes_raw`)
 *
 * History: the previous version selected non-existent columns (material_type,
 * tags, image_url, category) and wrote tags to a missing top-level column,
 * which silently broke every run. Real attribute storage now lives in the
 * `attributes` jsonb column populated via the canonicalizer (PDF Stage 4 / XML
 * import / web scrape / catalog promote all flow through the same path); this
 * agent is the catch-up worker for products that arrived before canonicalization
 * was wired into their ingest path.
 *
 * Config params (background_agents.config):
 *   batch_size  number  Products per run (default 10, max 20)
 *   recanonicalize  boolean  If true, also re-tag products that already have
 *                            non-empty attributes (forces a re-run; use after
 *                            tuning the threshold or seeding new canonicals).
 */

import { runLangGraphAgent, logAgentAiUsage } from './base-agent.ts';
import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

export class MaterialTaggerAgent implements AgentRunner {
  readonly agentType    = 'material-tagger';
  readonly name         = 'Material Tagger';
  readonly description  = 'Catches up canonical attributes for products missing them';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, run, input, log, heartbeat } = ctx;

    const cfg            = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const batchSize      = Math.min(Number(cfg.batch_size ?? 10), 20);
    const recanonicalize = Boolean(cfg.recanonicalize ?? false);

    await log('info', `Starting material tagging`, { batchSize, recanonicalize });

    // Find products that need canonical attributes filled in.
    // `attributes` is jsonb NOT NULL DEFAULT '{}', so "needs work" = attributes='{}'.
    let query = supabase
      .from('products')
      .select('id, name, description, metadata')
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

    const systemPrompt = agentConfig.system_prompt_override || `You are a material classification expert for a building materials platform.
Analyze the product information provided and return structured attribute tags.

For each product return a JSON object with these fields (only include fields that apply):
- material_type: primary material (e.g. "porcelain tile", "solid oak", "marble", "concrete")
- color: primary color or color range (e.g. "white", "grey", "warm beige")
- finish: surface finish (e.g. "polished", "matte", "brushed", "textured")
- application: where it's used (e.g. "floor", "wall", "indoor outdoor", "countertop")
- tags: array of 3-6 relevant tags for search

LANGUAGE RULE: Return all values in lowercase English. If the product name or description
is non-English, translate. Preserve verbatim only: brand names, model numbers, SKUs,
socket codes (E27/GU10), IP ratings (IP44/IP65), wattages, dimensions, certifications.

Respond with a JSON object only. No markdown, no explanation.`;

    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    let taggedCount       = 0;
    const errors: string[] = [];

    for (const product of products) {
      await heartbeat();

      // Build a text-only context. Vision input would be ideal but the
      // product-level image URL doesn't live on this row (images are in
      // document_images linked via image_product_associations). For now
      // we extract attributes from the available text — name + description
      // + any pre-extracted facets already in metadata. The canonicalizer
      // does the heavy lifting: even partial / messy values get normalized
      // and clustered into existing canonicals.
      const metaSnippet = (() => {
        const m = (product.metadata || {}) as Record<string, unknown>;
        const keep = ['material_category', 'available_colors', 'finish', 'style', 'application', 'room', 'socket', 'light_color', 'mounting_type'];
        const out: Record<string, unknown> = {};
        for (const k of keep) {
          if (m[k] !== undefined && m[k] !== null && m[k] !== '') out[k] = m[k];
        }
        return Object.keys(out).length > 0 ? JSON.stringify(out) : '(no metadata facets)';
      })();

      const userMessage = `Tag this product:
Name: ${product.name}
Description: ${product.description || '(none)'}
Existing metadata facets: ${metaSnippet}

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

        // ── Auto-canonicalize via the canonicalize-attributes edge function ──
        // Sole write path: the canonicalizer normalizes Haiku's raw output
        // (any language) and writes products.attributes + products.attributes_raw.
        // No dead writes to non-existent top-level columns. Diff-before-canonicalize
        // means re-runs on stable products skip already-seen values.
        const updateData: Record<string, unknown> = {};
        try {
          const canonResp = await supabase.functions.invoke('canonicalize-attributes', {
            body: {
              product_id: product.id,
              raw_attributes: tagData,
              source: 'agent_material_tagger',
            },
          });
          if (canonResp.error) {
            await log('warn', `canonicalize-attributes failed for ${product.id}`, { error: canonResp.error.message });
            errors.push(`canon_error:${product.id}`);
            continue;
          }
          if (canonResp.data) {
            updateData.attributes      = canonResp.data.attributes      || {};
            updateData.attributes_raw  = canonResp.data.attributes_raw  || {};
          }
        } catch (canonErr: any) {
          await log('warn', `canonicalize-attributes threw for ${product.id}`, { error: canonErr?.message });
          errors.push(`canon_throw:${product.id}`);
          continue;
        }

        // Only update if we got at least one canonical attribute back.
        // Empty canonical result usually means Haiku produced unusable output
        // (e.g. all values rejected by the non-ASCII guard) — log and skip
        // rather than overwrite with empty attributes.
        const attrs = updateData.attributes as Record<string, unknown> | undefined;
        if (!attrs || Object.keys(attrs).length === 0) {
          await log('debug', `Canonicalizer returned no attributes for ${product.id} — leaving as-is`, tagData);
          continue;
        }

        const { error: updateErr } = await supabase
          .from('products')
          .update(updateData)
          .eq('id', product.id);

        if (updateErr) {
          await log('warn', `Failed to update tags for product ${product.id}`, { error: updateErr.message });
          errors.push(`update_error:${product.id}`);
        } else {
          taggedCount++;
          await log('debug', `Tagged product ${product.id} (${product.name})`, attrs);
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
