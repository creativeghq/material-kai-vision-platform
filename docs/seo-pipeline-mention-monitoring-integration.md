# SEO Pipeline ↔ Mention Monitoring Integration Plan

> **Status: SHIPPED 2026-05-03 (v0.4.8)** — all 5 phases described below are now live in `seo-research`, `seo-plan`, `seo-write`, `seo-analyze`, and `seo-pipeline` finalize. The `/opportunities-stateless` MIVAA endpoint backs the integration. **Internal-only — no partner-facing API change.**

Right now the SEO content pipeline (`seo-research` → `seo-plan` → `seo-write` → `seo-analyze` → finalize) and the mention-monitoring `/opportunities` endpoint were **siloed**. They both called DataForSEO independently, partially overlapped in what they extracted, and neither wrote signals into the other's flow.

This document describes how mention-monitoring's 17 opportunity types are wired into the SEO article pipeline so every article generated benefits from the full SERP-signal surface — without rebuilding data plumbing in two places.

## Current state — what each surface knows today

### `seo-research` (stage 1, ~5% progress)
- Calls DataForSEO directly: keyword clusters, PAA, basic SERP insights, competitor URLs
- Persists to `seo_keyword_research` table + `stages_data.research`
- Output is a JSON blob consumed by `seo-plan`

### `seo-plan` (stage 2, ~30% progress)
- Pure Gemini structured output — no external SERP signals
- Reads the research blob, generates 24–30 sections + FAQ + meta tags + entity_mentions + schema_recommendations
- Persists `article_plan`

### `seo-write` (stage 3, ~70%)
- Pure Claude Opus prose — no external context beyond the plan
- Persists `markdown_content`

### `seo-analyze` (stage 4, ~90%)
- 15+ scoring rules + Gemini auto-fix loop
- Persists `content_analysis` + `improved_markdown`

### `/opportunities` (mention-monitoring)
- Calls DataForSEO Labs (Related Keywords + Suggestions + Difficulty + Intent + Domain Rank)
- Calls DataForSEO SERP Advanced (PAA + AI Overview + Featured Snippet + Related Search + Organic + Video carousel + Top Stories + Knowledge Graph + Paid + Shopping)
- Reads LLM probe snapshots
- Returns 17 opportunity types as opportunity cards

## What `seo-research` is missing today (vs. what `/opportunities` already extracts)

