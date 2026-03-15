/**
 * Demo SEO Article Data
 * Used by the Demo Agent when the 'seo_article' command is triggered
 */

export const SEO_ARTICLE_DEMO_DATA = {
  type: 'seo_article',
  data: {
    // Core identity
    id: 'demo-article-001',
    title: 'The Ultimate Guide to Accessories Marketing: Trends & Strategies for 2025',
    slug: 'accessories-marketing-guide-2025',
    target_keyword: 'accessories marketing',
    secondary_keywords: ['fashion accessories trends', 'accessories retail strategy', 'jewellery marketing', 'bag marketing campaigns', 'accessories SEO'],
    content_type: 'guide',
    // SEO metadata
    meta_title: 'Accessories Marketing Guide 2025: Trends, SEO & Strategy',
    meta_description: 'Discover proven accessories marketing strategies, industry trends, and data-driven techniques to boost your brand\'s visibility and sales in 2025.',
    // Scores & stats
    overall_score: 87,
    seo_score: 87,
    readability_score: 76,
    word_count: 1850,
    reading_time_minutes: 8,
    credits_used: 45,
    processing_time_ms: 42300,
    // Status
    status: 'completed',
    progress_percentage: 100,
    current_stage: 'done',
    stages_data: null,
    pipeline_log: ['Research completed', 'Plan generated', 'Article written (1850 words)', 'Analysis passed (score: 87)', 'Finalized'],
    fix_iterations: 1,
    error_message: null,
    created_at: '2025-02-24T10:30:00Z',
    updated_at: '2025-02-24T10:42:00Z',
    // Unused fields (kept for type compatibility)
    article_plan: null,
    content_brief: null,
    content_analysis: null,
    keyword_density: { 'accessories marketing': 1.8, 'fashion accessories': 1.2, 'marketing strategy': 0.9 },
    schema_markup: { '@type': 'Article', '@context': 'https://schema.org', name: 'Accessories Marketing Guide 2025' },
    faq_schema: [
      { question: 'What are the best marketing channels for accessories brands?', answer: 'TikTok Shop, Instagram Shopping, and Pinterest are the highest-converting channels for accessories, with micro-influencer partnerships delivering 60% higher engagement.' },
      { question: 'How important is SEO for accessories e-commerce?', answer: 'Extremely important. Long-tail keyword strategies targeting "how to style" queries see 280% higher CTR and 3× better conversion than generic terms.' },
      { question: 'When should accessories brands plan seasonal campaigns?', answer: 'Plan gifting campaigns 8 weeks ahead of key windows: Q4 holidays, Valentine\'s Day, Mother\'s Day, and graduation season.' },
    ],
    // Full markdown content
    markdown_content: `# The Ultimate Guide to Accessories Marketing: Trends & Strategies for 2025

## Introduction: The Accessories Market Landscape

The global accessories market is projected to reach **$540 billion by 2025**, driven by social media influence, sustainability trends, and the rise of personal styling culture. Brands that master modern marketing techniques are capturing outsized market share.

According to McKinsey's 2024 State of Fashion report, accessories now account for 28% of total fashion revenue — up from 19% five years ago. The shift is structural: consumers invest in statement accessories as a cost-effective way to refresh their wardrobe.

## 1. Social Commerce & Influencer Partnerships

Accessories are among the top-performing categories on TikTok Shop and Instagram Shopping. Micro-influencers (10K–100K followers) generate **60% higher engagement rates** than macro-influencers for accessories categories. Focus on authentic unboxing and styling content.

**Key tactics:**
- Partner with niche micro-influencers in jewellery, bags, and scarves
- Use TikTok's "Link in Bio" shopping features for direct conversion
- Create styling challenge hashtags to drive organic UGC

## 2. SEO-Driven Content Strategy

Long-tail keywords like *"silver minimalist bracelet for office"* convert **3× better** than generic terms. Build a content hub around styling guides, care tips, and trend reports.

Target "how to style" queries which see **280% higher CTR** in accessories niches. Publish seasonal lookbooks optimised for visual search on Google Images and Pinterest.

## 3. Visual Merchandising & UGC

User-generated content increases accessories conversion rates by **29%**. Implement AR try-on features — brands using virtual try-on see 40% fewer returns. Pinterest remains the highest purchase-intent platform for fashion accessories.

## 4. Seasonal Campaign Planning

Q4 accounts for **38% of annual accessories revenue**. Plan gifting campaigns 8 weeks ahead. Valentine's Day, Mother's Day, and graduation season are critical windows. Bundle offers increase average order value by **24%**.

## 5. Sustainability as a Brand Differentiator

**67% of accessories buyers under 35** prioritize sustainability credentials. Certifications, recycled materials labeling, and repair programs drive brand loyalty. Brands with clear sustainability messaging see 18% higher repeat purchase rates.

## FAQ

**What are the best marketing channels for accessories brands?**
TikTok Shop, Instagram Shopping, and Pinterest are the highest-converting channels, with micro-influencer partnerships delivering 60% higher engagement.

**How important is SEO for accessories e-commerce?**
Extremely important. Long-tail keyword strategies targeting "how to style" queries see 280% higher CTR and 3× better conversion than generic terms.`,
    html_content: null,
    // Tab: Optimize
    optimize_data: {
      contentScore: 87,
      avgCompetitorScore: 74,
      topCompetitorScore: 91,
      geoScore: {
        overall: 82,
        signals: {
          statisticsWithAttribution: 90,
          namedEntities: 85,
          structuredDefinitions: 75,
          expertQuotes: 70,
          faqCoverage: 95,
          schemaCoverage: 88,
          sourceCitations: 78,
          directAnswers: 85,
          authorityTone: 80,
          selfContainedParagraphs: 82,
        },
        recommendations: [
          'Add 2–3 expert quotes from industry analysts to boost authority signals',
          'Include a comparison table for marketing channel ROI',
          'Cite at least one peer-reviewed or government source for statistics',
        ],
      },
      sectionScores: {
        promptCoverage: { status: 'all_good', issueCount: 0, details: ['All brief requirements covered'] },
        schemaMarkup: { status: 'all_good', issueCount: 0, details: ['Article schema implemented', 'FAQPage schema present'] },
        keyTerms: { status: 'all_good', issueCount: 0, details: ['Primary keyword used 1.8% (target: 1-2%)', 'All secondary keywords present'] },
        metaTags: { status: 'all_good', issueCount: 0, details: ['Meta title: 52 chars (optimal)', 'Meta description: 148 chars (optimal)'] },
        url: { status: 'all_good', issueCount: 0, details: ['Slug includes primary keyword', 'No stop words'] },
        featuredSnippet: { status: 'issues_found', issueCount: 1, details: ['Add a definition paragraph for "accessories marketing" in H2 format for featured snippet targeting'] },
        h1Heading: { status: 'all_good', issueCount: 0, details: ['H1 includes primary keyword', 'H1 length optimal (65 chars)'] },
        links: { status: 'issues_found', issueCount: 1, details: ['No external authority links found — add 2–3 outbound links to industry reports'] },
        h2h6Headings: { status: 'all_good', issueCount: 0, details: ['5 H2 headings (target: 4–8)', 'Keyword-rich headings'] },
        contentDepth: { status: 'all_good', issueCount: 0, details: ['1,850 words (target: 1,800+)', 'Covers all competitor topics'] },
        keywordDensity: { status: 'all_good', issueCount: 0, details: ['Primary: 1.8% (optimal)', 'LSI terms well distributed'] },
      },
    },
    // Tab: Brief
    brief_data: {
      generalInstructions: {
        targetImages: '5–7',
        targetWordCount: '1,800+',
        targetHeadings: '20–28',
      },
      outline: [
        { heading: 'The Ultimate Guide to Accessories Marketing: Trends & Strategies for 2025', headingLevel: 'h1', targetKeywords: ['accessories marketing'], description: 'Primary H1 including target keyword', estimatedWordCount: 0, includeFaq: false, includeTable: false, includeList: false, subsections: [] },
        { heading: 'Introduction: The Accessories Market Landscape', headingLevel: 'h2', targetKeywords: ['accessories market 2025', 'fashion accessories trends'], description: 'Market size, growth drivers, and opportunity overview', estimatedWordCount: 200, includeFaq: false, includeTable: false, includeList: false, subsections: [] },
        { heading: 'Social Commerce & Influencer Partnerships', headingLevel: 'h2', targetKeywords: ['influencer marketing accessories', 'TikTok accessories'], description: 'Social channels, micro-influencer strategies, UGC', estimatedWordCount: 320, includeFaq: false, includeTable: false, includeList: true, subsections: [] },
        { heading: 'SEO-Driven Content Strategy', headingLevel: 'h2', targetKeywords: ['accessories SEO', 'accessories content marketing'], description: 'Keyword strategy, content hubs, long-tail targeting', estimatedWordCount: 300, includeFaq: false, includeTable: false, includeList: false, subsections: [] },
        { heading: 'Visual Merchandising & UGC', headingLevel: 'h2', targetKeywords: ['accessories visual merchandising', 'AR try-on fashion'], description: 'Visual content, AR features, Pinterest strategy', estimatedWordCount: 280, includeFaq: false, includeTable: false, includeList: false, subsections: [] },
        { heading: 'Seasonal Campaign Planning', headingLevel: 'h2', targetKeywords: ['accessories seasonal marketing', 'gifting campaigns'], description: 'Q4 strategy, key gifting windows, bundle tactics', estimatedWordCount: 250, includeFaq: false, includeTable: true, includeList: false, subsections: [] },
        { heading: 'Sustainability as a Brand Differentiator', headingLevel: 'h2', targetKeywords: ['sustainable accessories marketing', 'eco fashion'], description: 'Sustainability messaging, certifications, loyalty programs', estimatedWordCount: 250, includeFaq: false, includeTable: false, includeList: false, subsections: [] },
        { heading: 'FAQ', headingLevel: 'h2', targetKeywords: [], description: 'Frequently asked questions targeting PAA queries', estimatedWordCount: 250, includeFaq: true, includeTable: false, includeList: false, subsections: [] },
      ],
      faqQuestions: [
        { id: 'faq-1', question: 'What are the best marketing channels for accessories brands?' },
        { id: 'faq-2', question: 'How important is SEO for accessories e-commerce?' },
        { id: 'faq-3', question: 'When should accessories brands plan seasonal campaigns?' },
        { id: 'faq-4', question: 'How do I use micro-influencers for accessories marketing?' },
      ],
      keyTerms: ['accessories marketing', 'fashion accessories trends', 'accessories retail strategy', 'jewellery marketing', 'bag marketing campaigns', 'accessories SEO', 'social commerce', 'influencer partnerships', 'visual merchandising', 'UGC', 'seasonal campaigns', 'sustainable fashion'],
    },
    // Tab: Gaps/Gains
    gaps_gains_data: {
      gapCount: 4,
      gainCount: 3,
      gaps: [
        { topic: 'Email marketing for accessories', type: 'gap', competitorCount: 5, relevanceScore: 88 },
        { topic: 'Paid social ROI benchmarks', type: 'gap', competitorCount: 4, relevanceScore: 82 },
        { topic: 'Accessories photography best practices', type: 'gap', competitorCount: 3, relevanceScore: 75 },
        { topic: 'International market expansion', type: 'gap', competitorCount: 3, relevanceScore: 71 },
      ],
      gains: [
        { topic: 'AR virtual try-on strategy', type: 'gain', competitorCount: 1, relevanceScore: 90 },
        { topic: 'GEO-optimised content signals', type: 'gain', competitorCount: 0, relevanceScore: 85 },
        { topic: 'Bundle offer AOV tactics', type: 'gain', competitorCount: 2, relevanceScore: 78 },
      ],
      all: [
        { topic: 'Email marketing for accessories', type: 'gap', competitorCount: 5, relevanceScore: 88 },
        { topic: 'Paid social ROI benchmarks', type: 'gap', competitorCount: 4, relevanceScore: 82 },
        { topic: 'AR virtual try-on strategy', type: 'gain', competitorCount: 1, relevanceScore: 90 },
        { topic: 'GEO-optimised content signals', type: 'gain', competitorCount: 0, relevanceScore: 85 },
        { topic: 'Accessories photography best practices', type: 'gap', competitorCount: 3, relevanceScore: 75 },
        { topic: 'Bundle offer AOV tactics', type: 'gain', competitorCount: 2, relevanceScore: 78 },
        { topic: 'International market expansion', type: 'gap', competitorCount: 3, relevanceScore: 71 },
      ],
    },
    // Tab: Research
    research_tab_data: {
      keyTerms: [
        { term: 'accessories marketing', searchVolume: 45200, competition: 0.62, cpc: 2.40, keywordDifficulty: 58, importance: 10, usage: 34, usageRange: '30-40', trend: 'up', trendDelta: 12, opportunityScore: 82 },
        { term: 'fashion accessories trends', searchVolume: 22800, competition: 0.48, cpc: 1.80, keywordDifficulty: 45, importance: 8, usage: 18, usageRange: '15-20', trend: 'up', trendDelta: 8, opportunityScore: 78 },
        { term: 'accessories retail strategy', searchVolume: 8400, competition: 0.35, cpc: 3.10, keywordDifficulty: 38, importance: 7, usage: 12, usageRange: '10-15', trend: 'stable', trendDelta: 2, opportunityScore: 74 },
        { term: 'jewellery marketing', searchVolume: 18600, competition: 0.55, cpc: 2.90, keywordDifficulty: 52, importance: 7, usage: 9, usageRange: '8-12', trend: 'up', trendDelta: 5, opportunityScore: 70 },
        { term: 'bag marketing campaigns', searchVolume: 6200, competition: 0.28, cpc: 1.60, keywordDifficulty: 31, importance: 6, usage: 7, usageRange: '5-10', trend: 'stable', trendDelta: 1, opportunityScore: 68 },
        { term: 'social commerce fashion', searchVolume: 12400, competition: 0.42, cpc: 1.20, keywordDifficulty: 40, importance: 6, usage: 11, usageRange: '10-15', trend: 'up', trendDelta: 18, opportunityScore: 80 },
        { term: 'micro-influencer accessories', searchVolume: 4800, competition: 0.22, cpc: 0.95, keywordDifficulty: 24, importance: 5, usage: 6, usageRange: '5-8', trend: 'up', trendDelta: 22, opportunityScore: 85 },
      ],
      competition: [
        { url: 'https://sproutsocial.com/insights/accessories-marketing', title: 'Accessories Marketing: 12 Strategies That Work', domain: 'sproutsocial.com', position: 1, wordCount: 3200, headings: ['Introduction', 'Social Media Strategy', 'Email Marketing', 'Paid Advertising', 'Influencer Partnerships'], contentScore: 91, domainAuthority: 87 },
        { url: 'https://hubspot.com/marketing/fashion-accessories', title: 'Fashion Accessories Marketing Guide', domain: 'hubspot.com', position: 2, wordCount: 2800, headings: ['Market Overview', 'Digital Channels', 'Content Strategy', 'SEO for Accessories', 'Case Studies'], contentScore: 88, domainAuthority: 93 },
        { url: 'https://shopify.com/blog/accessories-marketing', title: 'How to Market Accessories Online in 2025', domain: 'shopify.com', position: 3, wordCount: 2100, headings: ['Platform Selection', 'Product Photography', 'Social Commerce', 'Seasonal Campaigns'], contentScore: 79, domainAuthority: 91 },
        { url: 'https://fashionunited.com/accessories-marketing-trends', title: 'Accessories Marketing Trends 2025', domain: 'fashionunited.com', position: 4, wordCount: 1600, headings: ['Market Data', 'Sustainability Trends', 'Digital Strategies'], contentScore: 71, domainAuthority: 72 },
      ],
      questions: [
        { question: 'What are the best marketing channels for accessories brands?', source: 'paa', volume: 1200, answered: true },
        { question: 'How do I market fashion accessories on Instagram?', source: 'paa', volume: 880, answered: false },
        { question: 'What is the accessories market size in 2025?', source: 'paa', volume: 720, answered: true },
        { question: 'How to use influencers for jewellery marketing?', source: 'paa', volume: 640, answered: true },
        { question: 'What SEO strategy works best for accessories e-commerce?', source: 'autocomplete', volume: 520, answered: true },
        { question: 'How do accessories brands use TikTok for sales?', source: 'related', volume: 480, answered: false },
      ],
      statistics: {
        avgWordCount: 2425,
        avgContentScore: 82,
        sentimentDistribution: { positive: 65, neutral: 28, negative: 7 },
        publicationDateRange: { earliest: '2023-08-01', latest: '2025-01-15' },
        contentTypeDistribution: { guide: 40, listicle: 30, how_to: 20, case_study: 10 },
      },
      serpFeatures: {
        hasAiOverview: true,
        aiOverviewSources: [{ url: 'https://sproutsocial.com', title: 'Accessories Marketing Guide', domain: 'sproutsocial.com' }],
        hasFeaturedSnippet: true,
        featuredSnippetType: 'paragraph',
        featuredSnippetContent: 'Accessories marketing involves promoting fashion accessories through digital channels including social commerce, influencer partnerships, and SEO-driven content strategies.',
        hasKnowledgeGraph: false,
        hasPeopleAlsoAsk: true,
        serpFeatureTypes: ['ai_overview', 'featured_snippet', 'people_also_ask', 'image_pack', 'shopping_results'],
      },
      detailedReport: {},
    },
    // Tab: Inter-linking
    interlinking_data: {
      suggestedLinks: [
        { anchor: 'TikTok Shop for fashion brands', targetTopic: 'TikTok Shopping Strategy Guide', reason: 'Directly relevant to social commerce section — adds depth on platform setup' },
        { anchor: 'micro-influencer campaign best practices', targetTopic: 'Micro-Influencer Marketing Playbook', reason: 'Expands the influencer partnerships section with actionable how-to content' },
        { anchor: 'sustainable fashion certifications', targetTopic: 'Sustainability Certifications for Fashion Brands', reason: 'Supports the sustainability differentiator section with detailed certification guide' },
        { anchor: 'seasonal gifting campaign calendar', targetTopic: 'Fashion Retail Seasonal Calendar 2025', reason: 'Supplements Q4 campaign planning with full-year editorial calendar' },
      ],
      existingArticles: [
        { id: 'art-002', title: 'Fashion SEO: Complete Keyword Strategy for Retail', slug: 'fashion-seo-keyword-strategy', relevance: 94 },
        { id: 'art-003', title: 'Instagram Shopping Setup Guide for Fashion Brands', slug: 'instagram-shopping-fashion-guide', relevance: 88 },
        { id: 'art-004', title: 'How to Build a Content Hub for E-Commerce', slug: 'content-hub-ecommerce-strategy', relevance: 81 },
      ],
      competitorArticles: [
        { url: 'https://sproutsocial.com/insights/accessories-marketing', title: 'Accessories Marketing: 12 Strategies That Work', domain: 'sproutsocial.com', position: 1, wordCount: 3200, headings: [], contentScore: 91, domainAuthority: 87 },
        { url: 'https://hubspot.com/marketing/fashion-accessories', title: 'Fashion Accessories Marketing Guide', domain: 'hubspot.com', position: 2, wordCount: 2800, headings: [], contentScore: 88, domainAuthority: 93 },
      ],
    },
  },
  message: 'SEO article generated for Accessories Marketing',
};
