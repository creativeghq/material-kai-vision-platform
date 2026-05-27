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
    desc: 'Find similar materials from an attached image (CLIP/SigLIP). Requires an image attached to the message.',
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
      { label: 'Find materials', description: 'Search the catalog by description', prompt: 'Find me 5 cement-based grey tiles for a modern bathroom', icon: 'Search' },
      { label: 'Search the KB', description: 'Look up platform docs', prompt: 'How does the 7-vector fusion search work?', icon: 'Compass' },
    ],
  },
  {
    id: 'catalogs',
    name: 'Catalogs',
    description: 'Build email-gated catalog landing pages from manufacturer PDFs. 8-step workflow.',
    icon: 'BookOpen',
    adminOnly: true,
    moduleSlug: 'presentation-catalogs',
    tool_ids: [
      'create_catalog', 'attach_catalog_pdfs', 'extract_from_catalog_pdfs',
      'translate_pdf_to_catalog', 'add_material_to_catalog', 'find_image_for_material',
      'generate_catalog_pdf', 'publish_catalog',
    ],
    quick_starts: [
      {
        label: 'Build my first catalog',
        description: 'Walk me through the 8-step builder from scratch',
        prompt: 'I want to build my first catalog. Walk me through it step by step — start by asking me for a title and a client name, then guide me through attaching source PDFs, extracting sections, generating the PDF, and publishing.',
        icon: 'Plus',
        workflow_id: 'catalog-build',
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
        label: 'Send a published catalog',
        description: 'Email a published catalog to CRM categories',
        prompt: 'Show me my published catalogs so I can pick one to send to selected CRM categories.',
        icon: 'Send',
        workflow_id: 'catalog-send',
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
      { label: 'Track a brand', description: 'Start monitoring a brand across news + blogs + LLM responses', prompt: 'Help me start tracking mentions for a brand. Ask me which brand and how to configure it.', icon: 'Plus' },
      { label: 'Check LLM visibility', description: 'See where major LLMs cite us', prompt: 'Show me the LLM visibility snapshot for one of my tracked brands. Let me pick which one.', icon: 'Bot' },
      { label: 'Find negatives', description: 'Surface negative-sentiment mentions for triage', prompt: 'List the most recent negative-sentiment mentions for any of my tracked subjects so I can triage them.', icon: 'AlertCircle' },
    ],
  },
  {
    id: 'presentation-sheets',
    name: 'Presentation Sheets',
    description: 'A3 client-ready moodboard sheets: material board / color palette / lighting plan / annotated render / FF&E / full deck.',
    icon: 'LayoutTemplate',
    tool_ids: ['generate_presentation_sheet'],
    quick_starts: [
      { label: 'Material board', description: 'Pick products → A3 PDF', prompt: 'Build me a material board sheet for one of my moodboards. Walk me through picking the moodboard and products.', icon: 'Grid3x3' },
      { label: 'Color palette', description: 'Auto-extract colors from a moodboard', prompt: 'Generate a color palette sheet for a moodboard — auto-extract from its images.', icon: 'Palette' },
      { label: 'Full deck', description: 'Multi-page presentation deck', prompt: 'Help me build a multi-page Full Deck for a moodboard. List my recent moodboards so I can pick one.', icon: 'LayoutTemplate' },
    ],
  },
  {
    id: 'generation',
    name: 'Image / 3D / VR Generation',
    description: '3D renders, Gemini image edits, virtual staging, lighting presets, VR worlds.',
    icon: 'Sparkles',
    tool_ids: [
      'generate_3d', 'apply_lighting_preset', 'generate_vr_world',
    ],
    quick_starts: [
      { label: '3D render', description: 'Generate an interior render', prompt: 'Render a modern Athens loft kitchen with travertine floors and warm lighting.', icon: 'Sparkles' },
      { label: 'Re-light a room', description: 'Apply a lighting preset to an attached image', prompt: 'I will attach a room image — re-render it under "Golden Hour" lighting.', icon: 'Sparkles' },
      { label: 'VR world', description: 'Build an explorable Gaussian Splat from a room image', prompt: 'I will attach a room image — turn it into an explorable VR world (draft model).', icon: 'Sparkles' },
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
      { label: 'Research a keyword', description: 'Full SERP + AI Overview snapshot', prompt: 'Research the keyword "porcelain tile installation" in the UK. Walk me through the SERP findings.', icon: 'Search' },
      { label: 'Audit a URL', description: 'Lighthouse + on-page issues', prompt: 'Audit a public URL — ask me which one to check.', icon: 'BadgeCheck' },
      { label: 'Suggest keywords', description: 'Phrase-match expansion with volume', prompt: 'Expand a seed phrase into 30 keyword suggestions with volume + competition. Ask me for the seed.', icon: 'ListChecks' },
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
      { label: 'Snapshot a domain', description: 'Rank, keyword count, traffic, backlinks', prompt: 'Give me an SEO snapshot for a domain — ask me which.', icon: 'Globe' },
      { label: 'Find content gaps', description: 'Keywords competitor ranks for that we don\'t', prompt: 'Find SEO keyword gaps between two domains. Ask me for the two.', icon: 'Search' },
      { label: 'List ranked keywords', description: 'What does a domain rank for', prompt: 'List every keyword a domain currently ranks for, with positions + traffic share.', icon: 'ListChecks' },
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
      { label: 'Backlinks summary', description: 'Total backlinks + referring domains + spam score', prompt: 'Pull a backlinks summary for a domain — ask me which.', icon: 'Link2' },
      { label: 'Anchor texts', description: 'Top anchor patterns', prompt: 'List the top anchor texts pointing to a domain — ask me which.', icon: 'Link2' },
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
      { label: 'Crawl a site', description: 'OnPage crawl up to 1000 pages', prompt: 'Kick off a full OnPage crawl for a domain — ask me which and how many pages.', icon: 'FileSearch' },
      { label: 'Tech stack', description: 'Detect CMS, analytics, frameworks', prompt: 'Identify the tech stack of a domain — ask me which.', icon: 'FileSearch' },
      { label: 'LLM mentions', description: 'What LLMs cite for a keyword', prompt: 'Find what pages LLMs cite when answering questions about a keyword. Ask me for the keyword.', icon: 'Bot' },
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
      { label: 'YouTube search', description: 'Top YouTube videos for a keyword', prompt: 'Search YouTube for "porcelain tile installation" — show top videos with view counts.', icon: 'Layers' },
      { label: 'Google Trends', description: 'Interest-over-time + regional', prompt: 'Run Google Trends for up to 5 keywords — ask me which.', icon: 'Layers' },
      { label: 'Reddit threads', description: 'Real user discussion + pain points', prompt: 'Find Reddit threads discussing a topic — ask me what.', icon: 'Layers' },
    ],
  },
  {
    id: 'seo-composite',
    name: 'SEO Composite Audits',
    description: 'Full site review + brand-search audit (multi-section bundles).',
    icon: 'BadgeCheck',
    tool_ids: ['seo_site_review', 'seo_brand_search_audit'],
    quick_starts: [
      { label: 'Full site review', description: 'Rank + keywords + competitors + backlinks in one call', prompt: 'Run a full site review of a domain — ask me which.', icon: 'BadgeCheck' },
      { label: 'Brand SERP audit', description: 'Knowledge Panel + AI Overview brand mention', prompt: 'Run a brand-search audit for "<brand>" — ask me which brand.', icon: 'BadgeCheck' },
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
        prompt: 'Walk me through generating a complete SEO article. Ask me for the seed keyword and target country first.',
        icon: 'Newspaper',
        workflow_id: 'seo-article',
      },
      { label: 'Just research', description: 'Stop at research stage', prompt: 'Run only Stage 1 (keyword research). Ask me for the seed keyword.', icon: 'Search' },
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
        prompt: 'Walk me through finding manufacturers in a target market and saving qualified ones to CRM. Ask me for the industry and country.',
        icon: 'Building2',
        workflow_id: 'b2b-research',
      },
      { label: 'Enrich a company', description: 'Apollo data for a known domain', prompt: 'Pull Apollo enrichment for a single company — ask me for the domain.', icon: 'Building2' },
      { label: 'Find contacts', description: 'Decision-maker emails for a company', prompt: 'Find decision-maker emails at a company — ask me for the domain.', icon: 'Mail' },
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
      { label: 'Deep research', description: 'Multi-step open-ended research', prompt: 'Run a deep research analysis on a topic — ask me what.', icon: 'Bot' },
      { label: 'Platform analytics', description: 'Usage / metric breakdowns', prompt: 'Run an analytics question against the platform — ask me what to investigate.', icon: 'Bot' },
      { label: 'Business breakdown', description: 'Revenue / customer / GMV', prompt: 'Run a business-side analysis — ask me what dimension to break down.', icon: 'Bot' },
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
      { label: 'Pricing KB lookup', description: 'Admin-curated price data', prompt: 'Pull a pricing-KB entry — ask me which product / SKU to look up.', icon: 'Wrench' },
    ],
  },
];

/** Always-on toolkit IDs (cannot be disabled by the user). */
export const ALWAYS_ON_TOOLKIT_IDS = TOOLKITS.filter((t) => t.alwaysOn).map((t) => t.id);

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
 * Which agents own (have access to) a toolkit's tools? Derived dynamically by
 * intersecting the toolkit's tool_ids with each agent's tools[]. Used by the
 * onLaunch path in AgentHub to auto-switch agent so a user clicking a Catalogs
 * quick-start while on Interior Designer doesn't get a "tools not available"
 * reply. Returns at least one agent ID; defaults to ['kai'] when no agent is
 * found (defensive — most toolkits live on KAI).
 */
export function getToolkitOwnerAgents(toolkit: ToolkitDefinition): string[] {
  const owners = new Set<string>();
  for (const a of AGENTS) {
    const agentToolIds = new Set(a.tools.map((t) => t.id));
    if (toolkit.tool_ids.some((tid) => agentToolIds.has(tid))) {
      owners.add(a.id);
    }
  }
  return owners.size > 0 ? [...owners] : ['kai'];
}