| Signal | In `seo-research`? | In `/opportunities`? | Loss to article quality |
|---|---|---|---|
| Related keywords + volume | ✅ | ✅ | — |
| PAA questions | ✅ (basic) | ✅ (full block + answer snippets) | Article FAQ section misses Google's actual top-answer text |
| **AI Overview** | ❌ | ✅ | Article doesn't know what Google's generative answer says — can't structure prose to be cited |
| **Featured Snippet** | ❌ | ✅ | Article doesn't target position-0 explicitly |
| **Related Searches** (live block, not Labs) | ❌ | ✅ | Article misses real intent-overlap clusters |
| **Competitor ranking** (top-5 organic with URL + description) | ⚠️ partial | ✅ full | Plan can't ground section structure in actual SERP winners |
| **Video carousel** | ❌ | ✅ | Article missing media-format guidance (when/where to embed video) |
| **Top Stories** | ❌ | ✅ | Article can't add a "news hook" intro when topic is timely |
| **Knowledge Graph** | ❌ | ✅ | Article can't optimize entity definitions for KG enrichment |
| **Paid competitor** | ❌ | ✅ | Plan misses competitive landscape signal (who's spending Ad budget on this query) |
| **Shopping listings** | ❌ | ✅ | E-commerce-intent articles can't target Shopping carousel |
| **Keyword difficulty** (per kw) | ❌ | ✅ (v0.4.7) | Plan can't prioritize easier keywords first |
| **Search intent** (per kw classification) | ❌ | ✅ (v0.4.7) | Plan defaults to blog format even when commercial/transactional intent is dominant |
| **LLM visibility** (Haiku/GPT/Gemini/Sonar share-of-voice) | ❌ | ✅ (v0.4.7) | Article can't be tuned to fill GEO gaps where competitors are cited but the brand isn't |
| **Domain snapshot** (Domain Rank + traffic baseline) | ❌ | ✅ (v0.4.7) | Plan misses overall-position context for difficulty calibration |

## Proposed integration — minimal-invasive wiring

### Pattern: `/opportunities` runs as a parallel sub-stage of `seo-research`

```
seo-pipeline
  └─ stage 1: seo-research (existing DataForSEO call)
       │
       └─ NEW parallel sub-stage: /opportunities (against the target_keyword)
            │
            └─ enrich `keyword_research.serp_signals` with all 17 opportunity types
  └─ stage 2: seo-plan (now reads enriched research)
  └─ stage 3: seo-write (now reads enriched plan + AI Overview text + featured snippet target)
  └─ stage 4: seo-analyze (compares output against actual top-5 organic, AI Overview)
  └─ stage 5: finalize
```

**No new DB tables. No new endpoints. Just enrichment of the existing `keyword_research` JSONB blob.**

### Stage-by-stage wiring

#### `seo-research` enrichment (additive)

Add a parallel call to `/opportunities` keyed on the target_keyword, then merge:

```ts
// supabase/functions/seo-research/index.ts (proposed addition)
const [dataforSeoResearch, opportunitySignals] = await Promise.all([
  fetchDataForSEOResearch(target_keyword, ...),  // existing
  fetchOpportunitySignals(target_keyword, ...),  // NEW
]);

const enrichedResearch = {
  ...dataforSeoResearch,
  serp_signals: {
    pao_questions: opportunitySignals.pao_question || [],
    ai_overview: opportunitySignals.ai_overview || null,
    featured_snippet: opportunitySignals.featured_snippet || null,
    related_searches: opportunitySignals.related_search || [],
    competitor_ranking: opportunitySignals.competitor_ranking || [],
    video_carousel: opportunitySignals.video_carousel || null,
    news_carousel: opportunitySignals.news_carousel || [],
    knowledge_graph: opportunitySignals.knowledge_graph || null,
    paid_competitors: opportunitySignals.paid_competitor || [],
    shopping_listings: opportunitySignals.shopping_listing || [],
    keyword_enrichment: {
      // map of keyword → { difficulty, intent }
      [kw]: { difficulty, intent }
    },
  },
};
```

Cost: 1 additional `/opportunities` call (~2 partner credits OR free for internal flow).

#### `seo-plan` consumption — new prompt fields

Currently `seo-plan` builds a Gemini prompt from `keyword_research` only. Extend the prompt to include the new `serp_signals`:

```python
# Pseudo-prompt additions
"""
Google's AI Overview for this query says: {serp_signals.ai_overview.text}
  → Structure the introduction to either echo or extend this framing — it's what users see first.

The current featured snippet is held by {serp_signals.featured_snippet.domain}: "{...}"
  → Add a section explicitly targeting position-0 with a 40–60 word direct answer in a single paragraph.

Top 5 ranking pages: {[c.url for c in serp_signals.competitor_ranking]}
  → Audit these. Match their depth + structure but add unique angle: {brand-specific value prop}.

PAA questions Google shows: {[q.title for q in serp_signals.pao_questions]}
  → Each should be an H2 in the FAQ section.

Related searches (intent overlap): {serp_signals.related_searches}
  → Add cross-link callouts to subordinate articles on these terms.

Video carousel platform mix: {serp_signals.video_carousel.platforms}
  → Recommend [N] short-form video clips with hook structure matching {top-creator pattern}.

Knowledge Graph status: {present | absent}
  → If absent: prioritize entity-defining first paragraph + Organization schema. If present: include 1–2 sentences echoing the KG description.

Search intent for primary keyword: {keyword_enrichment[primary_kw].intent}
  → If transactional: write a buyer's-guide / comparison / 'best X for Y' format. If informational: write a deep how-to / explainer.
  → If commercial: hybrid — buyer-intent in second half.
"""
```

#### `seo-write` consumption — system prompt additions

Pass the AI Overview text + featured snippet target + PAA answer snippets into the writing system prompt so the model produces prose that's a deliberate complement (not a copy) of what Google currently surfaces.

```python
"""
Google's current AI Overview for this query (you should COMPLEMENT, not duplicate, this framing):
{ai_overview_text}

Currently-featured snippet (your goal: outrank by being more direct + complete):
{featured_snippet.description}

These exact PAA questions should be answered word-for-word as H2 headings in the FAQ section,
each with a tight ≤80 word direct answer:
{[q.title for q in pao_questions]}
"""
```

#### `seo-analyze` consumption — gaps/gains scoring

Current gap analysis is rule-based. Add a "SERP feature gap" check:

- Did the article match the featured snippet structure? (40-60 word answer in a single paragraph after a matching H2)
- Did the article cover all PAA questions in the FAQ?
- Is the lede appropriate given News Carousel timeliness?
- If keyword intent is transactional, is there a CTA / comparison block?
- If knowledge_graph is absent for the brand, did the article include Organization schema?
- Is the article shorter than the average top-5 organic? (calibrate min word count)

Each becomes a `geoScore` / `seoScore` rule in the existing scoring engine.

#### Article-finalize — interlinking + gaps/gains

Use `related_search` block to populate the existing `interlinking_data` field in `seo_articles` — link from the new article to existing articles on the related-search terms (or flag them as "create these next" if not yet written).

## Implementation roadmap

### Phase 1 — Stage 1 enrichment (quick win)

**Effort**: ~3 hours.

- Add a parallel `/opportunities` fetch in `seo-research`
- Merge into `keyword_research.serp_signals`
- No prompt changes anywhere downstream yet — just the data is available

**Effect**: `keyword_research` blob in `seo_articles` rows starts including 17 new signal types. Anyone reading the row gets immediate access. No regression risk.

### Phase 2 — `seo-plan` prompt enhancement

**Effort**: ~2 hours.

- Update `buildPlanningUserPrompt()` to read `serp_signals` and inject the bullet points listed above
- Add new fields to the structured-output schema: `featuredSnippetTarget`, `aiOverviewComplement`, `recommendedMediaFormats`, `newsAngleSuggestions`, `knowledgeGraphStrategy`

**Effect**: Plans now ground their structure in Google's actual SERP shape. Articles match the top-ranking pages' depth, target featured snippets explicitly, write FAQ sections that mirror Google's PAA word-for-word.

### Phase 3 — `seo-write` system prompt enhancement

**Effort**: ~1 hour.

- Inject AI Overview text + featured snippet target + PAA answers into the writing system prompt
- Article prose now actively complements Google's existing surface

**Effect**: Articles cite-able by AI Overview (because they answer the same intent more authoritatively), more likely to capture position 0 (because they target it explicitly).

### Phase 4 — `seo-analyze` gap scoring

**Effort**: ~3 hours.

- Add 6 new rule checks to the analysis engine (featured snippet coverage, PAA coverage, news hook timeliness, transactional CTA, KG schema, word-count calibration vs top 5)
- Auto-fix loop already exists — these new checks plug into the existing iterations

**Effect**: Article quality score reflects SERP-feature alignment. Auto-fix iterations can correct missing PAA answers, missing featured-snippet-targeting paragraphs, etc.

### Phase 5 — Interlinking from related searches

**Effort**: ~2 hours.

- After analyze stage, populate `interlinking_data` from `serp_signals.related_searches` by checking which related terms map to existing `seo_articles` rows
- For unmatched related terms, populate a "next articles to write" list

**Effect**: Articles auto-interlink based on Google's actual intent-cluster signal, not just topical guesswork. Reduces SEO-team manual work.

## Cost analysis

Per-article cost increase from the integration: **+1 `/opportunities` call** (~$0.005 raw, 2 partner credits). Negligible vs the ~30+ credits an SEO article generation already costs (Claude Opus prose + Gemini plan + Gemini analyze).

## Backwards compatibility

The `keyword_research` blob already gets passed through stages opaquely. Adding a `serp_signals` key to it doesn't break existing consumers — they ignore unknown fields. Phase 1 is therefore zero-risk to existing article generation.

## Decision gates

| Phase | Decision needed |
|---|---|
| Phase 1 | None — pure additive enrichment |
| Phase 2 | Test on 5 existing topics, compare plan structure before/after |
| Phase 3 | A/B test article quality scores (existing analyzer) on enriched-vs-unenriched writes |
| Phase 4 | Tune scoring weights based on real article outcomes |
| Phase 5 | Confirm with SEO team that auto-interlinking matches their intent |

## Open questions

1. **Should `/probe-llm` results feed into `seo-write`?** When the article is being generated for a topic where the brand has 0% LLM visibility, the writing prompt could explicitly target the queries the LLM probes ask. Cost: probe must be fresh (~15 credits). Decision: probably yes, but only for high-stakes pillar articles, not blog filler. Add as opt-in flag.

2. **Should the SEO pipeline trigger `/opportunities` per cluster keyword, not just primary?** Each top-3 cluster keyword could get its own SERP signal pull, feeding section-level targeting. Cost: +N opportunities calls per article. Decision: probably yes for Phase 2 onwards.

3. **Should `domain_snapshot` data inform writing tone?** If the brand has high Domain Rank, the article can lean authoritative. If low, it should lean educational + cite external sources to borrow trust. Decision: minor tone hint, low-priority.
