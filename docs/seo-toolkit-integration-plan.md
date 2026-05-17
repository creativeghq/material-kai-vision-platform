# SEO Toolkit — Frontend Integration Plan

**Status of code in this branch**: 37 SEO agent tools shipped, all routed through `KAI` agent in chat. Backend `DataForSEOUnifiedClient` (~70 endpoints) + dispatch routes built. Typecheck clean. **Not deployed yet** — `/api/v1/seo-agent/*` routes return 404 until the MIVAA submodule is pushed and the agent-chat edge function is redeployed.

This doc lays out where else in the frontend these surfaces should appear beyond the chat-driven AgentHub flow we already have.

---

## What's already wired (Wave 0 — done)

| Surface | Where | Status |
|---|---|---|
| Chat-driven SEO research | `/agent-hub` → KAI agent → `seo_research_keyword` (and 36 others) | ✓ live in this branch |
| Inline cards for every tool | `SEOResearchCard.tsx` + `SEOGenericCard.tsx` (one component handles 36 chunk types) | ✓ |
| Conversation history persists chat-driven SEO calls | metadata.seoResearchData / seoGenericData | ✓ |

## Gap analysis — what's missing without a dedicated SEO surface

The chat-driven flow handles ad-hoc research well, but several use cases work better as a **persistent, navigable surface**:

1. **Catalog-wide SEO baseline** — "what's our SEO position across all our products / brand pages?" (cross-row aggregate, not one keyword at a time)
2. **Repeatable audits with history** — "audit `flobali.gr` weekly and show me the trendline" (no history is kept today; each chat call is one-shot)
3. **Domain-level dashboard** — when a brand has its `homepage_domain` configured, show it persistent in the admin nav
4. **Per-product SEO tab** — same way Mention Monitoring + Price Monitoring have a per-product tab today, products should have an SEO tab
5. **Standalone keyword-research tool for content team** — chat is great for exploration, but a form-based tool with saved-search history is better when you have a workflow like "every Monday, check 50 keywords"
6. **Competitive intel page** — "show me the keyword gaps + competitor landscape for our top 10 brands at a glance"
7. **Inspiration → SEO bridge** — when designer pastes a Pinterest moodboard, surface "these are the trending search terms for this aesthetic" (Pinterest-search + Google Trends + related searches)

Below is the integration plan, ordered by impact / cost ratio.

---

## Integration 1 — `/admin/seo` dashboard module (HIGHEST IMPACT)

Mirror of [`/admin/mention-monitoring`](src/components/business/mention-monitoring/MentionMonitoringDashboard.tsx) and [`/admin/price-monitoring`](src/components/business/price-monitoring/PriceMonitoringDashboard.tsx).

**Folder structure:**
```
src/components/business/seo/
├── SEODashboard.tsx              ← landing page with 4 tabs
├── tabs/
│   ├── KeywordResearchTab.tsx    ← saved keyword research with history
│   ├── DomainAuditTab.tsx        ← run + history of domain audits
│   ├── BacklinksTab.tsx          ← backlink monitoring per tracked domain
│   └── CompetitiveIntelTab.tsx   ← cross-brand keyword gap matrix
├── widgets/
│   ├── KeywordResearchForm.tsx   ← form-based version of seo_research_keyword
│   ├── DomainAuditCard.tsx       ← one-domain detail panel
│   └── CompetitorMatrix.tsx      ← grid: your-brand × competitors × keywords ranked
└── index.ts
src/modules/seo/index.ts          ← module registration (registers /admin/seo route)
```

**Backend additions:**
- New table `seo_research_runs` — (id, user_id, workspace_id, kind, params, response, created_at). Persists every research run so the dashboard can show history without re-firing DataForSEO.
- New table `seo_tracked_domains` — (id, user_id, domain, country_code, language_code, audit_cadence_hours, last_audit_at, snapshot). Domains the user wants persistent monitoring on. A pg_cron job re-audits these and stores a `seo_domain_audit_history` row per run.
- The cards we already built (`SEOGenericCard`, `SEOResearchCard`) get reused inside the dashboard tabs — same chunk shape, no duplicate React work.

