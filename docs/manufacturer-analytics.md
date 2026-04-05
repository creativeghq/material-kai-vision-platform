# Manufacturer Analytics (Enhanced)

Comprehensive product interaction tracking and analytics dashboard for manufacturers/factories.

---

## Overview

Tracks how designers interact with manufacturer products across the platform, providing geographic demand data, designer engagement metrics, competitive positioning, and conversion funnels.

---

## Event Tracking

**Service:** `src/services/manufacturerAnalyticsService.ts`

Batched, fire-and-forget tracking. Events queue in memory and flush every 5 seconds or when batch reaches 20 events.

**Events:**
| Event | Trigger |
|-------|---------|
| `product_view` | ProductCard visible at 50% (IntersectionObserver) |
| `product_save` | Product added to moodboard |
| `product_quote` | Product added to quote |
| `product_search_impression` | Product appears in search results |
| `product_search_click` | Product clicked from search |
| `product_compare` | Product used in comparison |

**Event Fields:**
`event_type`, `product_id`, `manufacturer_id`, `user_id`, `user_city`, `user_country`, `session_id`, `source_page`, `metadata`, `created_at`

---

## Database

**Table:** `manufacturer_analytics_events`

**Indexes:** event_type, product_id, manufacturer_id, user_id, created_at

**RLS:** Authenticated users can insert; all authenticated users can read.

---

## Dashboard Sections

Located in `src/components/analytics/MyFactoryTab/MyFactoryTab.tsx`.

### Existing Sections (Enhanced)
- KPI row (8 metrics), Radar chart, Rating distribution
- Activity over time (8 weeks), Top products
- Quote pipeline, Conversion funnel
- Factory visibility & demand, Material attribute explorer

### New Sections
- **Geographic Demand** — Table showing views/saves/quotes by city/country
- **Designer Engagement by Profession** — Stacked bar chart (Interior Designer, Architect, etc.) with unique user counts
- **Competitive Positioning** — Per-category rank vs. other manufacturers with progress bars

---

## Tiered Access

`MyFactoryTab` accepts a `tier` prop: `'free' | 'pro' | 'enterprise'`

| Section | Free | Pro | Enterprise |
|---------|------|-----|------------|
| KPIs + basic charts | Yes | Yes | Yes |
| Geographic demand | Locked | Yes | Yes |
| Designer engagement | Locked | Yes | Yes |
| Competitive positioning | Locked | Yes | Yes |
| Designer contact info | No | No | Yes |

Admins automatically receive enterprise tier.
