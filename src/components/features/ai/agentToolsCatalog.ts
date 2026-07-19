/**
 * agentToolsCatalog — single source of truth for the agent tool inventory.
 *
 * Used by:
 *   - ToolkitPickerModal  (visual toolkit-cluster picker; primary surface)
 *   - PromptBuilderModal  (browse tools + click-to-prefill starter prompts)
 *   - Future: an admin-side tool-coverage report
 *
 * Per-tool fields:
 *   id           — agent-side tool name (matches the registered tool)
 *   name         — short human label
 *   desc         — one-sentence description shown in browse modals
 *   category     — grouping for the UI (Search, B2B, SEO, etc.)
 *   adminOnly    — true when only admin/owner can invoke
 *   moduleSlug   — when present, the tool requires that module to be enabled
 *                  in the public.modules table (e.g. mention-monitoring).
 *                  PromptBuilder can hide / dim these when disabled.
 *   credits      — partner credit cost per call (numeric; 0 = free for user)
 *   examples     — 1-3 starter prompts the user can click to pre-fill chat
 *   imageRequired — when true, only meaningful when the user has attached an image
 */
import type { HubId } from '@/config/nav-items';

export interface AgentToolEntry {
  id: string;
  name: string;
  desc: string;
  category: string;
  adminOnly?: boolean;
  moduleSlug?: string;
  credits?: number;
  examples?: string[];
  imageRequired?: boolean;
  /**
   * Group this tool with other steps of a multi-step workflow. Tools sharing
   * the same `workflowOf` value render as a numbered strip in the picker
   * with a "Select entire workflow" preset button.
   */
  workflowOf?: string;
  /** 1-based step number within `workflowOf`. Used for ordering + display. */
  workflowStep?: number;
}

export interface AgentDescriptor {
  id: string;
  name: string;
  description: string;
  /** Roles that can invoke this agent. */
  allowedRoles: Array<'viewer' | 'member' | 'admin' | 'owner'>;
  /** Tools available on this agent. */
  tools: AgentToolEntry[];
}

// ─────────────────────────────────────────────────────────────────────
// KAI — material intelligence (search, sub-agents, B2B, SEO, mentions,
// presentation sheets, pricing, generation)
// ─────────────────────────────────────────────────────────────────────