**Effort**: 1.5 days. Mostly UI assembly — the data layer exists.

**User journey unlocked:**
- Admin opens `/admin/seo` → sees "12 tracked domains, last audit 2 days ago"
- Click into `flobali.gr` → full audit history with trendline (ranking-keywords count over time, traffic estimation, backlinks)
- Click "Re-audit now" → calls `seo_site_review` directly without going through chat
- Click "Compare to competitor" → form for competitor domain → renders keyword-gap matrix

---

## Integration 2 — Per-product SEO tab on ProductDetailModal (HIGH IMPACT)

Today products have tabs for: Materials Data, Mentions, Pricing. Add SEO.

**Where**: [`src/components/features/products/ProductDetailModal.tsx`](src/components/features/products/ProductDetailModal.tsx) — already has a tabs system.

**New file**: `src/components/business/seo/ProductSEOTab.tsx`

**What it does:**
- Auto-derive `target_keyword` candidates from `product.name + manufacturer + category` (no LLM call — string concat)
- Show 3 panels stacked:
  1. **Keyword opportunity** — `seo_research_keyword` against the candidate keywords. Shows AI Overview, featured snippet, top organic.
  2. **Competitive ranking** — top 5 organic competitors for the product's keyword cluster.
  3. **Domain authority** — if the product belongs to a manufacturer with a `homepage_domain` set, show `seo_domain_snapshot`.
- "Refresh" button — re-fires the calls. Cached for 24h server-side via the new `seo_research_runs` table.

**Effort**: 0.5 day. Reuses existing cards.

**User journey unlocked:**
- Designer opens a product (Flobali porcelain tile) → sees a Mentions tab (already there) + SEO tab
- SEO tab tells them: "this brand has 1.2k ranking keywords, position #3 for `recycled concrete tiles`, AI Overview cites them ✓, DR 47" — useful for understanding the supplier they're considering, not just the material
- B2B / sales rep can use this on a sales call to talk authority signals with the brand

---

## Integration 3 — Manufacturer/Brand admin profile gets a "SEO Health" panel (MEDIUM)

Brands with a `homepage_domain` field already in their CRM record (`crm_companies.country_code` and friends — see [Oxygen integration in CLAUDE.md](../CLAUDE.md)) get a persistent SEO health card.

**Where**: wherever the brand admin profile lives (`src/components/business/crm/...`). I haven't audited that file tree fully — assume there's a brand-detail page.

**What**: A right-rail card showing
- Domain Rank
- Ranking-keywords count + traffic estimate
- Top 3 ranking keywords
- Backlinks summary (referring domains + spam score)
- "Last audited 12 hours ago" — pulled from `seo_domain_audit_history`

**Effort**: 0.25 day. Pure UI on existing data.

---

## Integration 4 — Inspiration → SEO bridge inside the moodboard flow (MEDIUM)

When a user pastes a Pinterest URL or imports a moodboard from a search query, currently we run material-matching. **Add SEO context** as a side panel.

**Where**: [`src/components/business/moodboard/PinterestImportModal.tsx`](src/components/business/moodboard/PinterestImportModal.tsx) and the related design-inspiration flows.

**What**:
- For each color/material/style detected by the existing inspiration analysis, auto-fire `seo_pinterest_search` + `seo_google_trends` to surface "these aesthetics are trending +23% W/W"
- For room types (kitchen / bedroom / etc.), surface PAA + related searches as "questions homeowners ask about this aesthetic"
- Helps the designer understand demand/popularity, not just match materials

**Effort**: 0.5 day. Trickier UX than the others — needs careful design integration so it doesn't clutter the inspiration view.

---

## Integration 5 — Saved searches surface for SEO (LOW)

The platform has `saved_searches` already (see [`mivaa-pdf-extractor/app/api/saved_searches.py`](mivaa-pdf-extractor/app/api/saved_searches_routes.py)). Extend it so any `seo_*` chunk can be saved as a "tracked search" with a re-run button.

