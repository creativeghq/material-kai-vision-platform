/**
 * Toolkit meta-tools — let the agent dynamically request more capabilities
 * mid-conversation when the user's request needs tools that aren't currently
 * loaded.
 *
 * load_toolkit: takes a toolkit_id, emits a `toolkit_loaded` chunk so the
 * frontend can update the user's active toolkit list (and therefore include
 * it in the next agent turn's tool binding). The agent's response should
 * acknowledge the load + tell the user to re-send their request so the new
 * tools are bound.
 *
 * This is intentionally a TWO-TURN pattern (load on turn N, use on turn N+1)
 * because LangChain agent tool bindings are set per-invocation and can't be
 * mutated mid-graph-run.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');

type ChunkSink = ((chunk: any) => void) | undefined;

// Mirror of the toolkit registry on the frontend. Kept in sync manually for
// now (small surface, changes infrequently). The frontend version is the
// source of truth for the picker UI; this one drives the load_toolkit
// response so the agent knows what got loaded.
const TOOLKITS_INDEX: Record<string, { name: string; tool_ids: string[]; admin_only?: boolean }> = {
  'catalogs': {
    name: 'Catalogs', admin_only: true,
    tool_ids: [
      'create_catalog', 'attach_catalog_pdfs', 'extract_from_catalog_pdfs',
      'translate_pdf_to_catalog', 'add_material_to_catalog', 'find_image_for_material',
      'generate_catalog_pdf', 'publish_catalog',
    ],
  },
  'mentions': { name: 'Mention Monitoring', tool_ids: ['track_product_mentions', 'get_mention_summary', 'check_llm_visibility', 'find_negative_mentions'] },
  'presentation-sheets': { name: 'Presentation Sheets', tool_ids: ['generate_presentation_sheet'] },
  'generation': { name: 'Image / 3D / VR Generation', tool_ids: ['generate_3d', 'apply_lighting_preset', 'generate_vr_world'] },
  'seo-research': { name: 'SEO Research', tool_ids: ['seo_research_keyword', 'seo_keyword_difficulty', 'seo_keyword_suggestions', 'seo_search_intent', 'seo_keyword_overview', 'seo_ai_keyword_volume', 'seo_serp_audit', 'seo_audit_url', 'seo_historical_serps'] },
  'seo-domain': { name: 'SEO Domain Intel', tool_ids: ['seo_domain_snapshot', 'seo_ranked_keywords', 'seo_domain_competitors', 'seo_keyword_gap', 'seo_traffic_estimation', 'seo_subdomains', 'seo_relevant_pages', 'seo_categories_for_domain'] },
  'seo-backlinks': { name: 'SEO Backlinks', tool_ids: ['seo_backlinks_summary', 'seo_backlinks_anchors', 'seo_referring_domains'] },
  'seo-content': { name: 'SEO Content & Tech', tool_ids: ['seo_content_sentiment', 'seo_domain_technologies', 'seo_domain_whois', 'seo_site_crawl_start', 'seo_site_crawl_status', 'seo_llm_mentions_search'] },
  'seo-multi-engine': { name: 'SEO Multi-Engine + Niche', tool_ids: ['seo_youtube_search', 'seo_local_pack', 'seo_google_trends', 'seo_amazon_asin', 'seo_app_keywords', 'seo_trustpilot_search', 'seo_pinterest_search', 'seo_reddit_search'] },
  'seo-composite': { name: 'SEO Composite Audits', tool_ids: ['seo_site_review', 'seo_brand_search_audit'] },
  'seo-article': { name: 'SEO Article Pipeline', admin_only: true, tool_ids: ['create_seo_article', 'seo_keyword_research', 'seo_article_planner', 'seo_article_writer', 'seo_content_analyzer'] },
  'b2b': { name: 'B2B Research', admin_only: true, tool_ids: ['b2b_manufacturer_search', 'company_website_scrape', 'company_enrichment', 'contact_discovery', 'email_validate', 'save_to_crm'] },
  'sub-agents': { name: 'Sub-agents', admin_only: true, tool_ids: ['research_analysis', 'analytics_analysis', 'business_analysis', 'product_analysis'] },
  'admin-misc': { name: 'Admin Utilities', admin_only: true, tool_ids: ['dispatch_background_task', 'price_lookup', 'seo_dataforseo_call'] },
};

export const createLoadToolkitTool = (isAdmin: boolean, onChunk: ChunkSink) => {
  return tool(
    async (input: { toolkit_id: string }) => {
      const tk = TOOLKITS_INDEX[input.toolkit_id];
      if (!tk) {
        return JSON.stringify({
          success: false,
          error: `Unknown toolkit "${input.toolkit_id}". Available: ${Object.keys(TOOLKITS_INDEX).join(', ')}.`,
        });
      }
      if (tk.admin_only && !isAdmin) {
        return JSON.stringify({
          success: false,
          error: `Toolkit "${input.toolkit_id}" is admin-only and not available for this user.`,
        });
      }

      // Tell the frontend to add this toolkit to activeToolkits + persist it
      try {
        onChunk?.({
          type: 'toolkit_loaded',
          toolkit_id: input.toolkit_id,
          toolkit_name: tk.name,
          tool_ids: tk.tool_ids,
        });
      } catch { /* stream may be closed */ }

      return JSON.stringify({
        success: true,
        toolkit_id: input.toolkit_id,
        toolkit_name: tk.name,
        tools_added: tk.tool_ids,
        message: `Loaded the "${tk.name}" toolkit. ${tk.tool_ids.length} tool${tk.tool_ids.length === 1 ? '' : 's'} are now available — ask the user to re-send their request so I can use them.`,
      });
    },
    {
      name: 'load_toolkit',
      description:
        'Load an additional toolkit (cluster of tools) so the agent can use it. Use this when the user asks for capabilities that aren\'t in the currently bound toolset. ' +
        'The newly-loaded tools become available on the NEXT user turn — your response after calling this should briefly acknowledge the load and ask the user to re-send. ' +
        'Available toolkits: catalogs, mentions, presentation-sheets, generation, seo-research, seo-domain, seo-backlinks, seo-content, seo-multi-engine, seo-composite, seo-article (admin), b2b (admin), sub-agents (admin), admin-misc (admin).',
      schema: z.object({
        toolkit_id: z.string().describe('One of: catalogs, mentions, presentation-sheets, generation, seo-research, seo-domain, seo-backlinks, seo-content, seo-multi-engine, seo-composite, seo-article, b2b, sub-agents, admin-misc'),
      }),
    },
  );
};