const KAI_TOOLS: AgentToolEntry[] = [
  // ── Search (all users) ────────────────────────────────────────────
  {
    id: 'knowledge_base_search', name: 'Knowledge Base', category: 'Search',
    desc: 'Search platform knowledge base documents. Best for "how do we…" / "what is…" questions about the product itself.',
    examples: [
      'Search the KB for "halfvec migration"',
      'How does the 7-vector fusion search work?',
    ],
  },
  {
    id: 'material_search', name: 'Material Search', category: 'Search',
    desc: '7-vector fusion search across the catalog: text + visual + understanding + color + texture + style + material.',
    examples: [
      'Find me 5 cement-based grey tiles for a modern bathroom',
      'Show me sustainable wood materials in green tones',
    ],
  },
  {
    id: 'visual_search', name: 'Visual Search', category: 'Search',
    desc: 'Find similar materials from an attached image (SLIG (SigLIP2)). Requires an image attached to the message.',
    imageRequired: true,
    examples: [
      'Find materials similar to this image',
    ],
  },
  {
    id: 'analyze_inspiration_url', name: 'Inspiration URL', category: 'Search',
    desc: 'Scrape any design webpage, extract color/material/style tokens, then match against the catalog.',
    credits: 1,
    examples: [
      'Analyze this Pinterest pin: https://www.pinterest.com/pin/12345/',
      'Pull design tokens from https://archdaily.com/some-project',
    ],
  },

  // ── Calculators (all users; deterministic, free) ──────────────────
  {
    id: 'calculate_heat_pump_sizing', name: 'Heat-pump Sizer', category: 'Calculators',
    credits: 0,
    desc: 'Estimate the heat-pump capacity (kW) a space needs from area, insulation, climate zone, ceiling height and emitter type. Free, instant, no upstream API.',
    examples: [
      'How big a heat pump do I need for a 120 m² apartment, post-1980, zone C, with fan coils?',
      'Size a heat pump for a 90 m² well-insulated house with underfloor heating in Athens',
    ],
  },
  {
    id: 'calculate_heating_cost_comparison', name: 'Heating Cost Compare', category: 'Calculators',
    credits: 0,
    desc: 'Compare the annual running cost of 6 heating methods (oil, gas, A/C, heat pump, fireplaces) for one dwelling. Free, instant, no upstream API.',
    examples: [
      'Compare heating costs for a 200 m² home at 132 kWh/m²·yr — which is cheapest to run?',
      'Is a heat pump cheaper to run than gas for my 150 m² apartment?',
    ],
  },

  // ── Mention monitoring (all users; module-gated; per-tool credits) ─
  {
    id: 'track_product_mentions', name: 'Track Mentions', category: 'Mentions',
    moduleSlug: 'mention-monitoring',
    desc: 'Start or stop persistent mention monitoring on a product. Discovers mentions across news, blogs, RSS, YouTube + LLM responses.',
    examples: [
      'Start tracking mentions for product 12345',
    ],
  },
  {
    id: 'get_mention_summary', name: 'Mention Summary', category: 'Mentions',
    moduleSlug: 'mention-monitoring',
    desc: 'Pull the rolling 7d/30d snapshot of mentions for a product (count, sentiment, top outlets).',
    examples: [
      'Show me the last 30 days of mentions for product 12345',
    ],
  },
  {
    id: 'check_llm_visibility', name: 'LLM Visibility', category: 'Mentions',
    moduleSlug: 'mention-monitoring', credits: 2,
    desc: 'Check share-of-voice across Haiku, GPT-4o-mini, Gemini Flash, Sonar. Set force_run:true to fire a fresh probe (15 cr).',
    examples: [
      'What\'s our LLM visibility for product 12345?',
      'Run a fresh LLM probe for the Flobali brand',
    ],
  },
  {
    id: 'find_negative_mentions', name: 'Negative Mentions', category: 'Mentions',
    moduleSlug: 'mention-monitoring',
    desc: 'List recent negative-sentiment mentions for a product. Use for reputation triage.',
    examples: [
      'Show me negative mentions for product 12345 in the last 30d',
    ],
  },

  // ── Price Monitoring (all users; module-gated; internal flow unmetered) ──
  {
    id: 'track_product_prices', name: 'Track Prices', category: 'Price Monitoring',
    moduleSlug: 'price-monitoring',
    desc: 'Start or stop competitor price monitoring on a product. Starting runs the first discovery refresh across retailers.',
    examples: [
      'Start tracking competitor prices for product 12345',
    ],
  },
  {
    id: 'get_price_summary', name: 'Price Summary', category: 'Price Monitoring',
    moduleSlug: 'price-monitoring',
    desc: 'Show the current cheapest verified price + the discovered retailer list for a product.',
    examples: [
      'What are competitors charging for product 12345?',
    ],
  },

  // ── Email Marketing (module + entitlement gated; draft-only) ──────────
  {
    id: 'manage_email_campaign', name: 'Email Campaigns', category: 'Email Marketing',
    moduleSlug: 'email-marketing',
    desc: 'List email campaigns/templates and compose a DRAFT campaign (name + template + audience). The agent drafts; you review + send from Marketing → Email.',
    examples: [
      'Draft a campaign to my architects category using the spring promo template',
      'List my email campaigns',
    ],
  },

  // ── Finance (module + entitlement gated; read-only) ──────────────────
  {
    id: 'manage_finance', name: 'Finance', category: 'Finance',
    moduleSlug: 'sales-finance',
    desc: 'Read finance data: list invoices (recent / per-customer / unpaid) and a customer\'s open A/R balance. Read-only — issuing invoices stays on the Finance page.',
    examples: [
      'What does ACME owe us?',
      'Show me unpaid invoices',
    ],
  },

  // ── CRM (workspace-scoped) ────────────────────────────────────────────
  {
    id: 'create_company_from_vat', name: 'Company from VAT', category: 'CRM',
    moduleSlug: 'crm',
    desc: 'Add a company to the CRM from a VAT / ΑΦΜ number — looks it up on ΑΑΔΕ (Greek) or VIES (EU) for the legal name + address, then creates it via crm-api.',
    examples: [
      'Add ΑΦΜ 094014201 to the CRM',
      'Create a company from VAT DE811128135',
    ],
  },

  // ── Contracts & e-signature (module + entitlement gated; send confirm-gated) ──
  {
    id: 'manage_contracts', name: 'Contracts', category: 'Contracts',
    moduleSlug: 'contracts',
    desc: 'List contracts and send a draft for e-signature (sending asks for Approve/Decline first).',
    examples: [
      'List our draft contracts',
      'Send contract … for signature',
    ],
  },

  // ── Customer Inbox (module + entitlement gated; customer-facing reply confirm-gated) ──
  {
    id: 'manage_inbox', name: 'Inbox', category: 'Inbox',
    moduleSlug: 'inbox',
    desc: 'List customer conversations and reply to one (a customer-facing reply asks for Approve/Decline first).',
    examples: [
      'Show my open customer conversations',
      'Reply to that thread …',
    ],
  },

  // ── Messaging / WhatsApp (module + entitlement gated; send confirm-gated) ──
  {
    id: 'manage_messaging', name: 'WhatsApp', category: 'Messaging',
    moduleSlug: 'messaging',
    desc: 'List connected WhatsApp channels and send a message (sending asks for Approve/Decline first).',
    examples: [
      'What WhatsApp numbers do we have connected?',
      'Send a WhatsApp to +30691… saying the order is ready',
    ],
  },

  // ── Job Research (all users; module-gated) ────────────────────────────
  {
    id: 'track_job_search', name: 'Track Job Search', category: 'Job Research',
    moduleSlug: 'job-research',
    desc: 'Create, update, pause, resume, or delete a background job search. Discovers postings across Google Jobs, Perplexity, RSS + career pages with a daily digest.',
    examples: [
      'Track senior Python developer jobs, remote only, daily digest at 9am',
    ],
  },
  {
    id: 'list_my_job_searches', name: 'My Job Searches', category: 'Job Research',
    moduleSlug: 'job-research',
    desc: 'List your active job searches with their cadence and latest match counts.',
    examples: [
      'List my job searches',
    ],
  },
  {
    id: 'find_jobs', name: 'Find Jobs', category: 'Job Research',
    moduleSlug: 'job-research',
    desc: 'Fetch recent matched listings for one of your tracked job searches.',
    examples: [
      'Show me new job matches from this week',
    ],
  },
  {
    id: 'get_job_digest_preview', name: 'Digest Preview', category: 'Job Research',
    moduleSlug: 'job-research',
    desc: "Preview today's consolidated job digest before it's sent.",
    examples: [
      'Preview my job digest for today',
    ],
  },
  {
    id: 'manage_job_sites', name: 'Manage Job Sites', category: 'Job Research',
    moduleSlug: 'job-research', adminOnly: true,
    desc: 'List / add / remove / toggle the platform-wide job-source sites (Perplexity domains, RSS feeds, career pages). Admin-only writes.',
    examples: [
      'Which job boards do you search?',
      'Add kariera.gr to the job search',
    ],
  },

  // ── Projects (all users) ──────────────────────────────────────────────
  {
    id: 'create_project', name: 'Create Project', category: 'Projects',
    desc: 'Create a new project to organize tasks and deliverables.',
    examples: [
      'Create a project called "Athens loft renovation"',
    ],
  },
  {
    id: 'list_my_projects', name: 'My Projects', category: 'Projects',
    desc: 'List your projects with status and task counts.',
    examples: [
      'List my projects',
    ],
  },
  {
    id: 'find_project', name: 'Find Project', category: 'Projects',
    desc: 'Look up a project by name or id and return its details + tasks.',
    examples: [
      'Find the "Athens loft renovation" project',
    ],
  },
  {
    id: 'add_task', name: 'Add Task', category: 'Projects',
    desc: 'Add a task to a project.',
    examples: [
      'Add a task "order travertine samples" to the Athens loft project',
    ],
  },

  // ── Quotes (all users; 0 credits) ─────────────────────────────────
  {
    id: 'create_quote', name: 'Create Quote', category: 'Quotes',
    desc: 'Build a real, editable quote from products (catalog or custom) and generate its branded PDF, opened on the canvas. Saves to the Quotes module.',
    examples: [
      'Create a quote: Tagina 75 sqm at €34/sqm and Keros 18 sqm at €15/sqm',
      'Make a quote for these products for the customer',
    ],
  },
  {
    id: 'generate_quote_pdf', name: 'Generate Quote PDF', category: 'Quotes',
    desc: 'Generate or regenerate the branded PDF for an existing quote and open it on the canvas.',
    examples: [
      'Regenerate the PDF for that quote',
    ],
  },
  {
    id: 'list_my_quotes', name: 'My Quotes', category: 'Quotes',
    desc: 'List recent quotes with status and totals.',
    examples: [
      'Show my recent quotes',
    ],
  },

  // ── SEO research (all users; 0 user credits) ──────────────────────
  {
    id: 'seo_research_keyword', name: 'SEO Research', category: 'SEO Research',
    desc: 'Full SERP research for one keyword: AI Overview, featured snippet, top organic, PAA, related searches, video carousel, knowledge graph state.',
    examples: [
      'Research the keyword "porcelain tile installation" in the UK',
      'What does Google show for "recycled concrete aggregates"?',
      'Audit "Flobali tiles" — include a domain snapshot for flobali.gr',
    ],
  },
  {
    id: 'seo_keyword_difficulty', name: 'Keyword Difficulty', category: 'SEO Research',
    desc: 'Bulk-score SEO ranking difficulty (0–100) for up to 1000 keywords in one call.',
    examples: [
      'What\'s the SEO difficulty of these 50 keywords I have in mind?',
    ],
  },
  {
    id: 'seo_keyword_suggestions', name: 'Keyword Suggestions', category: 'SEO Research',
    desc: 'Phrase-match keyword expansion. Returns up to 1000 keywords containing the seed phrase, with volume + competition.',
    examples: [
      'Expand "travertine sealer" — give me 50 suggestions with volume',
    ],
  },
  {
    id: 'seo_search_intent', name: 'Search Intent', category: 'SEO Research',
    desc: 'Bulk-classify keyword intent (informational / navigational / commercial / transactional).',
    examples: [
      'Classify the intent for these 30 keywords',
    ],
  },
  {
    id: 'seo_keyword_overview', name: 'Keyword Overview', category: 'SEO Research',
    desc: 'Single-call keyword overview: volume, KD, intent, CPC, monthly searches history. Bulk up to 700 keywords.',
    examples: [
      'Give me a full overview for these 20 keywords',
    ],
  },
  {
    id: 'seo_serp_audit', name: 'SERP Audit', category: 'SEO Research',
    desc: 'Fetch the raw, complete Google SERP for a keyword — every block type (organic, PAA, AI Overview, featured snippet, video, news, KG, paid, shopping).',
    examples: [
      'Pull the full SERP for "buy tile online"',
    ],
  },
  {
    id: 'seo_audit_url', name: 'URL Audit', category: 'SEO Research',
    desc: 'Audit any public URL — Lighthouse (perf / a11y / best-practices / SEO scores) + on-page issues + content parsing. Works on competitor pages too.',
    examples: [
      'Audit https://flobali.gr/products/porcelain-12mm',
      'Lighthouse audit https://carrelagedirect.fr',
    ],
  },

  // ── SEO domain intel ──────────────────────────────────────────────
  {
    id: 'seo_domain_snapshot', name: 'Domain Snapshot', category: 'SEO Domain',
    desc: 'Domain-level SEO snapshot: rank, organic ranking-keyword count, est. monthly traffic, referring domains, total backlinks.',
    examples: [
      'What\'s the SEO snapshot for flobali.gr?',
    ],
  },
  {
    id: 'seo_ranked_keywords', name: 'Ranked Keywords', category: 'SEO Domain',
    desc: 'Every keyword the domain currently ranks for — with rank position, volume, and estimated traffic share.',
    examples: [
      'What does flobali.gr rank for in Greece?',
    ],
  },
  {
    id: 'seo_domain_competitors', name: 'Domain Competitors', category: 'SEO Domain',
    desc: 'Top organic competitors for a domain — domains ranking on the same keyword set.',
    examples: [
      'Who competes with flobali.gr?',
    ],
  },
  {
    id: 'seo_keyword_gap', name: 'Keyword Gap', category: 'SEO Domain',
    desc: 'Keywords where COMPETITOR ranks but YOU do not — pure content-gap delta. Highest-leverage tool for finding what to write next.',
    examples: [
      'Find keyword gaps between flobali.gr and carrelagedirect.fr',
    ],
  },
  {
    id: 'seo_traffic_estimation', name: 'Traffic Estimation', category: 'SEO Domain',
    desc: 'Bulk-estimate monthly organic + paid traffic for up to 1000 domains in one call.',
    examples: [
      'Estimate monthly traffic for these 5 brand domains',
    ],
  },
  {
    id: 'seo_subdomains', name: 'Subdomains', category: 'SEO Domain',
    desc: 'List indexed subdomains of a target domain with their organic-ranking metrics.',
    examples: [
      'Show me all subdomains of shopify.com',
    ],
  },
  {
    id: 'seo_relevant_pages', name: 'Top Pages', category: 'SEO Domain',
    desc: 'Top-ranking pages of a domain by traffic share. Use to identify which page templates perform best.',
    examples: [
      'What are the top-traffic pages on flobali.gr?',
    ],
  },
  {
    id: 'seo_categories_for_domain', name: 'Domain Categories', category: 'SEO Domain',
    desc: 'What Google Ads categories the algorithm associates with a domain.',
    examples: [
      'What categories does Google associate with flobali.gr?',
    ],
  },

  // ── SEO backlinks ─────────────────────────────────────────────────
  {
    id: 'seo_backlinks_summary', name: 'Backlinks Summary', category: 'SEO Backlinks',
    desc: 'Backlinks overview: total backlinks, referring domains + TLDs, anchors, spam score, trust flow.',
    examples: [
      'Backlinks summary for flobali.gr',
    ],
  },
  {
    id: 'seo_backlinks_anchors', name: 'Anchor Texts', category: 'SEO Backlinks',
    desc: 'Top anchor texts pointing to a domain. Reveals brand-mention vs over-optimised patterns.',
    examples: [
      'Top anchor texts pointing to flobali.gr',
    ],
  },
  {
    id: 'seo_referring_domains', name: 'Referring Domains', category: 'SEO Backlinks',
    desc: 'List domains linking to a target. Use for backlink-profile analysis.',
    examples: [
      'List the domains linking to flobali.gr',
    ],
  },

  // ── SEO OnPage / site crawl ───────────────────────────────────────
  {
    id: 'seo_site_crawl_start', name: 'Site Crawl Start', category: 'SEO OnPage',
    desc: 'Kick off a full DataForSEO OnPage crawl of a domain (up to 1000 pages). Returns task_id immediately.',
    examples: [
      'Crawl flobali.gr (up to 100 pages)',
    ],
  },
  {
    id: 'seo_site_crawl_status', name: 'Site Crawl Status', category: 'SEO OnPage',
    desc: 'Poll a running site-crawl by task_id. Returns crawl_progress, page metrics, broken links, redirect chains, duplicate titles.',
    examples: [
      'Check the status of crawl task abc-123',
    ],
  },

  // ── SEO content + analytics ───────────────────────────────────────
  {
    id: 'seo_content_sentiment', name: 'Content Sentiment', category: 'SEO Content',
    desc: 'Sentiment distribution across all open-web mentions of a keyword.',
    examples: [
      'What\'s the sentiment around "Flobali tiles" on the open web?',
    ],
  },
  {
    id: 'seo_domain_technologies', name: 'Tech Stack', category: 'SEO Content',
    desc: 'Tech stack identification — CMS, analytics, CDN, JS frameworks, e-commerce platform, marketing tools.',
    examples: [
      'What tech stack does flobali.gr use?',
    ],
  },
  {
    id: 'seo_domain_whois', name: 'Domain WHOIS', category: 'SEO Content',
    desc: 'Domain WHOIS data + age + registrar.',
    examples: [
      'Show WHOIS for flobali.gr',
    ],
  },
  {
    id: 'seo_historical_serps', name: 'Historical SERPs', category: 'SEO Content',
    desc: 'Historical SERP snapshots for a keyword. Track how positions changed over time.',
    examples: [
      'Show historical SERPs for "porcelain tile" between 2025-01 and 2025-12',
    ],
  },
  {
    id: 'seo_ai_keyword_volume', name: 'AI Search Volume', category: 'SEO Content',
    desc: 'LLM-search keyword volume — how often a query is asked of AI engines (different from Google Ads volume).',
    examples: [
      'AI search volume for these 20 keywords',
    ],
  },

  // ── SEO multi-engine ──────────────────────────────────────────────
  {
    id: 'seo_llm_mentions_search', name: 'LLM Mentions', category: 'SEO Multi-Engine',
    desc: 'DataForSEO native LLM-mention search. Pages and domains LLMs cite when answering questions about a keyword.',
    examples: [
      'What pages do LLMs cite for "recycled concrete aggregates"?',
    ],
  },
  {
    id: 'seo_youtube_search', name: 'YouTube Search', category: 'SEO Multi-Engine',
    desc: 'YouTube organic search — top videos for a keyword with view counts, channel, duration.',
    examples: [
      'YouTube search for "porcelain tile installation"',
    ],
  },
  {
    id: 'seo_local_pack', name: 'Local Pack', category: 'SEO Multi-Engine',
    desc: 'Google Maps 3-pack for a keyword in a specific country. Use for local SEO research.',
    examples: [
      'Local pack for "tile shop in Athens"',
    ],
  },
  {
    id: 'seo_google_trends', name: 'Google Trends', category: 'SEO Multi-Engine',
    desc: 'Google Trends interest-over-time + regional breakdown for up to 5 keywords.',
    examples: [
      'Google Trends for "travertine" over the past 12 months',
    ],
  },

  // ── SEO niche ─────────────────────────────────────────────────────
  {
    id: 'seo_amazon_asin', name: 'Amazon ASIN', category: 'SEO Niche',
    desc: 'Amazon SEO — list every keyword an ASIN ranks for, with rank and volume.',
    examples: [
      'What does ASIN B07ZPKBL9V rank for on Amazon?',
    ],
  },
  {
    id: 'seo_app_keywords', name: 'App Keywords', category: 'SEO Niche',
    desc: 'Mobile-app SEO — keywords a Google Play / Apple App Store app ranks for.',
    examples: [
      'ASO keywords for app com.figma.figma on Google Play',
    ],
  },
  {
    id: 'seo_trustpilot_search', name: 'Trustpilot Search', category: 'SEO Niche',
    desc: 'Find Trustpilot business listings with ratings + review counts.',
    examples: [
      'Trustpilot listings for "Flobali"',
    ],
  },
  {
    id: 'seo_pinterest_search', name: 'Pinterest Search', category: 'SEO Niche',
    desc: 'Pinterest pin/board search for a keyword. Surfaces visual-trend signal.',
    examples: [
      'Pinterest search for "Mediterranean kitchen"',
    ],
  },
  {
    id: 'seo_reddit_search', name: 'Reddit Search', category: 'SEO Niche',
    desc: 'Reddit thread search for a keyword. Surfaces real user discussion + pain points.',
    examples: [
      'Reddit threads about "best porcelain tile installer"',
    ],
  },

  // ── SEO composite audits ──────────────────────────────────────────
  {
    id: 'seo_site_review', name: 'Site Review', category: 'SEO Composite',
    desc: 'Multi-section domain audit: rank overview + top ranking keywords + competitors + backlinks summary + top anchors. ONE tool call.',
    examples: [
      'Run a full site review of flobali.gr',
    ],
  },
  {
    id: 'seo_brand_search_audit', name: 'Brand Search Audit', category: 'SEO Composite',
    desc: 'SERP audit for "{brand}" query. Surfaces Knowledge Panel, AI Overview brand mention, organic listings, paid bids on own brand.',
    examples: [
      'Run a brand-search audit for "Flobali"',
    ],
  },

  // ── Sub-agents (admin/owner only) ─────────────────────────────────
  {
    id: 'research_analysis', name: 'Research Sub-agent', category: 'Sub-Agents',
    adminOnly: true,
    desc: 'Deep-research sub-agent. Use for multi-step open-ended research questions.',
    examples: [
      'Run a deep research analysis on the EU Green Deal\'s impact on construction materials',
    ],
  },
  {
    id: 'analytics_analysis', name: 'Analytics Sub-agent', category: 'Sub-Agents',
    adminOnly: true,
    desc: 'Analytics sub-agent. Use for queries about platform usage / metric breakdowns.',
    examples: [
      'How many active subjects do we have in mention monitoring this week?',
    ],
  },
  {
    id: 'business_analysis', name: 'Business Sub-agent', category: 'Sub-Agents',
    adminOnly: true,
    desc: 'Business sub-agent. Use for revenue / customer / GMV-style questions.',
    examples: [
      'Break down our top 10 customers by quote value this quarter',
    ],
  },
  {
    id: 'product_analysis', name: 'Product Sub-agent', category: 'Sub-Agents',
    adminOnly: true,
    desc: 'Product sub-agent. Use for catalog-wide questions.',
    examples: [
      'Show me products with no images and incomplete spec extraction',
    ],
  },

  // ── B2B Research (admin/owner only) ───────────────────────────────
  {
    id: 'b2b_manufacturer_search', name: 'Manufacturer Search', category: 'B2B Research',
    adminOnly: true,
    desc: 'Find manufacturers in target markets via web search (Anthropic web_search tool).',
    examples: [
      'Find me 10 porcelain tile manufacturers in Spain',
      'Search for kitchen-cabinet factories in Italy',
    ],
  },
  {
    id: 'company_website_scrape', name: 'Website Scrape', category: 'B2B Research',
    adminOnly: true,
    desc: 'Scrape a company website to extract address, phone, email, products.',
    examples: [
      'Scrape https://example-factory.com',
    ],
  },
  {
    id: 'company_enrichment', name: 'Company Enrichment', category: 'B2B Research',
    adminOnly: true,
    desc: 'Apollo.io company data — employees, revenue, funding, tech.',
    examples: [
      'Enrich data for example.com',
    ],
  },
  {
    id: 'contact_discovery', name: 'Contact Discovery', category: 'B2B Research',
    adminOnly: true,
    desc: 'Find + verify contact emails for a company.',
    examples: [
      'Find decision-maker emails at example.com',
    ],
  },
  {
    id: 'email_validate', name: 'Email Validate', category: 'B2B Research',
    adminOnly: true,
    desc: 'ZeroBounce email validation — check deliverability, role, disposable.',
    examples: [
      'Validate alex@example.com',
    ],
  },
  {
    id: 'save_to_crm', name: 'Save to CRM', category: 'B2B Research',
    adminOnly: true,
    desc: 'Persist a discovered company / contact to the CRM.',
    examples: [
      'Save the last manufacturer to CRM',
    ],
  },

  // ── SEO Article Pipeline (admin/owner only) ───────────────────────
  {
    id: 'create_seo_article', name: 'Full SEO Pipeline', category: 'SEO Article',
    adminOnly: true, credits: 30,
    desc: 'Run the full SEO article pipeline: research → plan → write → analyze with auto-fix. Returns article_id immediately, processes in background.',
    examples: [
      'Generate a complete SEO article for "recycled concrete aggregates" targeting the UK market',
    ],
  },
  {
    id: 'seo_keyword_research', name: 'Article: Research', category: 'SEO Article',
    adminOnly: true, credits: 18,
    desc: 'Stage 1 of the article pipeline. Full DataForSEO keyword research with content analysis.',
  },
  {
    id: 'seo_article_planner', name: 'Article: Plan', category: 'SEO Article',
    adminOnly: true, credits: 2,
    desc: 'Stage 2 — create a structured article plan from keyword research.',
  },
  {
    id: 'seo_article_writer', name: 'Article: Write', category: 'SEO Article',
    adminOnly: true, credits: 20,
    desc: 'Stage 3 — generate full article from a plan.',
  },
  {
    id: 'seo_content_analyzer', name: 'Article: Analyze', category: 'SEO Article',
    adminOnly: true,
    desc: 'Stage 4 — score article against 21 SEO + GEO checks; auto-fix iterations.',
  },

  // ── Background + admin ────────────────────────────────────────────
  {
    id: 'dispatch_background_task', name: 'Background Task', category: 'Admin',
    adminOnly: true,
    desc: 'Dispatch a long-running task to MIVAA (>25s).',
  },
  {
    id: 'price_lookup', name: 'Price Lookup', category: 'Admin',
    adminOnly: true,
    desc: 'Pricing lookup from the Pricing KB category (admin-curated price data).',
  },
  {
    id: 'seo_dataforseo_call', name: 'DataForSEO Escape Hatch', category: 'Admin',
    adminOnly: true,
    desc: 'Call any DataForSEO endpoint by name when no specific tool fits. Advanced.',
  },

  // ── Presentation Catalogs (admin/owner only) ──────────────────────
  // Multi-step workflow — pick all 8 with the "Select entire workflow"
  // preset in the picker, or fire the comprehensive starter prompt on
  // step 1 to drive the whole flow from a single message.
  {
    id: 'create_catalog', name: 'Create Catalog', category: 'Catalogs',
    adminOnly: true, moduleSlug: 'presentation-catalogs',
    workflowOf: 'catalog', workflowStep: 1,
    desc: 'Step 1 of 8 — initialize a draft catalog and get a catalog_id. Then run the rest of the Catalogs workflow (Attach → Extract → Add → Find Image → Generate → Publish → Send).',
    examples: [
      'Build me a complete catalog called "Spring 2026 — Porcelain Range" from these source PDFs: <pdf_id_1>, <pdf_id_2>. Pull all white porcelain tiles, generate the PDF, then publish.',
      'Start a new catalog "Spring 2026 — Porcelain Range" for Vasilis Imports.',
    ],
  },
  {
    id: 'attach_catalog_pdfs', name: 'Attach Source PDFs', category: 'Catalogs',
    adminOnly: true, moduleSlug: 'presentation-catalogs',
    workflowOf: 'catalog', workflowStep: 2,
    desc: 'Step 2 of 8 — link manufacturer PDFs (uploaded at /admin/catalogs/sources) to the catalog. Required before Extract or Translate.',
    examples: [
      'Attach these source PDFs to my catalog: <pdf_id_1>, <pdf_id_2>',
    ],
  },
  {
    id: 'extract_from_catalog_pdfs', name: 'Extract from PDFs', category: 'Catalogs',
    adminOnly: true, moduleSlug: 'presentation-catalogs',
    workflowOf: 'catalog', workflowStep: 3,
    desc: 'Step 3 of 8 — free-form Vision query over attached PDFs. Returns candidates with bbox-cropped images that you approve inline in chat.',
    examples: [
      'From the attached PDFs, pull all white porcelain tiles with rectified edges',
      'Find all 12mm-thick wood floor options from the catalogs I attached',
    ],
  },
  {
    id: 'translate_pdf_to_catalog', name: 'Translate PDF', category: 'Catalogs',
    adminOnly: true, moduleSlug: 'presentation-catalogs',
    workflowOf: 'catalog', workflowStep: 4,
    desc: 'Step 4 of 8 (alternative to Extract) — whole-PDF → catalog body in one Vision pass. Use when you want the full manufacturer catalog mirrored.',
    examples: [
      'Translate this manufacturer PDF into a new catalog and group materials by category',
      'Mirror this catalog page-by-page into a new draft',
    ],
  },
  {
    id: 'add_material_to_catalog', name: 'Add Material', category: 'Catalogs',
    adminOnly: true, moduleSlug: 'presentation-catalogs',
    workflowOf: 'catalog', workflowStep: 5,
    desc: 'Step 5 of 8 — add one material manually with price from catalog_product / price_monitoring / market_check / manual. Use for materials NOT in the source PDFs.',
    examples: [
      'Add Crema Marfil 600x600 at €24.50 to the "Porcelain Tiles" section',
      'Add product <product_id> to the "Wood" section, pulling price from price monitoring',
    ],
  },
  {
    id: 'find_image_for_material', name: 'Find Image', category: 'Catalogs',
    adminOnly: true, moduleSlug: 'presentation-catalogs',
    workflowOf: 'catalog', workflowStep: 6,
    desc: 'Step 6 of 8 — search platform DB first, then web, for candidate images for a material. Run after Add Material when needs_image:true.',
    examples: [
      'Find candidate images for "Travertine Classic 600x1200"',
    ],
  },
  {
    id: 'adjust_catalog_pricing', name: 'Adjust Pricing', category: 'Catalogs',
    adminOnly: true, moduleSlug: 'presentation-catalogs',
    workflowOf: 'catalog',
    desc: 'Optional (run any time before Generate) — re-price the whole catalog/proforma without inventing numbers: set the total ("€2,438"), add/subtract across the doc ("+€400"), a percent ("+15%"), or a flat amount on every line ("+€25 per item"). Discount % + VAT are preserved and the rounding lands the total exactly. Only touches this catalog, never the source.',
    examples: [
      'Re-price catalog <catalog_id> so the payable total is €2,438',
      'Add €400 to catalog <catalog_id>',
      'Increase every price in catalog <catalog_id> by 15%',
      'Add €25 per item to catalog <catalog_id>',
    ],
  },
  {
    id: 'generate_catalog_pdf', name: 'Generate PDF', category: 'Catalogs',
    adminOnly: true, moduleSlug: 'presentation-catalogs',
    workflowOf: 'catalog', workflowStep: 7,
    desc: 'Step 7 of 8 — render the catalog body as A4 PDF (cover + body + back cover) using its template. Returns a 7-day signed URL.',
    examples: [
      'Generate the PDF for catalog <catalog_id>',
    ],
  },
  {
    id: 'publish_catalog', name: 'Publish Catalog', category: 'Catalogs',
    adminOnly: true, moduleSlug: 'presentation-catalogs',
    workflowOf: 'catalog', workflowStep: 8,
    desc: 'Step 8 of 8 — mint a public slug and flip status to published. Returns app.materialshub.gr/c/<slug> for email-gated visitor access. Once published, use the "Send to Customers" button on /admin/catalogs/:id to email it via CRM categories.',
    examples: [
      'Publish catalog <catalog_id> with slug "spring-2026-porcelain"',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────
// Interior Designer — material search + 3D + lighting + VR + sheets +
// SEO research card (helps designers research aesthetics)
// ─────────────────────────────────────────────────────────────────────

const INTERIOR_DESIGNER_TOOLS: AgentToolEntry[] = [
  {
    id: 'material_search', name: 'Material Search', category: 'Search',
    desc: 'Find materials matching the design request.',
    examples: [
      'Find me 5 rugs for a Mediterranean living room',
    ],
  },
  {
    id: 'analyze_inspiration_url', name: 'Inspiration URL', category: 'Search',
    credits: 1,
    desc: 'Pull design tokens from any webpage and match against the catalog.',
    examples: [
      'Analyze https://www.pinterest.com/pin/12345',
    ],
  },
  {
    id: 'generate_3d', name: '3D Generation', category: 'Generation',
    desc: 'Generate a 3D render via Replicate or Gemini. Async — returns a job ID.',
    examples: [
      'Render a modern Athens loft kitchen with travertine floors',
    ],
  },
  {
    id: 'apply_lighting_preset', name: 'Lighting Preset', category: 'Generation',
    imageRequired: true,
    desc: 'Re-render an existing room image under a different lighting preset (Natural Daylight / Golden Hour / Showroom Spots / etc.).',
    examples: [
      'Re-render this room under "Golden Hour" lighting',
    ],
  },
  {
    id: 'generate_vr_world', name: 'VR World', category: 'Generation',
    imageRequired: true, credits: 18,
    desc: 'Generate an explorable 3D Gaussian Splat world from a room image (WorldLabs Marble).',
    examples: [
      'Build a VR world for this room (draft model)',
    ],
  },
  {
    id: 'generate_presentation_sheet', name: 'Presentation Sheet', category: 'Generation',
    desc: 'Build A3 moodboard sheets (material board / color palette / concept board / lighting plan / annotated render / etc.).',
    examples: [
      'Generate a concept board for moodboard "Modern Athens Loft"',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────
// Demo — admin showcase
// ─────────────────────────────────────────────────────────────────────

const DEMO_TOOLS: AgentToolEntry[] = [];

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

export const AGENTS: AgentDescriptor[] = [
  {
    id: 'kai',
    name: 'KAI Agent',
    description: 'Material intelligence — search, sub-agents, B2B, SEO, mentions, presentation sheets, pricing. The default agent for most queries.',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    tools: KAI_TOOLS,
  },
  {
    id: 'interior-designer',
    name: 'Interior Designer',
    description: 'AI-powered interior design with spatial analysis and material matching. 3D + lighting + VR generation.',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    tools: INTERIOR_DESIGNER_TOOLS,
  },
  {
    id: 'demo',
    name: 'Demo Agent',
    description: 'Platform showcase — admin only.',
    allowedRoles: ['admin', 'owner'],
    tools: DEMO_TOOLS,
  },
];

/** Get the agent the user can invoke given their role. Filters tool list by RBAC. */
export function getAccessibleAgents(role: 'viewer' | 'member' | 'admin' | 'owner'): AgentDescriptor[] {
  const isAdmin = role === 'admin' || role === 'owner';
  return AGENTS
    .filter((a) => a.allowedRoles.includes(role))
    .map((a) => ({
      ...a,
      tools: a.tools.filter((t) => isAdmin || !t.adminOnly),
    }));
}

/** Find a tool by id across all agents. */
export function findTool(toolId: string): AgentToolEntry | undefined {
  for (const a of AGENTS) {
    const t = a.tools.find((x) => x.id === toolId);
    if (t) return t;
  }
  return undefined;
}

// ═════════════════════════════════════════════════════════════════════════════
// TOOLKITS
// ─────────────────────────────────────────────────────────────────────────────
// Tools are grouped into named "toolkits" so the user can enable / disable a
// whole capability cluster at once instead of ticking 50 checkboxes. The agent
// gets only the LEAN core toolkit by default (massive token savings) and can
// either (a) call the `load_toolkit` meta-tool mid-conversation if it needs
// more, or (b) the user can pre-enable toolkits from the visual picker.
//
// Token estimate: ~250 tokens per tool definition. Cards in the picker show
// the rough cost so users can see what they're spending.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * One field in a quick-start's collect-then-send form. Rendered generically by
 * ToolkitFormModal. The `key` is referenced from `promptTemplate` as `{{key}}`.
 */
export type ToolkitFormFieldKind = 'text' | 'textarea' | 'number' | 'select' | 'country' | 'country_code' | 'tags' | 'image';

export interface ToolkitFormFieldOption {
  value: string;
  label: string;
}

export interface ToolkitFormField {
  /** Template key — referenced as `{{key}}` in `promptTemplate`. */
  key: string;
  /** Label shown above the input. */
  label: string;
  kind: ToolkitFormFieldKind;
  placeholder?: string;
  /** Help text under the field. */
  help?: string;
  /** Required fields block submit until filled. */
  required?: boolean;
  /** Default value (string for all kinds; comma-joined for `tags`). */
  default?: string;
  /** Options for kind='select'. */
  options?: ToolkitFormFieldOption[];
}

/**
 * Deterministic-run descriptor. When a quick-start carries `run`, submitting its
 * form does NOT inject a prompt for the LLM to interpret — instead the collected
 * field values are mapped to the target tool's structured arguments and the tool
 * is invoked directly (mode:'direct_tool' on agent-chat), bypassing the model.
 * RBAC + toolkit gating still apply server-side (the owning toolkit is sent in
 * selected_toolkits; admin-only tools never bind for non-admins).
 *
 * Omit `run` to keep the legacy behavior: render `promptTemplate`/`prompt` and
 * auto-send it as a chat message (right for multi-step workflows + creative seeds).
 */
export interface ToolkitQuickStartRun {
  /** Target agent tool id (must match a registered tool name). */
  tool: string;
  /**
   * Map form-field `key` → tool argument name. Fields not listed map to a tool
   * arg of the same name (identity). Fields that map to nothing are dropped.
   */
  argMap?: Record<string, string>;
  /** Static args merged into every run (e.g. a fixed `action: 'start'`). */
  fixedArgs?: Record<string, unknown>;
  /**
   * Per-tool-arg value coercion (keyed by the RESOLVED tool-arg name):
   *  - 'number' → Number(value)
   *  - 'csv'    → split on commas → string[]
   *  - 'lines'  → split on newlines/commas → string[]
   * Text fields without a coercion pass through as trimmed strings.
   */
  coerce?: Record<string, 'number' | 'csv' | 'lines'>;
}

/**
 * Image-generation handoff descriptor for a toolkit quick-start (interior flows).
 */
export interface ToolkitQuickStartGeneration {
  /**
   * Form `image`-field keys whose captured photos become the sent message's
   * attached images, in order (e.g. ['photo'] or ['inspiration','room']).
   */
  imageKeys: string[];
  /**
   * Generation pipeline to force as `selectedGenerationMode` on the send:
   * 'image-edit' | 'redesign' | 'copy-style' | 'floor-plan-render'. Omit to let
   * the interior agent route from the rendered prompt (used by re-light → the
   * lighting tool, and VR world → the VR tool).
   */
  mode?: string;
  /**
   * Instead of auto-sending, seed the captured photo into a guided builder and
   * open it (the staging wizard collects style/furniture; the gemini-edit canvas
   * collects edit categories). The photo is attached first either way.
   */
  opensModal?: 'virtual-staging' | 'gemini-edit';
}

export interface ToolkitQuickStart {
  /** Short button label, 1–4 words. */
  label: string;
  /** One-line explanation shown under the label. */
  description: string;
  /** Prompt injected into the chat input + auto-sent when the user clicks the button. */
  prompt: string;
  /** Lucide icon name. */
  icon?: string;
  /** Optional workflow_id this quick-start kicks off — used by the WorkflowTracker. */
  workflow_id?: string;
  /**
   * Optional declarative form. When present, clicking the quick-start opens
   * ToolkitFormModal to COLLECT these fields first, then renders
   * `promptTemplate` with the collected values and auto-sends — instead of
   * firing `prompt` and having the agent ask follow-up questions in chat.
   */
  form?: ToolkitFormField[];
  /**
   * Template used with `form`. Placeholders `{{key}}` are substituted with the
   * collected values. Falls back to `prompt` when omitted.
   */
  promptTemplate?: string;
  /**
   * When present, this quick-start runs its target tool deterministically from
   * the collected form values instead of sending a prompt. See ToolkitQuickStartRun.
   */
  run?: ToolkitQuickStartRun;
  /**
   * Image-generation handoff for the interior-design flows. When present, the
   * `form` (which MUST include the `image` field(s) named in `imageKeys`) is the
   * step-by-step capture surface; on submit the captured photo(s) become the
   * message's attached images, the generation pipeline is forced via `mode`, the
   * `promptTemplate` is rendered from the remaining text fields, and ONE complete
   * generation message is auto-sent. Mirrors `run`, but for the image pipelines
   * (image-edit / redesign / floor-plan-render / virtual-staging / re-light / VR)
   * instead of a deterministic tool call. This replaces the old `opensModal` +
   * bare-prompt path that dead-ended when no photo was attached yet.
   */
  generation?: ToolkitQuickStartGeneration;
  /**
   * When set, clicking this quick-start opens an interactive design modal in
   * AgentHub (a guided canvas) instead of just sending a prompt. The host maps
   * the id to the right surface:
   *   - 'new-design'      → from-scratch room designer (room/style/details)
   *   - 'virtual-staging' → stage an attached room photo with furniture
   *   - 'gemini-edit'     → targeted edit / apply-material on an attached photo
   * If the host can't open the modal (e.g. no image yet) it falls back to
   * sending `prompt`, so the quick-start is never inert.
   */
  opensModal?: 'new-design' | 'virtual-staging' | 'gemini-edit';
  /**
   * When set, clicking this quick-start opens the guided SheetWizardModal with
   * this sheet type pre-selected (the moodboard is chosen inside the wizard).
   * Replaces the old "seed a chat prompt and let the agent ask" flow for
   * presentation sheets. Value is a sheet_type slug (e.g. 'material_board').
   */
  opensSheetWizard?: string;
  /** Hint that this process needs an attached image to do its best work. */
  imageRequired?: boolean;
}

export interface ToolkitDefinition {
  id: string;
  name: string;
  description: string;
  /** Lucide icon name. */
  icon: string;
  tool_ids: string[];
  /** Visible only to admin/owner. */
  adminOnly?: boolean;
  /** Hidden when the module slug is disabled in public.modules. */
  moduleSlug?: string;
  /** When true, this toolkit is always loaded (cannot be disabled by the user). */
  alwaysOn?: boolean;
  /**
   * 1–4 starter actions surfaced in the ToolkitOnboardingCard the moment the
   * toolkit is enabled (or in the empty state when the chat has no messages
   * yet). Each click pre-fills the chat with `prompt` so the agent has a
   * concrete next step. Without these the user enables the toolkit and is
   * left staring at a blank chat wondering what to ask.
   */
  quick_starts?: ToolkitQuickStart[];
}

const APPROX_TOKENS_PER_TOOL = 250;

export const TOOLKITS: ToolkitDefinition[] = [
  {
    id: 'core',
    name: 'Core',
    description: 'Always-loaded essentials: knowledge base + catalog + visual + inspiration search, plus load_toolkit so the agent can pull more tools on demand.',
    icon: 'Compass',
    alwaysOn: true,
    tool_ids: [
      'knowledge_base_search', 'material_search', 'visual_search', 'analyze_inspiration_url',
    ],
    quick_starts: [
      {
        label: 'Find materials', description: 'Search the catalog by description', icon: 'Search',
        prompt: 'Find me 5 cement-based grey tiles for a modern bathroom',
        promptTemplate: 'Find me {{count}} {{description}}.',
        run: { tool: 'material_search', argMap: { description: 'query', count: 'limit' }, coerce: { limit: 'number' } },
        form: [
          { key: 'description', label: 'What are you looking for?', kind: 'text', required: true, placeholder: 'cement-based grey tiles for a modern bathroom' },
          { key: 'count', label: 'How many results?', kind: 'number', default: '5' },
        ],
      },
      {
        label: 'Search the KB', description: 'Look up platform docs', icon: 'Compass',
        prompt: 'How does the 7-vector fusion search work?',
        promptTemplate: 'Search the knowledge base: {{query}}',
        run: { tool: 'knowledge_base_search' },
        form: [
          { key: 'query', label: 'What do you want to look up?', kind: 'text', required: true, placeholder: 'How does the 7-vector fusion search work?' },
        ],
      },
    ],
  },
  {
    id: 'catalogs',
    name: 'Catalogs',
    description: 'Build email-gated catalog landing pages from manufacturer PDFs. 8-step workflow + optional re-pricing.',
    icon: 'BookOpen',
    adminOnly: true,
    moduleSlug: 'presentation-catalogs',
    tool_ids: [
      'create_catalog', 'attach_catalog_pdfs', 'extract_from_catalog_pdfs',
      'translate_pdf_to_catalog', 'add_material_to_catalog', 'find_image_for_material',
      'adjust_catalog_pricing', 'generate_catalog_pdf', 'publish_catalog',
    ],
    quick_starts: [
      {
        label: 'Build my first catalog',
        description: 'Walk me through the 8-step builder from scratch',
        prompt: 'Build a new catalog, then guide me through attaching source PDFs, extracting sections, generating the PDF, and publishing.',
        icon: 'Plus',
        workflow_id: 'catalog-build',
        promptTemplate: 'Start a new catalog titled "{{title}}" for {{client}}, then walk me through attaching source PDFs, extracting sections, generating the PDF, and publishing.',
        form: [
          { key: 'title', label: 'Catalog title', kind: 'text', required: true, placeholder: 'Spring 2026 — Porcelain Range' },
          { key: 'client', label: 'Client name', kind: 'text', required: true, placeholder: 'Vasilis Imports' },
        ],
      },
      {
        label: 'Translate an existing PDF',
        description: 'Mirror a manufacturer PDF as a new catalog in one Vision pass',
        prompt: 'Translate one of my uploaded source PDFs into a brand-new catalog.',
        icon: 'BookOpen',
        workflow_id: 'catalog-translate',
      },
      {
        label: 'Resume a draft',
        description: 'Continue building an in-progress catalog',
        prompt: 'List my draft catalogs and let me pick one to keep building.',
        icon: 'PencilLine',
        workflow_id: 'catalog-resume',
      },
      {
        label: 'Generate PDF (grid or list)',
        description: 'Render the catalog PDF — pick a table list or an image grid',
        icon: 'FileText',
        prompt: 'Generate the PDF for one of my catalogs.',
        promptTemplate: 'Generate the PDF for catalog "{{catalog}}" using the {{layout}} layout{{proforma}}.',
        form: [
          { key: 'catalog', label: 'Which catalog?', kind: 'text', required: true, placeholder: 'Spring 2026 — Porcelain Range' },
          { key: 'layout', label: 'Layout', kind: 'select', default: 'table list', options: [
            { value: 'table list', label: 'Table list (quote-style)' },
            { value: 'image grid', label: 'Image grid (cards)' },
          ] },
          { key: 'proforma', label: 'Totals block?', kind: 'select', default: '', options: [
            { value: '', label: 'No — plain catalog' },
            { value: ', as a proforma with a totals block', label: 'Yes — proforma with totals' },
          ] },
        ],
      },
      {
        label: 'Send a published catalog',
        description: 'Email a published catalog to CRM categories',
        prompt: 'Show me my published catalogs so I can pick one to send to selected CRM categories.',
        icon: 'Send',
        workflow_id: 'catalog-send',
      },
      {
        label: 'Adjust pricing',
        description: 'Re-price a catalog / proforma to a target total, +€, or +%',
        icon: 'Percent',
        prompt: 'Re-price one of my catalogs to a target total.',
        promptTemplate: 'Re-price catalog "{{catalog}}" so the {{basis}} total becomes {{target}}. Scale every line proportionally, keep each line\'s discount %, then regenerate the PDF.',
        form: [
          { key: 'catalog', label: 'Which catalog / proforma?', kind: 'text', required: true, placeholder: 'Προσφορά ΠΡΦ-20-01645' },
          { key: 'basis', label: 'Which total?', kind: 'select', default: 'payable (VAT included)', options: [
            { value: 'payable (VAT included)', label: 'Payable — VAT included' },
            { value: 'net (before VAT)', label: 'Net — before VAT' },
          ] },
          { key: 'target', label: 'Target total or change', kind: 'text', required: true, placeholder: '€2,438  ·  +400  ·  +15%  ·  +25 per item' },
        ],
      },
    ],
  },
  {
    id: 'mentions',
    name: 'Mention Monitoring',
    description: 'Track product / brand / keyword mentions across news, blogs, RSS, YouTube + LLM probes.',
    icon: 'Megaphone',
    moduleSlug: 'mention-monitoring',
    tool_ids: [
      'track_product_mentions', 'get_mention_summary', 'check_llm_visibility', 'find_negative_mentions',
    ],
    quick_starts: [
      {
        label: 'Track a brand', description: 'Start monitoring a brand across news + blogs + LLM responses', icon: 'Plus',
        prompt: 'Start tracking mentions for a brand.',
        promptTemplate: 'Start tracking mentions for "{{subject}}" across {{sources}}. Configure alerts for spikes and negative sentiment.',
        form: [
          { key: 'subject', label: 'Brand / product / keyword to track', kind: 'text', required: true, placeholder: 'Flobali' },
          { key: 'sources', label: 'Sources', kind: 'select', default: 'news, blogs, RSS and LLM responses', options: [
            { value: 'news, blogs, RSS and LLM responses', label: 'News + blogs + RSS + LLM (all)' },
            { value: 'news and blogs', label: 'News + blogs only' },
            { value: 'LLM responses', label: 'LLM responses only' },
          ] },
        ],
      },
      {
        label: 'Check LLM visibility', description: 'See where major LLMs cite us', icon: 'Bot',
        prompt: 'Show me the LLM visibility snapshot for a tracked brand.',
        promptTemplate: 'Show me the LLM visibility snapshot for "{{subject}}".',
        form: [
          { key: 'subject', label: 'Which tracked brand / subject?', kind: 'text', required: true, placeholder: 'Flobali' },
        ],
      },
      { label: 'Find negatives', description: 'Surface negative-sentiment mentions for triage', prompt: 'List the most recent negative-sentiment mentions for any of my tracked subjects so I can triage them.', icon: 'AlertCircle' },
    ],
  },
  {
    id: 'price-monitoring',
    name: 'Price Monitoring',
    description: 'Track what competitors charge for your products across retailers (Perplexity + DataForSEO + Firecrawl verification).',
    icon: 'Percent',
    moduleSlug: 'price-monitoring',
    tool_ids: ['track_product_prices', 'get_price_summary'],
    quick_starts: [
      { label: 'Track prices', description: 'Start monitoring competitor prices on a product', prompt: 'Start tracking competitor prices for one of my products — help me pick which one.', icon: 'Plus' },
      { label: 'Price check', description: 'See current competitor prices for a product', prompt: 'Show me what competitors are charging for one of my tracked products.', icon: 'Search' },
    ],
  },
  {
    id: 'contracts',
    name: 'Contracts',
    description: 'List contracts and send drafts for e-signature (sending asks to Approve first).',
    icon: 'FileText',
    moduleSlug: 'contracts',
    tool_ids: ['manage_contracts'],
    quick_starts: [
      { label: 'My contracts', description: 'List recent contracts', prompt: 'List my recent contracts and their status.', icon: 'ListChecks' },
      { label: 'Send for signature', description: 'Send a draft contract to sign', prompt: 'Send a draft contract for e-signature — help me pick which one.', icon: 'Send' },
    ],
  },
  {
    id: 'inbox',
    name: 'Inbox',
    description: 'List customer conversations and reply to one (a customer-facing reply asks to Approve first).',
    icon: 'Inbox',
    moduleSlug: 'inbox',
    tool_ids: ['manage_inbox'],
    quick_starts: [
      { label: 'Open conversations', description: 'List recent customer threads', prompt: 'Show my open customer conversations.', icon: 'ListChecks' },
      { label: 'Reply to a thread', description: 'Draft and send a customer reply', prompt: 'Help me reply to a customer conversation.', icon: 'Send' },
    ],
  },
  {
    id: 'messaging',
    name: 'WhatsApp',
    description: 'Send WhatsApp messages to customers via your connected channels (send asks to Approve first).',
    icon: 'Send',
    moduleSlug: 'messaging',
    tool_ids: ['manage_messaging'],
    quick_starts: [
      { label: 'My channels', description: 'List connected WhatsApp numbers', prompt: 'List my connected WhatsApp channels.', icon: 'ListChecks' },
      { label: 'Send a message', description: 'Send a WhatsApp to a customer', prompt: 'Send a WhatsApp message — ask me for the number and the text.', icon: 'Send' },
    ],
  },
  {
    id: 'crm',
    name: 'CRM',
    description: 'Add companies to the CRM from a VAT / ΑΦΜ number (ΑΑΔΕ / VIES lookup → create).',
    icon: 'Building2',
    moduleSlug: 'crm',
    tool_ids: ['create_company_from_vat'],
    quick_starts: [
      { label: 'Company from VAT', description: 'Look up a VAT/ΑΦΜ and add the company', prompt: 'Add a company to the CRM from a VAT or ΑΦΜ number — ask me for it.', icon: 'Plus' },
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Ask about invoices and customer balances — "what does ACME owe?", "show unpaid invoices". Read-only.',
    icon: 'Wallet',
    moduleSlug: 'sales-finance',
    tool_ids: ['manage_finance'],
    quick_starts: [
      { label: 'Unpaid invoices', description: 'List invoices still owed', prompt: 'Show me all unpaid invoices.', icon: 'FileText' },
      { label: 'Customer balance', description: 'What does a customer owe?', prompt: 'What is the open balance for a customer? Help me pick which one.', icon: 'Wallet' },
    ],
  },
  {
    id: 'email-marketing',
    name: 'Email Marketing',
    description: 'Compose draft email campaigns (name + template + audience) the agent drafts and you send from the Email page.',
    icon: 'Mail',
    moduleSlug: 'email-marketing',
    tool_ids: ['manage_email_campaign'],
    quick_starts: [
      { label: 'Draft a campaign', description: 'Compose a draft campaign to a CRM audience', prompt: 'Draft an email campaign — show me my templates and audience categories first.', icon: 'Plus' },
      { label: 'My campaigns', description: 'List recent email campaigns', prompt: 'List my recent email campaigns and their status.', icon: 'ListChecks' },
    ],
  },
  {
    id: 'job-research',
    name: 'Job Research',
    description: 'Background job-discovery agent across Google Jobs, Perplexity, RSS + career pages with a consolidated daily digest.',
    icon: 'Briefcase',
    moduleSlug: 'job-research',
    tool_ids: ['track_job_search', 'list_my_job_searches', 'find_jobs', 'get_job_digest_preview', 'manage_job_sites'],
    quick_starts: [
      {
        label: 'Track a job search', description: 'Start a background search with a daily digest', icon: 'Plus',
        prompt: 'Track a new job search for me.',
        promptTemplate: 'Track a job search for "{{keywords}}"{{remote}} and send me a daily digest. Confirm the scope before saving.',
        form: [
          { key: 'keywords', label: 'Role / keywords', kind: 'text', required: true, placeholder: 'senior python developer' },
          { key: 'remote', label: 'Remote only?', kind: 'select', default: ' (remote only)', options: [
            { value: ' (remote only)', label: 'Remote only' },
            { value: '', label: 'Any location' },
          ] },
        ],
      },
      {
        label: 'My job searches', description: 'List your active searches', icon: 'ListChecks',
        prompt: 'List my job searches.',
        run: { tool: 'list_my_job_searches' },
      },
      {
        label: 'Preview digest', description: "Today's consolidated digest", icon: 'Newspaper',
        prompt: "Preview today's job digest.",
        run: { tool: 'get_job_digest_preview' },
      },
      {
        label: 'Which job boards?', description: 'List the searched job sites', icon: 'Globe',
        prompt: 'Which job boards do you search?',
        run: { tool: 'manage_job_sites', fixedArgs: { action: 'list' } },
      },
    ],
  },
  {
    id: 'hr',
    name: 'HR',
    description: 'Ask about your team and log absences from chat: who\'s on leave, HR overview, record a sick/vacation day, add an employee.',
    icon: 'Users',
    moduleSlug: 'hr',
    adminOnly: true, // HR data is owner/admin-only (hr.view); hr-api enforces regardless.
    tool_ids: ['manage_hr'],
    quick_starts: [
      {
        label: "Who's on leave", description: 'Approved absences this week', icon: 'CalendarOff',
        prompt: "Who's on leave this week?",
        run: { tool: 'manage_hr', fixedArgs: { action: 'who_is_on_leave' } },
      },
      {
        label: 'HR overview', description: 'Headcount, on-leave-today, pending requests', icon: 'LayoutDashboard',
        prompt: 'Give me an HR overview.',
        run: { tool: 'manage_hr', fixedArgs: { action: 'overview' } },
      },
      {
        label: 'List employees', description: 'The team roster with absence totals', icon: 'ListChecks',
        prompt: 'List my employees.',
        run: { tool: 'manage_hr', fixedArgs: { action: 'list_employees' } },
      },
      {
        label: 'Record absence', description: 'Log a sick/vacation day (pending approval)', icon: 'CalendarPlus',
        prompt: 'Record an absence for an employee.',
        promptTemplate: 'Record a {{absence_type}} day for {{employee}} from {{start_date}} to {{end_date}}.',
        run: { tool: 'manage_hr' },
        form: [
          { key: 'employee', label: 'Employee name', kind: 'text', required: true, placeholder: 'Maria' },
          { key: 'absence_type', label: 'Type', kind: 'select', default: 'sick', options: [
            { value: 'sick', label: 'Sick' },
            { value: 'vacation', label: 'Vacation' },
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'other', label: 'Other' },
          ] },
          { key: 'start_date', label: 'Start (YYYY-MM-DD)', kind: 'text', required: true, placeholder: '2026-07-14' },
          { key: 'end_date', label: 'End (YYYY-MM-DD)', kind: 'text', required: true, placeholder: '2026-07-14' },
        ],
      },
    ],
  },
  {
    id: 'stock',
    name: 'Stock',
    description: 'Check inventory and adjust stock from chat: what\'s low, how many of an item you have, receive/issue/set quantities, recent movements.',
    icon: 'Package',
    moduleSlug: 'stock',
    adminOnly: true, // writes require finance-manager (owner/admin); stock-api enforces regardless.
    tool_ids: ['manage_stock'],
    quick_starts: [
      {
        label: 'Low stock', description: 'Items at/below reorder point', icon: 'AlertTriangle',
        prompt: "What's low on stock?",
        run: { tool: 'manage_stock', fixedArgs: { action: 'list_low_stock' } },
      },
      {
        label: 'Stock overview', description: 'Items, warehouses, low/out-of-stock', icon: 'LayoutDashboard',
        prompt: 'Give me a stock overview.',
        run: { tool: 'manage_stock', fixedArgs: { action: 'overview' } },
      },
      {
        label: 'Check an item', description: 'On-hand & available for a product', icon: 'Search',
        prompt: 'Check stock for an item.',
        promptTemplate: 'How many "{{item}}" do we have in stock?',
        run: { tool: 'manage_stock', fixedArgs: { action: 'check_stock' } },
        form: [
          { key: 'item', label: 'Item name or SKU', kind: 'text', required: true, placeholder: 'Oak plank' },
        ],
      },
      {
        label: 'Receive stock', description: 'Add received units to an item', icon: 'PackagePlus',
        prompt: 'Receive stock for an item.',
        promptTemplate: 'Receive {{quantity}} units of "{{item}}" into stock.',
        run: { tool: 'manage_stock', fixedArgs: { action: 'adjust_stock', direction: 'in' } },
        form: [
          { key: 'item', label: 'Item name or SKU', kind: 'text', required: true, placeholder: 'White tile 60x60' },
          { key: 'quantity', label: 'Quantity', kind: 'text', required: true, placeholder: '50' },
        ],
      },
    ],
  },
  {
    id: 'knowledge-graph',
    name: 'Product Intelligence',
    // All users, 0 credits — DB-only RPC reads over relationships that already exist.
    // NOTE: supplier_overview is finance data and is admin/owner-gated at the agent-chat
    // push site; the rest bind for everyone, so the cluster itself is not adminOnly.
    description: 'Answer "where did this come from?" from data you already have: provenance, price history, which projects use a product, and brand / customer / supplier overviews.',
    icon: 'Network',
    tool_ids: [
      'product_provenance', 'product_price_history', 'projects_using_product',
      'products_in_project', 'customer_overview', 'supplier_overview',
      'products_by_brand', 'brand_overview', 'related_products', 'find_products_by_spec',
      'search_crm_by_kad',
    ],
    quick_starts: [
      {
        label: 'Product provenance', description: 'Where a product came from', icon: 'Network',
        prompt: 'Show the provenance of a product.',
        promptTemplate: 'Where did "{{product}}" come from? Show its provenance.',
        run: { tool: 'product_provenance' },
        form: [
          { key: 'product', label: 'Product name or SKU', kind: 'text', required: true, placeholder: 'White tile 60x60' },
        ],
      },
      {
        label: 'Brand overview', description: 'Everything about one brand', icon: 'Building2',
        prompt: 'Give me an overview of a brand.',
        promptTemplate: 'Give me a brand overview for "{{brand}}".',
        run: { tool: 'brand_overview' },
        form: [
          { key: 'brand', label: 'Brand', kind: 'text', required: true, placeholder: 'Marazzi' },
        ],
      },
      {
        label: 'Find by spec', description: 'Look products up by specification', icon: 'FileSearch',
        prompt: 'Find products by spec.',
        promptTemplate: 'Find products matching this spec: {{spec}}',
        run: { tool: 'find_products_by_spec' },
        form: [
          { key: 'spec', label: 'Specification', kind: 'text', required: true, placeholder: 'R11 slip resistance, frost resistant' },
        ],
      },
    ],
  },
  {
    id: 'flows-toolkit',
    name: 'Flows',
    // Module-gated flows-toolkit + per-workspace entitlement enforced inside the tool.
    description: 'Manage workspace automations from chat: list your flows, create a simple trigger → action flow, pause/resume one, or remove it.',
    icon: 'Workflow',
    moduleSlug: 'flows-toolkit',
    tool_ids: ['manage_flows'],
    quick_starts: [
      {
        label: 'My flows', description: 'List automations in this workspace', icon: 'ListChecks',
        prompt: 'List my flows.',
        run: { tool: 'manage_flows', fixedArgs: { action: 'list' } },
      },
      {
        label: 'Create a flow', description: 'Trigger → action automation', icon: 'Plus',
        prompt: 'Create a new flow.',
        promptTemplate: 'Create a flow named "{{name}}" that runs when {{trigger}} and then {{action}}.',
        run: { tool: 'manage_flows', fixedArgs: { action: 'create' } },
        form: [
          { key: 'name', label: 'Flow name', kind: 'text', required: true, placeholder: 'Notify me on new quote' },
          { key: 'trigger', label: 'When should it run?', kind: 'text', required: true, placeholder: 'a quote is approved' },
          { key: 'action', label: 'What should it do?', kind: 'text', required: true, placeholder: 'send me a notification' },
        ],
      },
      {
        label: 'Pause a flow', description: 'Turn an automation off', icon: 'CalendarOff',
        prompt: 'Pause one of my flows.',
        promptTemplate: 'Pause the flow "{{name}}".',
        run: { tool: 'manage_flows', fixedArgs: { action: 'toggle' } },
        form: [
          { key: 'name', label: 'Flow name', kind: 'text', required: true, placeholder: 'Notify me on new quote' },
        ],
      },
    ],
  },
  {
    id: 'social',
    name: 'Social',
    description: 'Publish and schedule posts to your connected social accounts, find the best time to post, and pull post / account analytics.',
    icon: 'Share2',
    moduleSlug: 'social-media',
    tool_ids: ['manage_social'],
    quick_starts: [
      {
        label: 'My accounts', description: 'Connected social accounts', icon: 'Users',
        prompt: 'List my connected social accounts.',
        run: { tool: 'manage_social', fixedArgs: { action: 'list_accounts' } },
      },
      {
        label: 'Publish a post', description: 'Post now to a connected account', icon: 'Megaphone',
        prompt: 'Publish a social post.',
        promptTemplate: 'Publish this post: {{content}}',
        run: { tool: 'manage_social', fixedArgs: { action: 'publish' } },
        form: [
          { key: 'content', label: 'Post content', kind: 'text', required: true, placeholder: 'Our new porcelain range just landed…' },
        ],
      },
      {
        label: 'Best time to post', description: 'When your audience is active', icon: 'CalendarPlus',
        prompt: 'When is the best time to post?',
        run: { tool: 'manage_social', fixedArgs: { action: 'best_time' } },
      },
    ],
  },
  {
    id: 'tech-radar',
    name: 'Tech Radar',
    // adminOnly mirrors the server: needsTechRadar = isAdmin && (…) in agent-chat/index.ts.
    description: 'Review a proposed solution against the platform stack and keep the findings: browse the radar, track a new entry, update a finding.',
    icon: 'Radar',
    adminOnly: true,
    tool_ids: ['review_solution', 'track_tech_radar', 'list_tech_radar', 'update_finding'],
    quick_starts: [
      {
        label: 'Browse the radar', description: 'Current tracked findings', icon: 'Radar',
        prompt: 'Show me the tech radar.',
        run: { tool: 'list_tech_radar' },
      },
      {
        label: 'Review a solution', description: 'Assess it against our stack', icon: 'BadgeCheck',
        prompt: 'Review a solution against our stack.',
        promptTemplate: 'Review "{{solution}}" against our current stack and tell me if we should adopt it.',
        run: { tool: 'review_solution' },
        form: [
          { key: 'solution', label: 'Solution / library', kind: 'text', required: true, placeholder: 'Drizzle ORM' },
        ],
      },
      {
        label: 'Track an entry', description: 'Add something to the radar', icon: 'Plus',
        prompt: 'Track something on the tech radar.',
        promptTemplate: 'Track "{{solution}}" on the tech radar.',
        run: { tool: 'track_tech_radar' },
        form: [
          { key: 'solution', label: 'Solution / library', kind: 'text', required: true, placeholder: 'Drizzle ORM' },
        ],
      },
    ],
  },
  {
    id: 'projects',
    name: 'Projects',
    description: 'Organize work into projects + tasks. Create, browse, add tasks, and spec purchase items (doors/windows) straight from chat.',
    icon: 'FolderKanban',
    tool_ids: [
      'create_project', 'list_my_projects', 'find_project', 'add_task',
      'add_purchase_item', 'generate_purchase_sheet',
    ],
    quick_starts: [
      {
        label: 'New project', description: 'Create a project', icon: 'Plus',
        prompt: 'Create a new project.',
        promptTemplate: 'Create a project called "{{name}}".',
        run: { tool: 'create_project' },
        form: [
          { key: 'name', label: 'Project name', kind: 'text', required: true, placeholder: 'Athens loft renovation' },
          { key: 'description', label: 'Description', kind: 'textarea', placeholder: 'Optional summary' },
        ],
      },
      {
        label: 'My projects', description: 'List your projects', icon: 'ListChecks',
        prompt: 'List my projects.',
        run: { tool: 'list_my_projects' },
      },
      {
        label: 'Find a project', description: 'Look up a project by name', icon: 'Search',
        prompt: 'Find a project.',
        promptTemplate: 'Find the "{{query}}" project.',
        run: { tool: 'find_project' },
        form: [
          { key: 'query', label: 'Project name', kind: 'text', required: true, placeholder: 'Athens loft renovation' },
        ],
      },
    ],
  },
  {
    id: 'quotes',
    name: 'Quotes',
    description: 'Build client quotes from chat: add catalog or custom products (e.g. 75 sqm at €34/sqm), auto-price + VAT, generate the branded PDF, and open it on the canvas. Saved to the Quotes module.',
    icon: 'FileText',
    tool_ids: ['create_quote', 'generate_quote_pdf', 'list_my_quotes'],
    quick_starts: [
      {
        label: 'New quote', description: 'Create a quote from products', icon: 'Plus',
        prompt: 'Create a quote.',
        promptTemplate: 'Create a quote named "{{name}}" with these items: {{items}}',
        run: { tool: 'create_quote' },
        form: [
          { key: 'name', label: 'Quote name', kind: 'text', placeholder: 'Living room — tiles' },
          { key: 'items', label: 'Items (name, qty, unit, price)', kind: 'textarea', required: true, placeholder: 'Tagina, 75 sqm, €34/sqm\nKeros, 18 sqm, €15/sqm' },
        ],
      },
      {
        label: 'My quotes', description: 'List recent quotes', icon: 'ListChecks',
        prompt: 'Show my recent quotes.',
        run: { tool: 'list_my_quotes' },
      },
    ],
  },
  {
    id: 'presentation-sheets',
    name: 'Presentation Sheets',
    description: 'A3 client-ready moodboard sheets: material board / color palette / lighting plan / annotated render / FF&E / full deck.',
    icon: 'LayoutTemplate',
    tool_ids: ['generate_presentation_sheet'],
    quick_starts: [
      // Each opens the guided SheetWizardModal (pick moodboard → inputs → generate)
      // with the type pre-selected. The "New sheet" entry opens it at the type picker.
      { label: 'New sheet', description: 'Pick any sheet type → guided build', prompt: 'Create a presentation sheet for one of my moodboards.', icon: 'Plus', opensSheetWizard: '' },
      { label: 'Material board', description: 'Pick products → A3 PDF', prompt: 'Build a material board sheet.', icon: 'Grid3x3', opensSheetWizard: 'material_board' },
      { label: 'Color palette', description: 'Auto-extract colors from a moodboard', prompt: 'Generate a color palette sheet.', icon: 'Palette', opensSheetWizard: 'color_palette' },
      { label: 'Full deck', description: 'Multi-page presentation deck', prompt: 'Build a multi-page Full Deck.', icon: 'LayoutTemplate', opensSheetWizard: 'full_deck' },
    ],
  },
  {
    id: 'generation',
    name: 'Interior Design',
    description: 'Design a room, test a material on your photo, stage, re-light, render a floor plan, build a VR world — each is a guided process, not a blank prompt.',
    icon: 'Sparkles',
    tool_ids: [
      'generate_3d', 'apply_lighting_preset', 'generate_vr_world',
    ],
    quick_starts: [
      // Every image-required interior flow captures its inputs (photo first, then
      // the creative choices) step-by-step in ToolkitFormModal, then auto-sends
      // ONE complete generation message — the same collect-then-send rail the
      // other toolkits use, never a bare prompt that asks for the photo in chat.
      {
        label: 'Test on a room',
        description: 'Apply a material from the catalog onto a photo of your room',
        icon: 'ImageIcon',
        imageRequired: true,
        prompt: 'Apply the chosen material/finish onto the chosen surface in my room photo, keeping everything else in place.',
        promptTemplate: 'Apply {{material}} onto the {{surface}} in this room photo. Keep the layout, furniture, lighting and everything else exactly in place — change only the {{surface}} finish. {{notes}}',
        generation: { imageKeys: ['photo'], mode: 'image-edit' },
        form: [
          { key: 'photo', label: 'Your room photo', kind: 'image', required: true, help: 'Upload a photo of the room you want to restyle.' },
          { key: 'material', label: 'Material / finish to apply', kind: 'text', required: true, placeholder: 'e.g. warm oak herringbone, Carrara marble, matte charcoal microcement' },
          { key: 'surface', label: 'Apply to', kind: 'select', default: 'floor', options: [
            { value: 'floor', label: 'Floor' },
            { value: 'wall', label: 'Wall' },
            { value: 'feature wall', label: 'Feature wall' },
            { value: 'ceiling', label: 'Ceiling' },
            { value: 'countertop', label: 'Countertop' },
          ] },
          { key: 'notes', label: 'Anything to preserve or emphasize? (optional)', kind: 'textarea', placeholder: 'e.g. keep the rug and the pendant light' },
        ],
      },
      {
        // Targeted edit — captures the photo, then opens the gemini-edit builder
        // (categories: change floor / walls / lighting / objects / region edit).
        label: 'Edit a photo',
        description: 'Make a targeted change to a room photo — floor, walls, lighting, objects',
        icon: 'Pencil',
        imageRequired: true,
        prompt: 'Make a targeted edit to this room photo.',
        promptTemplate: 'Make a targeted edit to this room photo.',
        generation: { imageKeys: ['photo'], opensModal: 'gemini-edit' },
        form: [
          { key: 'photo', label: 'Room photo', kind: 'image', required: true, help: 'Upload the photo you want to edit.' },
        ],
      },
      {
        // From-scratch design needs no photo and already opens a guided multi-step
        // modal — left on its own rail.
        label: 'Design a room',
        description: 'Generate a room from scratch — pick room, style, and details',
        icon: 'Sparkles',
        opensModal: 'new-design',
        prompt: 'Design a modern living room from scratch with warm minimal styling.',
      },
      {
        label: 'Stage a room',
        description: 'Furnish an empty room photo with furniture and decor',
        icon: 'LayoutTemplate',
        imageRequired: true,
        prompt: 'Stage this empty room with furniture and decor.',
        promptTemplate: 'Stage this empty room photo with furniture and decor.',
        // Photo captured here, then the staging wizard collects style + furniture.
        generation: { imageKeys: ['photo'], opensModal: 'virtual-staging' },
        form: [
          { key: 'photo', label: 'Empty room photo', kind: 'image', required: true, help: 'Upload a photo of the empty room to furnish.' },
        ],
      },
      {
        label: 'Redesign from a photo',
        description: 'Change the style, materials, or finishes on an existing room photo',
        icon: 'Sparkles',
        imageRequired: true,
        prompt: 'Redesign this room while keeping the layout.',
        promptTemplate: 'Redesign this room in a {{style}} style — update the materials and finishes while keeping the exact layout and architecture. {{notes}}',
        generation: { imageKeys: ['photo'], mode: 'redesign' },
        form: [
          { key: 'photo', label: 'Room photo', kind: 'image', required: true },
          { key: 'style', label: 'Target style', kind: 'text', required: true, placeholder: 'e.g. warm minimal, Mediterranean, Scandinavian' },
          { key: 'notes', label: 'Notes (optional)', kind: 'textarea', placeholder: 'e.g. keep the flooring, warmer tones, more plants' },
        ],
      },
      {
        label: 'Re-light a room',
        description: 'Re-render an attached room photo under a different lighting mood',
        icon: 'Sparkles',
        imageRequired: true,
        prompt: 'Re-light this room.',
        promptTemplate: 'Re-render this room photo under "{{preset}}" lighting, keeping the layout, materials and finishes unchanged.',
        // No forced mode — the interior agent routes to the lighting tool.
        generation: { imageKeys: ['photo'] },
        form: [
          { key: 'photo', label: 'Room photo', kind: 'image', required: true },
          { key: 'preset', label: 'Lighting mood', kind: 'select', default: 'Golden Hour', options: [
            { value: 'Natural Daylight', label: 'Natural Daylight' },
            { value: 'Golden Hour', label: 'Golden Hour' },
            { value: 'Overcast', label: 'Overcast' },
            { value: 'Showroom Spots', label: 'Showroom Spots' },
            { value: 'Warm Evening', label: 'Warm Evening' },
            { value: 'Night', label: 'Night' },
          ] },
        ],
      },
      {
        label: 'Floor plan → 3D',
        description: 'Turn an attached 2D floor plan into a photorealistic 3D interior',
        icon: 'LayoutTemplate',
        imageRequired: true,
        prompt: 'Render this floor plan as a photorealistic 3D interior.',
        promptTemplate: 'Render this 2D floor plan as a photorealistic eye-level perspective interior showing how the rooms look from inside, with realistic materials and natural lighting. {{notes}}',
        generation: { imageKeys: ['plan'], mode: 'floor-plan-render' },
        form: [
          { key: 'plan', label: '2D floor plan', kind: 'image', required: true, help: 'Upload a top-down 2D floor-plan image.' },
          { key: 'notes', label: 'Style / notes (optional)', kind: 'textarea', placeholder: 'e.g. warm minimal, oak floors, large windows' },
        ],
      },
      {
        label: 'VR world',
        description: 'Build an explorable Gaussian Splat world from a room image',
        icon: 'Globe',
        imageRequired: true,
        prompt: 'Build a VR world from this room image.',
        promptTemplate: 'Turn this room image into an explorable VR world using the {{quality}} model.',
        // No forced mode — the interior agent routes to the VR tool.
        generation: { imageKeys: ['photo'] },
        form: [
          { key: 'photo', label: 'Room image', kind: 'image', required: true },
          { key: 'quality', label: 'Quality', kind: 'select', default: 'draft', options: [
            { value: 'draft', label: 'Draft — fast preview (18 credits)' },
            { value: 'high-quality', label: 'High quality (190 credits)' },
          ] },
        ],
      },
    ],
  },
  {
    id: 'seo-research',
    name: 'SEO Research',
    description: 'Keyword research, SERP audit, URL audit, intent classification — read-only.',
    icon: 'Search',
    tool_ids: [
      'seo_research_keyword', 'seo_keyword_difficulty', 'seo_keyword_suggestions',
      'seo_search_intent', 'seo_keyword_overview', 'seo_ai_keyword_volume',
      'seo_serp_audit', 'seo_audit_url', 'seo_historical_serps',
    ],
    quick_starts: [
      {
        label: 'Research a keyword', description: 'Full SERP + AI Overview snapshot', icon: 'Search',
        prompt: 'Research the keyword "porcelain tile installation" in the UK. Walk me through the SERP findings.',
        promptTemplate: 'Research the keyword "{{keyword}}" in {{country}}. Walk me through the SERP findings.',
        run: { tool: 'seo_research_keyword', argMap: { country: 'country_code' } },
        form: [
          { key: 'keyword', label: 'Keyword', kind: 'text', required: true, placeholder: 'porcelain tile installation' },
          { key: 'country', label: 'Market', kind: 'country_code', default: 'GB' },
        ],
      },
      {
        label: 'Audit a URL', description: 'Lighthouse + on-page issues', icon: 'BadgeCheck',
        prompt: 'Audit a public URL.',
        promptTemplate: 'Audit this URL: {{url}}',
        run: { tool: 'seo_audit_url' },
        form: [
          { key: 'url', label: 'URL to audit', kind: 'text', required: true, placeholder: 'https://flobali.gr/products/porcelain-12mm' },
        ],
      },
      {
        label: 'Suggest keywords', description: 'Phrase-match expansion with volume', icon: 'ListChecks',
        prompt: 'Expand a seed phrase into 30 keyword suggestions with volume + competition.',
        promptTemplate: 'Expand the seed phrase "{{seed}}" into {{count}} keyword suggestions with volume + competition.',
        run: { tool: 'seo_keyword_suggestions', argMap: { seed: 'keyword', count: 'limit' }, coerce: { limit: 'number' } },
        form: [
          { key: 'seed', label: 'Seed phrase', kind: 'text', required: true, placeholder: 'travertine sealer' },
          { key: 'count', label: 'How many suggestions?', kind: 'number', default: '30' },
        ],
      },
    ],
  },
  {
    id: 'seo-domain',
    name: 'SEO Domain Intel',
    description: 'Domain snapshot, ranked keywords, competitor + keyword gap, traffic estimation.',
    icon: 'Globe',
    tool_ids: [
      'seo_domain_snapshot', 'seo_ranked_keywords', 'seo_domain_competitors',
      'seo_keyword_gap', 'seo_traffic_estimation', 'seo_subdomains',
      'seo_relevant_pages', 'seo_categories_for_domain',
    ],
    quick_starts: [
      {
        label: 'Snapshot a domain', description: 'Rank, keyword count, traffic, backlinks', icon: 'Globe',
        prompt: 'Give me an SEO snapshot for a domain.',
        promptTemplate: 'Give me an SEO snapshot for {{domain}}.',
        run: { tool: 'seo_domain_snapshot' },
        form: [
          { key: 'domain', label: 'Domain', kind: 'text', required: true, placeholder: 'flobali.gr' },
        ],
      },
      {
        label: 'Find content gaps', description: 'Keywords competitor ranks for that we don\'t', icon: 'Search',
        prompt: 'Find SEO keyword gaps between two domains.',
        promptTemplate: 'Find SEO keyword gaps where {{competitor}} ranks but {{your_domain}} does not.',
        run: { tool: 'seo_keyword_gap', argMap: { competitor: 'competitor_domain' } },
        form: [
          { key: 'your_domain', label: 'Your domain', kind: 'text', required: true, placeholder: 'flobali.gr' },
          { key: 'competitor', label: 'Competitor domain', kind: 'text', required: true, placeholder: 'carrelagedirect.fr' },
        ],
      },
      {
        label: 'List ranked keywords', description: 'What does a domain rank for', icon: 'ListChecks',
        prompt: 'List every keyword a domain currently ranks for, with positions + traffic share.',
        promptTemplate: 'List every keyword {{domain}} currently ranks for in {{country}}, with positions + traffic share.',
        run: { tool: 'seo_ranked_keywords', argMap: { country: 'country_code' } },
        form: [
          { key: 'domain', label: 'Domain', kind: 'text', required: true, placeholder: 'flobali.gr' },
          { key: 'country', label: 'Market', kind: 'country_code', default: 'GR' },
        ],
      },
    ],
  },
  {
    id: 'seo-backlinks',
    name: 'SEO Backlinks',
    description: 'Backlinks summary, anchor texts, referring domains.',
    icon: 'Link2',
    tool_ids: [
      'seo_backlinks_summary', 'seo_backlinks_anchors', 'seo_referring_domains',
    ],
    quick_starts: [
      {
        label: 'Backlinks summary', description: 'Total backlinks + referring domains + spam score', icon: 'Link2',
        prompt: 'Pull a backlinks summary for a domain.',
        promptTemplate: 'Pull a backlinks summary for {{domain}}.',
        run: { tool: 'seo_backlinks_summary', argMap: { domain: 'target' } },
        form: [
          { key: 'domain', label: 'Domain', kind: 'text', required: true, placeholder: 'flobali.gr' },
        ],
      },
      {
        label: 'Anchor texts', description: 'Top anchor patterns', icon: 'Link2',
        prompt: 'List the top anchor texts pointing to a domain.',
        promptTemplate: 'List the top anchor texts pointing to {{domain}}.',
        run: { tool: 'seo_backlinks_anchors', argMap: { domain: 'target' } },
        form: [
          { key: 'domain', label: 'Domain', kind: 'text', required: true, placeholder: 'flobali.gr' },
        ],
      },
    ],
  },
  {
    id: 'seo-content',
    name: 'SEO Content & Tech',
    description: 'Sentiment, tech stack, WHOIS, OnPage crawl, LLM mentions.',
    icon: 'FileSearch',
    tool_ids: [
      'seo_content_sentiment', 'seo_domain_technologies', 'seo_domain_whois',
      'seo_site_crawl_start', 'seo_site_crawl_status', 'seo_llm_mentions_search',
    ],
    quick_starts: [
      {
        label: 'Crawl a site', description: 'OnPage crawl up to 1000 pages', icon: 'FileSearch',
        prompt: 'Kick off a full OnPage crawl for a domain.',
        promptTemplate: 'Kick off a full OnPage crawl for {{domain}} (up to {{max_pages}} pages).',
        run: { tool: 'seo_site_crawl_start', argMap: { domain: 'target' }, coerce: { max_pages: 'number' } },
        form: [
          { key: 'domain', label: 'Domain', kind: 'text', required: true, placeholder: 'flobali.gr' },
          { key: 'max_pages', label: 'Max pages', kind: 'number', default: '100' },
        ],
      },
      {
        label: 'Tech stack', description: 'Detect CMS, analytics, frameworks', icon: 'FileSearch',
        prompt: 'Identify the tech stack of a domain.',
        promptTemplate: 'Identify the tech stack of {{domain}}.',
        run: { tool: 'seo_domain_technologies' },
        form: [
          { key: 'domain', label: 'Domain', kind: 'text', required: true, placeholder: 'flobali.gr' },
        ],
      },
      {
        label: 'LLM mentions', description: 'What LLMs cite for a keyword', icon: 'Bot',
        prompt: 'Find what pages LLMs cite when answering questions about a keyword.',
        promptTemplate: 'Find what pages LLMs cite when answering questions about "{{keyword}}".',
        run: { tool: 'seo_llm_mentions_search' },
        form: [
          { key: 'keyword', label: 'Keyword / topic', kind: 'text', required: true, placeholder: 'recycled concrete aggregates' },
        ],
      },
    ],
  },
  {
    id: 'seo-multi-engine',
    name: 'SEO Multi-Engine + Niche',
    description: 'YouTube, Local Pack, Google Trends, Amazon, App keywords, Trustpilot, Pinterest, Reddit.',
    icon: 'Layers',
    tool_ids: [
      'seo_youtube_search', 'seo_local_pack', 'seo_google_trends',
      'seo_amazon_asin', 'seo_app_keywords', 'seo_trustpilot_search',
      'seo_pinterest_search', 'seo_reddit_search',
    ],
    quick_starts: [
      {
        label: 'YouTube search', description: 'Top YouTube videos for a keyword', icon: 'Layers',
        prompt: 'Search YouTube for "porcelain tile installation" — show top videos with view counts.',
        promptTemplate: 'Search YouTube for "{{keyword}}" — show the top videos with view counts.',
        run: { tool: 'seo_youtube_search' },
        form: [
          { key: 'keyword', label: 'Keyword', kind: 'text', required: true, placeholder: 'porcelain tile installation' },
        ],
      },
      {
        label: 'Google Trends', description: 'Interest-over-time + regional', icon: 'Layers',
        prompt: 'Run Google Trends for up to 5 keywords.',
        promptTemplate: 'Run Google Trends for these keywords: {{keywords}}.',
        run: { tool: 'seo_google_trends', coerce: { keywords: 'lines' } },
        form: [
          { key: 'keywords', label: 'Keywords (up to 5, one per line)', kind: 'tags', required: true, placeholder: 'travertine\nporcelain tile\nterrazzo' },
        ],
      },
      {
        label: 'Reddit threads', description: 'Real user discussion + pain points', icon: 'Layers',
        prompt: 'Find Reddit threads discussing a topic.',
        promptTemplate: 'Find Reddit threads discussing "{{topic}}".',
        run: { tool: 'seo_reddit_search', argMap: { topic: 'keyword' } },
        form: [
          { key: 'topic', label: 'Topic', kind: 'text', required: true, placeholder: 'best porcelain tile installer' },
        ],
      },
    ],
  },
  {
    id: 'seo-composite',
    name: 'SEO Composite Audits',
    description: 'Full site review + brand-search audit (multi-section bundles).',
    icon: 'BadgeCheck',
    tool_ids: ['seo_site_review', 'seo_brand_search_audit'],
    quick_starts: [
      {
        label: 'Full site review', description: 'Rank + keywords + competitors + backlinks in one call', icon: 'BadgeCheck',
        prompt: 'Run a full site review of a domain.',
        promptTemplate: 'Run a full site review of {{domain}}.',
        run: { tool: 'seo_site_review' },
        form: [
          { key: 'domain', label: 'Domain', kind: 'text', required: true, placeholder: 'flobali.gr' },
        ],
      },
      {
        label: 'Brand SERP audit', description: 'Knowledge Panel + AI Overview brand mention', icon: 'BadgeCheck',
        prompt: 'Run a brand-search audit for a brand.',
        promptTemplate: 'Run a brand-search audit for "{{brand}}".',
        run: { tool: 'seo_brand_search_audit', argMap: { brand: 'brand_name' } },
        form: [
          { key: 'brand', label: 'Brand', kind: 'text', required: true, placeholder: 'Flobali' },
        ],
      },
    ],
  },
  {
    id: 'seo-article',
    name: 'SEO Article Pipeline',
    description: 'Research → plan → write → analyze with auto-fix. Admin-only.',
    icon: 'Newspaper',
    adminOnly: true,
    tool_ids: [
      'create_seo_article', 'seo_keyword_research', 'seo_article_planner',
      'seo_article_writer', 'seo_content_analyzer',
    ],
    quick_starts: [
      {
        label: 'Generate full article',
        description: 'End-to-end: research → plan → write → analyze with auto-fix',
        prompt: 'Generate a complete SEO article.',
        icon: 'Newspaper',
        workflow_id: 'seo-article',
        promptTemplate: 'Generate a complete SEO article targeting the keyword "{{keyword}}" for {{country}}.',
        form: [
          { key: 'keyword', label: 'Target keyword', kind: 'text', required: true, placeholder: 'recycled concrete aggregates' },
          { key: 'country', label: 'Target market', kind: 'country', default: 'the United Kingdom' },
        ],
      },
      {
        label: 'Just research', description: 'Stop at research stage', icon: 'Search',
        prompt: 'Run only Stage 1 (keyword research).',
        promptTemplate: 'Run only Stage 1 (keyword research) for the seed keyword "{{keyword}}".',
        run: { tool: 'seo_keyword_research', argMap: { keyword: 'topic' } },
        form: [
          { key: 'keyword', label: 'Seed keyword', kind: 'text', required: true, placeholder: 'recycled concrete aggregates' },
        ],
      },
    ],
  },
  {
    id: 'b2b',
    name: 'B2B Research',
    description: 'Manufacturer search, website scrape, company enrichment, contact discovery, email validate, save to CRM. Admin-only.',
    icon: 'Building2',
    adminOnly: true,
    tool_ids: [
      'b2b_manufacturer_search', 'company_website_scrape', 'company_enrichment',
      'contact_discovery', 'email_validate', 'save_to_crm',
    ],
    quick_starts: [
      {
        label: 'Find manufacturers',
        description: 'Discover → scrape → enrich → save qualified ones to CRM',
        prompt: 'Find manufacturers in a target market and save qualified ones to CRM.',
        icon: 'Building2',
        workflow_id: 'b2b-research',
        promptTemplate: 'Find {{count}} {{industry}} manufacturers in {{country}}, then scrape + enrich the promising ones.',
        form: [
          { key: 'industry', label: 'Industry / product', kind: 'text', required: true, placeholder: 'porcelain tile' },
          { key: 'country', label: 'Country / region', kind: 'text', required: true, placeholder: 'Spain' },
          { key: 'count', label: 'How many?', kind: 'number', default: '10' },
        ],
      },
      {
        label: 'Enrich a company', description: 'Apollo data for a known domain', icon: 'Building2',
        prompt: 'Pull Apollo enrichment for a single company.',
        promptTemplate: 'Pull Apollo enrichment for {{domain}}.',
        run: { tool: 'company_enrichment' },
        form: [
          { key: 'domain', label: 'Company domain', kind: 'text', required: true, placeholder: 'example.com' },
        ],
      },
      {
        label: 'Find contacts', description: 'Decision-maker emails for a company', icon: 'Mail',
        prompt: 'Find decision-maker emails at a company.',
        promptTemplate: 'Find decision-maker contacts ({{titles}}) at {{domain}}.',
        run: { tool: 'contact_discovery', argMap: { titles: 'roles' }, coerce: { roles: 'csv' } },
        form: [
          { key: 'domain', label: 'Company domain', kind: 'text', required: true, placeholder: 'example.com' },
          { key: 'titles', label: 'Target roles', kind: 'text', default: 'CEO, Procurement, Sales' },
        ],
      },
    ],
  },
  {
    id: 'sub-agents',
    name: 'Sub-agents',
    description: 'Deep research / analytics / business / product sub-agents. Admin-only.',
    icon: 'Bot',
    adminOnly: true,
    tool_ids: [
      'research_analysis', 'analytics_analysis', 'business_analysis', 'product_analysis',
    ],
    quick_starts: [
      {
        label: 'Deep research', description: 'Multi-step open-ended research', icon: 'Bot',
        prompt: 'Run a deep research analysis.',
        promptTemplate: 'Run a deep research analysis on: {{topic}}',
        run: { tool: 'research_analysis', argMap: { topic: 'query' } },
        form: [
          { key: 'topic', label: 'Research question', kind: 'textarea', required: true, placeholder: "the EU Green Deal's impact on construction materials" },
        ],
      },
      {
        label: 'Platform analytics', description: 'Usage / metric breakdowns', icon: 'Bot',
        prompt: 'Run an analytics question against the platform.',
        promptTemplate: 'Run a platform analytics question: {{question}}',
        run: { tool: 'analytics_analysis', argMap: { question: 'query' } },
        form: [
          { key: 'question', label: 'What to investigate', kind: 'textarea', required: true, placeholder: 'How many active subjects do we have in mention monitoring this week?' },
        ],
      },
      {
        label: 'Business breakdown', description: 'Revenue / customer / GMV', icon: 'Bot',
        prompt: 'Run a business-side analysis.',
        promptTemplate: 'Run a business-side analysis: {{question}}',
        run: { tool: 'business_analysis', argMap: { question: 'query' } },
        form: [
          { key: 'question', label: 'What to break down', kind: 'textarea', required: true, placeholder: 'Top 10 customers by quote value this quarter' },
        ],
      },
    ],
  },
  {
    id: 'admin-misc',
    name: 'Admin Utilities',
    description: 'Background task dispatch, price lookup, DataForSEO escape hatch.',
    icon: 'Wrench',
    adminOnly: true,
    tool_ids: ['dispatch_background_task', 'price_lookup', 'seo_dataforseo_call'],
    quick_starts: [
      {
        label: 'Pricing KB lookup', description: 'Admin-curated price data', icon: 'Wrench',
        prompt: 'Pull a pricing-KB entry.',
        promptTemplate: 'Pull the pricing-KB entry for "{{query}}".',
        run: { tool: 'price_lookup', argMap: { query: 'product_name' } },
        form: [
          { key: 'query', label: 'Product / SKU', kind: 'text', required: true, placeholder: 'Crema Marfil 600x600' },
        ],
      },
    ],
  },
];

/** Always-on toolkit IDs (cannot be disabled by the user). */
export const ALWAYS_ON_TOOLKIT_IDS = TOOLKITS.filter((t) => t.alwaysOn).map((t) => t.id);

/**
 * Toolkit → Hub mapping (#275 Capability Fabric) — lets the toolkit picker group clusters by the
 * SAME Hubs as the app launcher, so "toolkits under each Hub" lines up with the menu. Toolkits with
 * no entry (core, tech-radar, sub-agents, admin-misc) fall into an "Other" group. Kept as a map
 * (not a per-entry field) so it's one readable place and doesn't touch every TOOLKITS row.
 */
export const TOOLKIT_HUB: Record<string, HubId> = {
  // Marketing
  mentions: 'marketing', 'job-research': 'marketing', 'flows-toolkit': 'marketing', social: 'marketing',
  'email-marketing': 'marketing', messaging: 'service', inbox: 'service',
  'price-monitoring': 'sales',
  'seo-research': 'marketing', 'seo-domain': 'marketing', 'seo-backlinks': 'marketing',
  'seo-content': 'marketing', 'seo-multi-engine': 'marketing', 'seo-composite': 'marketing', 'seo-article': 'marketing',
  // Sales
  quotes: 'sales', 'knowledge-graph': 'sales', b2b: 'sales', crm: 'sales',
  // Finance
  stock: 'finance', finance: 'finance', contracts: 'finance',
  // Studio
  catalogs: 'studio', 'presentation-sheets': 'studio', projects: 'studio', generation: 'studio',
  // People
  hr: 'people',
};

export function getToolkitHub(id: string): HubId | undefined {
  return TOOLKIT_HUB[id];
}

/** Approximate token cost of a toolkit (rough — useful for the picker UI). */
export function toolkitTokenEstimate(toolkit: ToolkitDefinition): number {
  return toolkit.tool_ids.length * APPROX_TOKENS_PER_TOOL;
}

/** Get all toolkits the user can see, filtered by role + module enablement. */
export function getAccessibleToolkits(
  role: 'viewer' | 'member' | 'admin' | 'owner',
  enabledModules: string[] = [],
): ToolkitDefinition[] {
  const isAdmin = role === 'admin' || role === 'owner';
  return TOOLKITS.filter((t) => {
    if (t.adminOnly && !isAdmin) return false;
    if (t.moduleSlug && !enabledModules.includes(t.moduleSlug)) return false;
    return true;
  });
}

/** Resolve a list of toolkit IDs to a deduped list of tool IDs. */
export function resolveToolkitsToTools(toolkitIds: string[]): string[] {
  const out = new Set<string>();
  for (const tk of TOOLKITS) {
    if (toolkitIds.includes(tk.id) || tk.alwaysOn) {
      for (const id of tk.tool_ids) out.add(id);
    }
  }
  return [...out];
}

/** Reverse lookup: given a tool ID, what toolkit(s) does it belong to? */
export function findToolkitsForTool(toolId: string): ToolkitDefinition[] {
  return TOOLKITS.filter((t) => t.tool_ids.includes(toolId));
}

/**
 * Render a quick-start `promptTemplate` by substituting `{{key}}` placeholders
 * with collected form values. Unfilled optional placeholders collapse to empty,
 * then doubled spaces / orphaned punctuation left behind are tidied so the final
 * message reads naturally.
 */
/**
 * Build a structured tool-input object from collected form values + a `run`
 * descriptor. Empty/whitespace fields are dropped so the tool's own defaults
 * apply. Coercions are keyed by the RESOLVED tool-arg name (post-argMap).
 */
export function buildToolInput(
  run: ToolkitQuickStartRun,
  values: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(run.fixedArgs ?? {}) };
  for (const [fieldKey, raw] of Object.entries(values)) {
    const argName = run.argMap?.[fieldKey] ?? fieldKey;
    const v = (raw ?? '').trim();
    if (v === '') continue; // let the tool default apply
    const coercion = run.coerce?.[argName];
    if (coercion === 'number') {
      const n = Number(v);
      if (!Number.isNaN(n)) out[argName] = n;
    } else if (coercion === 'csv') {
      out[argName] = v.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (coercion === 'lines') {
      out[argName] = v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    } else {
      out[argName] = v;
    }
  }
  return out;
}

export function renderPromptTemplate(
  template: string,
  values: Record<string, string>,
): string {
  let out = template.replace(
    /\{\{\s*([\w.]+)\s*\}\}/g,
    (_m, key: string) => (values[key] ?? '').trim(),
  );
  out = out
    .replace(/[ \t]{2,}/g, ' ')      // collapse doubled spaces
    .replace(/\s+([.,;])/g, '$1')    // drop space before punctuation
    .replace(/\(\s*\)/g, '')         // drop empty parens left by optional fields
    .replace(/[ \t]+\n/g, '\n')      // trailing spaces per line
    .trim();
  return out;
}

/**
 * Which agents own (have access to) a toolkit's tools? Derived dynamically by
 * intersecting the toolkit's tool_ids with each agent's tools[]. Used by the
 * onLaunch path in AgentHub to auto-switch agent so a user clicking a Catalogs
 * quick-start while on Interior Designer doesn't get a "tools not available"
 * reply. Returns at least one agent ID; defaults to ['kai'] when no agent is
 * found (defensive — most toolkits live on KAI).
 */
/**
 * Toolkit → owning AGENT ids (backend AGENT_CONFIGS agent ids, incl. the Agent-Fabric specialists
 * Hermes/Edith/Trinity/Pepper/Vision). This is the source of truth the toolkit PICKER uses to scope
 * clusters to the selected agent — the frontend `AGENTS` catalog only lists kai/interior-designer/
 * demo, so a computed heuristic could never attribute e.g. the Social toolkit to Hermes. Mirrors
 * the specialist tool lists in supabase/functions/agent-chat/index.ts (AGENT_CONFIGS). `kai` owns
 * everything (generalist), so it's implicit — omit it here and add it in getToolkitOwnerAgents.
 */
export const TOOLKIT_AGENTS: Record<string, string[]> = {
  // Marketing → Edith
  'seo-research': ['marketing'], 'seo-domain': ['marketing'], 'seo-backlinks': ['marketing'],
  'seo-content': ['marketing'], 'seo-multi-engine': ['marketing'], 'seo-composite': ['marketing'],
  'seo-article': ['marketing'], mentions: ['marketing'], 'email-marketing': ['marketing'],
  // Social + WhatsApp + Inbox → Hermes (the comms agent)
  social: ['social-media'], messaging: ['social-media'], inbox: ['social-media'],
  // Finance / quotes → Trinity
  quotes: ['erp'], finance: ['erp'], 'knowledge-graph': ['erp', 'product-business'],
  // Product & business → Pepper
  catalogs: ['product-business'], b2b: ['product-business'], 'tech-radar': ['product-business'],
  'job-research': ['product-business'], 'price-monitoring': ['product-business'], crm: ['product-business'],
  // Studio / interior → Vision
  generation: ['interior-designer'], 'presentation-sheets': ['interior-designer'],
  projects: ['interior-designer', 'erp'],
  // Contracts → Trinity (finance/legal) — also on kai via the generalist
  contracts: ['erp'],
  // Admin/analysis helpers
  'sub-agents': ['marketing', 'product-business'], 'admin-misc': ['marketing', 'product-business'],
};

export function getToolkitOwnerAgents(toolkit: ToolkitDefinition): string[] {
  // kai (the generalist) owns every toolkit; specialists own the clusters in TOOLKIT_AGENTS.
  if (TOOLKIT_AGENTS[toolkit.id]) return ['kai', ...TOOLKIT_AGENTS[toolkit.id]];
  // Fallback for unmapped clusters: compute from the (partial) frontend catalog.
  const owners = new Set<string>();
  for (const a of AGENTS) {
    const agentToolIds = new Set(a.tools.map((t) => t.id));
    if (toolkit.tool_ids.some((tid) => agentToolIds.has(tid))) owners.add(a.id);
  }
  owners.add('kai');
  return [...owners];
}