**Where**: `/admin/saved-searches` page. Add a filter for `kind=seo`.

**What**: User says "save this research" in chat → saved as a row → user can re-run from a list view.

**Effort**: 0.25 day. Pure plumbing.

---

## Integration 6 — Module registration for the new dashboard (REQUIRED for #1)

Mirror the pattern at [`src/modules/mention-monitoring/index.ts`](src/modules/mention-monitoring/index.ts):

```typescript
// src/modules/seo/index.ts
import { lazy } from 'react';
import type { ModuleDefinition } from '@/types/modules';

const SEODashboard = lazy(() =>
  import('@/components/business/seo/SEODashboard'),
);

export const seoModule: ModuleDefinition = {
  slug: 'seo',
  name: 'SEO Toolkit',
  routes: [
    {
      path: '/admin/seo',
      component: SEODashboard as any,
      adminOnly: true,
    },
  ],
};
```

Plus a row in `public.modules` table (`slug='seo', enabled=true`).

**Effort**: 0.1 day.

---

## Recommended sequencing

| Wave | Items | Effort | Cumulative value |
|---|---|---|---|
| **Wave 0 (DONE in this branch)** | Chat-driven toolkit (37 tools + 2 cards) | — | ~70% of conversational use cases |
| **Wave 4** | Integration 1 (`/admin/seo` dashboard) + Integration 6 (module registration) | 1.6 days | +20% — adds catalog-wide view + audit history |
| **Wave 5** | Integration 2 (per-product SEO tab) | 0.5 day | +5% — bridges material catalog to SEO |
| **Wave 6** | Integration 3 (brand admin SEO card) + Integration 5 (saved searches) | 0.5 day | +3% — small UX polish |
| **Wave 7** | Integration 4 (inspiration→SEO bridge) | 0.5 day | +2% — niche but high-delight feature |

**Total beyond Wave 0**: ~3.1 days for full surface coverage.

---

## What I would NOT build right now

- **A standalone "SEO mode" agent** — KAI already routes well to all 37 tools. A separate agent fragments the experience and the routing accuracy gain is marginal.
- **Mobile-app version of the dashboard** — admin tools live on desktop. No need.
- **Public-facing SEO research API** — currently the toolkit is internal-only (cron-secret auth). Exposing it would require new credit accounting + rate limits + per-API-key tracking. Could come later if there's customer demand.
- **Stand-alone notification system for SEO** — mention-monitoring's alerts (spike, sentiment, new outlet, LLM visibility change) already cover the most-relevant alerts. SEO ranking change alerts are a separate v2 feature with its own historical-snapshot table requirement.

---

## Required env vars (across all integrations)

Already configured for mention-monitoring + price-monitoring; verify they're set on the same boundaries:

**MIVAA**:
- `DATAFORSEO_BASE64` (or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`) — required
- `CRON_SECRET` — required
- `DATAFORSEO_SANDBOX=1` (optional) — short-circuits every call to dummy data, zero charge

**Edge functions (agent-chat)**:
- `MIVAA_GATEWAY_URL` — already set
- `CRON_SECRET` — same as MIVAA

---

## Deployment checklist (BEFORE this branch is usable)

```bash
# 1. Push the MIVAA submodule (which contains the new client + routes)
cd mivaa-pdf-extractor && git push

# 2. Bump the submodule pointer in the parent repo
cd .. && git add mivaa-pdf-extractor && git commit -m "..."

# 3. Wait for MIVAA service to redeploy (or trigger manually)

# 4. Deploy the agent-chat edge function with the new tool registrations
supabase functions deploy agent-chat

# 5. Run the smoke test
export CRON_SECRET="..."
bash scripts/test-seo-agent-endpoints.sh

# 6. Open chat and try:
#    "research the keyword 'porcelain tile installation' in the UK"
#    "audit https://flobali.gr"
#    "what does flobali.gr rank for in Greece?"
#    "find keyword gaps between flobali.gr and carrelagedirect.fr"
```
