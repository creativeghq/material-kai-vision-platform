/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * Source of truth: `TOOLKITS` in src/components/features/ai/agentToolsCatalog.ts.
 * Regenerate with:  npm run tools:manifest
 *
 * agent-chat used to keep a hand-written copy of this map. Only the catalog copy drove
 * the ToolkitPickerModal and only the agent-chat copy drove `load_toolkit`, so four
 * clusters were bindable by the agent and impossible for a user to enable. This file is
 * a projection of the catalog, not a mirror of it — staleness is a red build
 * (tests/unit/toolkitCoverage.test.ts re-runs the generator and diffs).
 */

export interface ToolkitCluster {
  /** Bound for every agent that declares the tool, with no user opt-in. */
  alwaysOn?: boolean;
  /**
   * Only an admin/owner can actually use this cluster — the binder gates its tools on
   * `isAdmin`. Projected so `load_toolkit`'s menu can leave it out for everyone else: an
   * unfiltered list is a menu handed to the model with entries it can only be refused on.
   */
  adminOnly?: boolean;
  /** The caller's workspace role must hold one of these, or the binder drops this cluster's tools. */
  capability?: string[];
  tool_ids: string[];
}

export const TOOLKIT_CLUSTERS: Record<string, ToolkitCluster> = {
  'platform-api': {
    alwaysOn: true,
    tool_ids: ['discover_platform_api', 'call_platform_api', 'discover_platform_data', 'call_platform_rpc'],
  },
  'core': {
    alwaysOn: true,
    tool_ids: ['find_records', 'knowledge_base_search', 'read_document_section', 'material_search', 'visual_search', 'analyze_inspiration_url'],
  },
  'web-research': {
    alwaysOn: true,
    tool_ids: ['web_search', 'web_fetch', 'web_research_validate'],
  },
  'calculators': {
    alwaysOn: true,
    tool_ids: ['calculate_heat_pump_sizing', 'calculate_heating_cost_comparison', 'calculate_kitchen_cost'],
  },
  'catalogs': {
    adminOnly: true,
    capability: ['pricing.manage'],
    tool_ids: ['create_catalog', 'attach_catalog_pdfs', 'extract_from_catalog_pdfs', 'translate_pdf_to_catalog', 'add_material_to_catalog', 'find_image_for_material', 'adjust_catalog_pricing', 'generate_catalog_pdf', 'publish_catalog'],
  },
  'mentions': {
    capability: ['marketing.seo'],
    tool_ids: ['track_product_mentions', 'get_mention_summary', 'check_llm_visibility', 'find_negative_mentions'],
  },
  'price-monitoring': {
    capability: ['pricing.manage'],
    tool_ids: ['track_product_prices', 'get_price_summary'],
  },
  'contracts': {
    capability: ['quotes.use', 'finance.manage'],
    tool_ids: ['manage_contracts'],
  },
  'inbox': {
    capability: ['inbox.use'],
    tool_ids: ['manage_inbox'],
  },
  'mail': {
    capability: ['inbox.use'],
    tool_ids: ['mail_search', 'mail_read', 'mail_attachment', 'mail_book_bill', 'mail_reply', 'mail_update', 'mail_sender_to_crm'],
  },
  'reviews': {
    capability: ['marketing.seo'],
    tool_ids: ['manage_reviews'],
  },
  'appointments': {
    capability: ['crm.view'],
    tool_ids: ['manage_appointments'],
  },
  'real-estate': {
    capability: ['realestate.view'],
    tool_ids: ['manage_real_estate'],
  },
  'sourcing': {
    capability: ['pricing.manage', 'quotes.use'],
    tool_ids: ['source_product', 'create_purchase_order', 'send_purchase_order'],
  },
  'trip-expenses': {
    tool_ids: ['create_trip_card', 'add_trip_expense', 'list_trip_cards', 'submit_trip_card'],
  },
  'expenses': {
    capability: ['finance.manage'],
    tool_ids: ['record_expense', 'list_recent_expenses', 'pay_expense', 'get_expense_payments', 'list_mydata_expenses', 'pay_bill_via_revolut'],
  },
  'company-assets': {
    capability: ['workspace.read'],
    tool_ids: ['manage_company_assets'],
  },
  'docs': {
    capability: ['workspace.read'],
    tool_ids: ['search_workspace_docs', 'manage_docs', 'document_templates'],
  },
  'messaging': {
    capability: ['inbox.use'],
    tool_ids: ['manage_messaging'],
  },
  'crm': {
    capability: ['crm.view'],
    tool_ids: ['create_company_from_vat', 'enrich_company_from_aade', 'manage_crm', 'manage_deal', 'customer_health', 'manage_counterparty_bank_account'],
  },
  'finance': {
    capability: ['finance.manage'],
    tool_ids: ['manage_finance'],
  },
  'email-marketing': {
    capability: ['marketing.email'],
    tool_ids: ['manage_email_campaign'],
  },
  'job-research': {
    tool_ids: ['track_job_search', 'list_my_job_searches', 'find_jobs', 'get_job_digest_preview', 'manage_job_sites'],
  },
  'my-hr': {
    tool_ids: ['manage_my_hr'],
  },
  'hr': {
    adminOnly: true,
    capability: ['hr.view'],
    tool_ids: ['manage_hr'],
  },
  'stock': {
    adminOnly: true,
    capability: ['warehouse.manage'],
    tool_ids: ['manage_stock'],
  },
  'website-embed': {
    capability: ['marketing.seo'],
    tool_ids: ['embed_readiness', 'embed_overview'],
  },
  'knowledge-graph': {
    capability: ['workspace.read'],
    tool_ids: ['product_provenance', 'product_price_history', 'projects_using_product', 'products_in_project', 'customer_overview', 'supplier_overview', 'products_by_brand', 'brand_overview', 'related_products', 'find_products_by_spec', 'price_my_spec', 'search_crm_by_kad'],
  },
  'flows-toolkit': {
    capability: ['workspace.manage'],
    tool_ids: ['manage_flows'],
  },
  'social': {
    capability: ['marketing.seo'],
    tool_ids: ['manage_social'],
  },
  'tech-radar': {
    adminOnly: true,
    capability: ['workspace.manage'],
    tool_ids: ['review_solution', 'track_tech_radar', 'list_tech_radar', 'update_finding'],
  },
  'construction': {
    capability: ['projects.use'],
    tool_ids: ['project_cvr', 'project_applications', 'list_variations', 'tender_status', 'tender_bid_analysis'],
  },
  'projects': {
    capability: ['projects.use'],
    tool_ids: ['create_project', 'list_my_projects', 'find_project', 'add_task', 'add_purchase_item', 'generate_purchase_sheet'],
  },
  'project-assessment': {
    capability: ['projects.use'],
    tool_ids: ['assess_project', 'get_project_assessment', 'list_assessment_actions', 'apply_assessment_action'],
  },
  'finance-assessment': {
    capability: ['finance.manage'],
    tool_ids: ['assess_finance', 'get_finance_assessment', 'list_assessment_actions', 'apply_assessment_action'],
  },
  'real-estate-assessment': {
    capability: ['realestate.view'],
    tool_ids: ['assess_property', 'get_property_assessment', 'list_assessment_actions', 'apply_assessment_action'],
  },
  'quotes': {
    capability: ['quotes.use'],
    tool_ids: ['create_quote', 'generate_quote_pdf', 'list_my_quotes', 'raise_quote_request', 'convert_quote_to_order'],
  },
  'presentation-sheets': {
    capability: ['moodboards.use', 'projects.use', 'quotes.use'],
    tool_ids: ['generate_presentation_sheet'],
  },
  'generation': {
    tool_ids: ['generate_3d', 'apply_lighting_preset', 'generate_vr_world', 'generate_video', 'generate_gemini', 'virtual_staging', 'check_generation_status', 'visualize_on_surface'],
  },
  'seo-research': {
    capability: ['marketing.seo'],
    tool_ids: ['seo_my_rankings', 'seo_site_report', 'seo_research_keyword', 'seo_keyword_difficulty', 'seo_keyword_suggestions', 'seo_search_intent', 'seo_keyword_overview', 'seo_ai_keyword_volume', 'seo_serp_audit', 'seo_audit_url', 'seo_score_url', 'seo_historical_serps', 'seo_gsc_striking_distance', 'seo_opportunities', 'seo_gsc_top_movers', 'seo_serp_content_analysis', 'seo_keyword_ideas', 'seo_related_keywords', 'seo_search_volume', 'seo_ai_overview'],
  },
  'seo-domain': {
    capability: ['marketing.seo'],
    tool_ids: ['seo_domain_snapshot', 'seo_ranked_keywords', 'seo_domain_competitors', 'seo_keyword_gap', 'seo_traffic_estimation', 'seo_subdomains', 'seo_relevant_pages', 'seo_categories_for_domain', 'seo_historical_rank_overview', 'seo_keywords_for_site', 'seo_domain_intersection'],
  },
  'seo-backlinks': {
    capability: ['marketing.seo'],
    tool_ids: ['seo_backlinks_summary', 'seo_backlinks_anchors', 'seo_referring_domains', 'seo_backlinks_timeseries', 'seo_backlinks_competitors'],
  },
  'seo-content': {
    capability: ['marketing.seo'],
    tool_ids: ['seo_content_sentiment', 'seo_domain_technologies', 'seo_domain_whois', 'seo_site_crawl_start', 'seo_site_crawl_status', 'seo_llm_mentions_search', 'seo_onpage_issues'],
  },
  'seo-multi-engine': {
    capability: ['marketing.seo'],
    tool_ids: ['seo_youtube_search', 'seo_local_pack', 'seo_google_trends', 'seo_amazon_asin', 'seo_app_keywords', 'seo_trustpilot_search', 'seo_pinterest_search', 'seo_reddit_search', 'seo_google_maps', 'seo_gbp_info'],
  },
  'seo-composite': {
    capability: ['marketing.seo'],
    tool_ids: ['seo_site_review', 'seo_brand_search_audit'],
  },
  'ai-visibility': {
    capability: ['marketing.seo'],
    tool_ids: ['check_llm_visibility', 'seo_brand_search_audit', 'seo_llm_mentions_search', 'seo_ai_keyword_volume'],
  },
  'seo-article': {
    capability: ['marketing.seo'],
    tool_ids: ['create_seo_article', 'seo_keyword_research', 'seo_content_analyzer'],
  },
  'b2b': {
    adminOnly: true,
    capability: ['workspace.manage'],
    tool_ids: ['b2b_manufacturer_search', 'b2b_research_validate', 'company_website_scrape', 'company_registry_lookup', 'industrial_facility_search', 'company_enrichment', 'contact_discovery', 'email_validate', 'save_to_crm', 'scrape_materials_from_url', 'suggest_extraction_fields'],
  },
  'sub-agents': {
    adminOnly: true,
    capability: ['workspace.manage'],
    tool_ids: ['research_analysis', 'analytics_analysis', 'business_analysis', 'product_analysis'],
  },
  'admin-misc': {
    adminOnly: true,
    capability: ['workspace.manage'],
    tool_ids: ['workspace_capabilities', 'dispatch_background_task', 'price_lookup', 'seo_dataforseo_call', 'checkServerHealth', 'querySentry', 'queryDatabase'],
  },
};
