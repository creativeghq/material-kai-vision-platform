/**
 * Credit spend categories — the vocabulary the Spend Summary renders.
 *
 * Import-free on purpose: the mapping is pure and has to be loadable by a unit
 * test without dragging in the Supabase client.
 */

/**
 * The categories the Spend Summary can show. Exported so the colour map has to
 * cover every one — a category with no colour renders in the muted "Other" grey
 * and stops being distinguishable from genuinely unclassified spend.
 */
export const CREDIT_SPEND_CATEGORIES = [
  'AI Assistant',
  'SEO Toolkit',
  'Mention Monitoring',
  'Price Monitoring',
  'Job Research',
  'B2B & Company Research',
  'Web Research',
  'Knowledge Base',
  'Catalog & Products',
  'Stock',
  'Finance & Documents',
  'CRM',
  'HR',
  'Real Estate',
  'Messaging',
  'Automations',
  'Inbox & Email',
  'Social Content',
  'Interior Design',
  'Video Generation',
  'Image Generation',
  '3D / VR Worlds',
  'Image & Material Tools',
  'Presentation Sheets',
  'AI Assessment',
  'Account Adjustments',
  'Other',
] as const;

export type CreditSpendCategoryLabel = typeof CREDIT_SPEND_CATEGORIES[number];

/**
 * Maps a NORMALIZED operation token — what `public.credit_operation_token` produces
 * — onto a category label. Do NOT re-normalize here: the `cron_` wrapper, the
 * reserve/refund/overage suffix and any `:target` suffix are already stripped, and a
 * second copy of that rule would drift silently, both halves still returning a valid
 * category. "Other" means genuinely unclassified — every operation the platform
 * bills has a home above it.
 */
export function creditOperationCategory(op: string | null | undefined): CreditSpendCategoryLabel {
  const key = (op ?? '').toLowerCase();
  if (!key) return 'Other';

  // Exact token, or that token plus a sub-operation (`agent_chat` / `agent_chat_turn`).
  const is = (...tokens: string[]) => tokens.some((t) => key === t || key.startsWith(`${t}_`));
  const startsWith = (...prefixes: string[]) => prefixes.some((p) => key.startsWith(p));

  // B2B runs first: `company_website_scrape_analysis` must not reach the generic
  // `_analysis` rule at the bottom, which would file it under the agent.
  if (is('email_validate', 'contact_discovery', 'industrial_facility_search',
    'scrape_materials_from_url', 'factory_enrichment')
    || startsWith('b2b_', 'company_', 'find_competitors')) return 'B2B & Company Research';

  if (is('web_search', 'web_fetch', 'web_research', 'firecrawl_scrape',
    'inspiration_url_analysis', 'analyze_inspiration_url_haiku', 'tech_radar_review')
    || startsWith('page_watch')) return 'Web Research';

  // Retrieval over what we have already ingested, priced per MIVAA call.
  if (is('text_search', 'kb_search', 'rag_query', 'rag_chat', 'mmr_search',
    'advanced_search', 'visual_search', 'image_upload_analyze')) return 'Knowledge Base';

  // `website_crawl` is the SEO site crawler, despite reading like a web-research op.
  if (is('website_crawl') || startsWith('seo_', 'dataforseo',
    'crawl_user_website')) return 'SEO Toolkit';
  if (is('llm_mention_probe') || startsWith('mention_monitoring')) return 'Mention Monitoring';
  if (startsWith('job_research')) return 'Job Research';
  if (startsWith('price', 'public_price', 'market')) return 'Price Monitoring';

  if (is('email_contacts_sync') || startsWith('inbox_')) return 'Inbox & Email';
  if (is('phone_number_monthly') || startsWith('messaging_')) return 'Messaging';
  if (startsWith('flow_')) return 'Automations';
  if (startsWith('crm_')) return 'CRM';
  if (startsWith('hr_')) return 'HR';
  if (startsWith('real_estate_')) return 'Real Estate';
  if (startsWith('social_')) return 'Social Content';

  if (is('scan') || startsWith('einvoice_', 'mydata_', 'aade_', 'expense_',
    'order_intake_')) return 'Finance & Documents';
  if (is('visual_aspect_search') || startsWith('catalog_', 'xml_field_mapping',
    'ontology_propose', 'taric_')) return 'Catalog & Products';
  if (startsWith('stock_')) return 'Stock';

  if (startsWith('interior_video', 'veo_')) return 'Video Generation';
  if (is('virtual_staging') || startsWith('interior_')) return 'Interior Design';
  if (startsWith('gemini_')) return 'Image Generation';
  if (startsWith('vr_', 'worldlabs')) return '3D / VR Worlds';
  if (is('image_segment', 'sam_segment', 'inpaint', 'region_edit')
    || startsWith('pbr', 'generate_pbr')) return 'Image & Material Tools';
  if (startsWith('presentation_sheet')) return 'Presentation Sheets';
  if (startsWith('ai_assessment')) return 'AI Assessment';

  if (is('deduction', 'bonus', 'refund', 'purchase', 'credit_purchase', 'monthly_grant',
    'diagnostic_testing') || startsWith('operator_')) return 'Account Adjustments';

  if (is('agent_chat', 'kai_task_agent', 'dashboard_insights', 'search_prompt_enhancement')
    || startsWith('agent_memory') || key.endsWith('_analysis')) return 'AI Assistant';
  return 'Other';
}
