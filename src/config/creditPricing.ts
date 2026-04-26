/**
 * Credit Pricing Configuration
 * Single source of truth for action-to-credit-cost mappings.
 * Used by the Credits Calculator UI and documentation.
 *
 * Synced with:
 * - supabase/functions/_shared/mivaa-pricing.ts (backend billing)
 * - supabase/functions/_shared/credit-utils.ts (external services)
 * - mivaa-pdf-extractor/app/config/ai_pricing.py (Python backend)
 *
 * Last synced: 2026-04-24 (verified against Python AIPricingConfig — Claude/Voyage prices last verified 2026-04-18/19)
 */

export interface ActionPricingEntry {
  id: string;
  label: string;
  description: string;
  creditsPerAction: number;
  unit: string;
  category: string;
}

export interface ActionCategory {
  id: string;
  label: string;
  icon: string; // Lucide icon name
}

export const ACTION_CATEGORIES: ActionCategory[] = [
  { id: 'agent_chat', label: 'AI Agent Chat', icon: 'MessageSquare' },
  { id: 'seo_pipeline', label: 'SEO Article Pipeline', icon: 'FileText' },
  { id: 'interior_design', label: 'Interior Design Generation', icon: 'Paintbrush' },
  { id: 'b2b_research', label: 'B2B Company Research', icon: 'Building2' },
  { id: 'visual_search', label: 'Visual & Material Search', icon: 'Search' },
  { id: 'vr_generation', label: 'VR World Generation', icon: 'Globe' },
  { id: 'knowledge_base', label: 'Knowledge Base', icon: 'BookOpen' },
];

export const ACTION_PRICING: ActionPricingEntry[] = [
  // AI Agent Chat
  {
    id: 'chat_message',
    label: 'AI chat message',
    description: 'Per message — billed at Opus rate (highest)',
    creditsPerAction: 4,
    unit: 'message',
    category: 'agent_chat',
  },

  // SEO Article Pipeline
  {
    id: 'seo_full_pipeline',
    label: 'Full SEO article',
    description: 'Research → Plan → Write → Analyze (end-to-end)',
    creditsPerAction: 42,
    unit: 'article',
    category: 'seo_pipeline',
  },
  {
    id: 'seo_research',
    label: 'Keyword research',
    description: 'DataForSEO SERP + Content Analysis + keyword data',
    creditsPerAction: 18,
    unit: 'research',
    category: 'seo_pipeline',
  },
  {
    id: 'seo_plan',
    label: 'Article planning',
    description: 'Structured outline via Gemini 3 Flash',
    creditsPerAction: 2,
    unit: 'plan',
    category: 'seo_pipeline',
  },
  {
    id: 'seo_write',
    label: 'Article writing',
    description: 'Full article generation via Claude Opus',
    creditsPerAction: 20,
    unit: 'article',
    category: 'seo_pipeline',
  },
  {
    id: 'seo_analyze',
    label: 'Content analysis',
    description: 'SEO + GEO scoring and analysis',
    creditsPerAction: 2,
    unit: 'analysis',
    category: 'seo_pipeline',
  },
  {
    id: 'seo_fix',
    label: 'Auto-fix iteration',
    description: 'AI-powered content fix pass (if score < threshold)',
    creditsPerAction: 5,
    unit: 'fix',
    category: 'seo_pipeline',
  },

  // Interior Design
  {
    id: 'interior_generation',
    label: 'Interior generation',
    description: 'AI room transformation or concept — billed at highest rate',
    creditsPerAction: 3,
    unit: 'image',
    category: 'interior_design',
  },
  {
    id: 'materials_selection_board',
    label: 'Materials Selection Board',
    description: 'AI-generated design presentation board — presentation, selection, or photorealistic render',
    creditsPerAction: 15,
    unit: 'board',
    category: 'interior_design',
  },

  // B2B Company Research
  {
    id: 'b2b_manufacturer',
    label: 'Manufacturer search (single country)',
    description: 'AI-powered company discovery in one country',
    creditsPerAction: 0.75,
    unit: 'search',
    category: 'b2b_research',
  },
  {
    id: 'b2b_manufacturer_global',
    label: 'Manufacturer search (global)',
    description: 'Search all 30 markets across 5 regions',
    creditsPerAction: 3.75,
    unit: 'search',
    category: 'b2b_research',
  },
  {
    id: 'b2b_enrichment',
    label: 'Company enrichment',
    description: 'Full company data lookup',
    creditsPerAction: 7.5,
    unit: 'company',
    category: 'b2b_research',
  },
  {
    id: 'b2b_contacts',
    label: 'Contact discovery',
    description: 'Find & verify contact emails',
    creditsPerAction: 5,
    unit: 'lookup',
    category: 'b2b_research',
  },

  // Visual & Material Search
  {
    id: 'search_query',
    label: 'Material search',
    description: 'Text or image-based — billed at image search rate (highest)',
    creditsPerAction: 1,
    unit: 'search',
    category: 'visual_search',
  },

  // VR Generation
  {
    id: 'vr_world',
    label: 'VR World generation',
    description: 'Draft (18 cr) to high quality (190 cr) — Marble 1.x',
    creditsPerAction: 190,
    unit: 'world',
    category: 'vr_generation',
  },

  // Knowledge Base
  {
    id: 'kb_query',
    label: 'Document query',
    description: 'Search knowledge base documents',
    creditsPerAction: 0.5,
    unit: 'query',
    category: 'knowledge_base',
  },
];

/**
 * Get all actions for a specific category
 */
export function getActionsForCategory(categoryId: string): ActionPricingEntry[] {
  return ACTION_PRICING.filter((a) => a.category === categoryId);
}
