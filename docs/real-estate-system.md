# Real Estate System

Property listings, leads, viewings, offers, sales, lettings and investments — a paid add-on module (#249, sub-modules #281) built on the platform's module/entitlement framework.

**API reference:** [docs/api/real-estate-api.md](api/real-estate-api.md) — every action, param and gate.
**Frontend:** [`src/modules/real-estate/`](../src/modules/real-estate/) · sub-modules [`real-estate-management`](../src/modules/real-estate-management/) and [`real-estate-investments`](../src/modules/real-estate-investments/).

---

## 1. Shape of the module

Three purchasable slugs, all `is_addon=true`, `price_tier='pro'`:

| Slug | Name | Unlocks |
|---|---|---|
| `real-estate` | Real Estate | Listings, leads, viewings, offers, sales, buyers, deals pipeline, syndication, CMA |
| `real-estate-management` | Property Management | Tenancies, rent schedules, maintenance, landlord statements, rent→invoice |
| `real-estate-investments` | Investments | Investment cases with yield / ROI modelling |

The two sub-modules mount **additional tabs on the same `/properties` route** rather than pages of their own — buying Property Management doesn't move the user anywhere new, it grows the workbench they already use. A workspace without the add-on gets `402` from the corresponding actions and never sees the tab.

### Routes

| Route | Auth | Screen |
|---|---|---|
| `/properties` | JWT + entitlement + `realestate.view` | `RealEstatePage` — Overview, Listings, Leads, Viewings, Sales, Sellers, Buyers, Pipeline, Syndication (+ Lettings / Investments when entitled) |
| `/properties/:id` | same | `PropertyWorkbench` — the single-listing workspace |
| `/p/:token` | **public** | `PublicListingPage` — the shareable listing page |
| `/buyer/:token` | **public** | `BuyerPortalPage` — a buyer's matched listings + favourites |

Nav registration is `{ moduleSlug: 'real-estate', requireCapability: 'realestate.view' }`, so the item is absent — not disabled — for workspaces without the module.

---

## 2. Personas

`resolveRealEstateAccess` ([rbac.ts](../supabase/functions/real-estate-api/rbac.ts)) resolves one of four personas per request:

| Persona | Source | View | Manage | Scope |
|---|---|---|---|---|
| Operator | global `admin` / `super_admin` | ✅ | ✅ | Everything |
| Broker | workspace `owner` / `admin` | ✅ | ✅ | Every listing and every lead in the workspace |
| Agent | workspace role `realestate_agent` | ✅ | ✅ | **Own** listings (`listing_agent_id` or `created_by`) + listings flagged `open_for_all` (view-only) + own leads |
| Member | any other active member | ✅ | ❌ | Reads the shared listing book; every write `403`s |

A `realestate_agent` also gets a **reduced nav**: only Dashboard and Real Estate ([nav-items.ts](../src/config/nav-items.ts)). They are in the workspace to sell property, not to browse Finance.

**Two failure codes, on purpose.** Asking for a listing you can't see returns `404` — identical to a listing that doesn't exist, so ids can't be enumerated by probing. Trying to *edit* a listing you can already see returns `403 "This listing belongs to another agent."`; the id is already known by then, so there is nothing left to protect and a clear message is more useful than a lie.

---

## 3. Tables

| Table | Purpose |
|---|---|
| `properties` | The listing. ~120 columns spanning residential, commercial and land; `PROPERTY_WRITABLE` is the client-writable allowlist. |
| `property_photos` | Media + cover flag + display order; AI room/condition labels from `analyze-photos`. |
| `property_inquiries` | Inbound leads (public page, portal, walk-in, phone). |
| `property_viewings` | Scheduled viewings + outcome/feedback. |
| `property_offers` | Buyer offers and their status. |
| `property_sales` | Completed sales, commission, linked Finance invoice. |
| `property_interests` | "This contact is interested in this listing" — feeds matching. |
| `property_buyer_requirements` | Saved buyer search profile + `portal_token` + digest opt-in. |
| `property_buyer_favorites` | Favourites toggled from the buyer portal. |
| `property_contacts_ext` | Real-estate extension fields on a `crm_contacts` row. |
| `property_deals` / `property_deal_tasks` | The module's own pipeline board and per-deal checklist. |
| `property_tenancies` / `property_rent_charges` | Lettings: term, rent, deposit, and the materialised rent schedule. |
| `property_maintenance` | Maintenance jobs, contractor, cost. |
| `property_investments` | Investment cases: purchase, costs, financing, projected yield. |
| `property_price_history` | Price changes over the life of the listing. |
| `property_open_houses` | Scheduled open-house events. |
| `property_documents` | Listing paperwork. |
| `real_estate_settings` | Per-workspace: `feed_token`, `feed_enabled`, `feed_format`. |
| `public_realestate_submissions` | Hashed-IP counters backing the anonymous lead throttle. |

Contacts are **not** duplicated: sellers, buyers and tenants are ordinary `crm_contacts` rows with a `property_contacts_ext` companion. The same person can be a supplier in Finance and a vendor in Real Estate without a second record.

---

## 4. Publishing and the public surface

`publish-property` sets `listing_status='active'`, mints (or keeps) the opaque `public_listing_token`, and optionally sets `in_discovery`. Three independent visibility switches result:

| Switch | Effect |
|---|---|
| `is_public` + `listing_status='active'` | The `/p/:token` page resolves. |
| `in_discovery` | Also appears in cross-workspace **discovery** and in the **syndication feed**. |
| neither | Internal only. |

`in_discovery` is the one that governs third-party exposure, and it governs both discovery *and* the portal feed — a listing published to the agency's own site must not silently reach Kyero. `unpublish-property` clears it, so pulled listings drop out of the feed on the next fetch.

The public surface lives in a **separate edge function** (`real-estate-public`), so there is no code path where a missing auth check on a public action can reach an authenticated one. Everything it returns is the `toPublic()` projection: internal pricing (`cost_basis`, `min_offer`, `commission_pct`), compliance ids (`electronic_building_id`, `atak`) and vendor links never leave. When `hide_exact_address` is set, `address`, `street_number`, `postcode`, `lat` and `lng` are **nulled in the payload**, not merely hidden by the UI.

Anonymous lead writes require `gdpr_consent: true`, derive property + workspace from the token (never the body), and are capped at **8 per hour per IP** — the IP is SHA-256 hashed before it is stored.

---

## 5. Buyer matching

A **buyer requirement** is a saved search: budget, area, bedrooms, property types. It works in both directions off one `matchesCriteria` helper:

- `match-buyer-requirement` — requirement → ranked live listings.
- `buyers-for-property` — a new listing → which saved requirements it satisfies, so the agent can call the right people the day it lists.

Each requirement can carry a `portal_token`, giving the buyer their own `/buyer/:token` page (matches, favourites, request-a-viewing) with no account. Opting into the digest adds them to `real-estate-buyer-digests`, which emails only genuinely new matches and stamps `last_digest_at` so nothing re-sends. A buyer with nothing new gets no email at all.

---

## 6. Syndication

`real-estate-feed` serves `GET ?token=…&format=kyero|openimmo|generic` as XML. The `feed_token` is the only credential; `rotate-feed-token` revokes every portal holding the old URL **immediately**, with no grace window — a leaked feed URL is a data-exposure event, and a grace period would just extend it.

---

## 7. Where the module touches the rest of the platform

| Boundary | Behaviour |
|---|---|
| **CRM** | Leads convert to `crm_contacts`. `crm-lead-score` writes the *shared* `lead_score` / `health_score`, so CRM, Sales and Real Estate show one number rather than three. |
| **Finance** | `complete-sale` → commission invoice via `link-sale-invoice`. Rent charges → **draft** invoices via `invoice-rent-charge` (manual) or the nightly `real-estate-rent-invoicing` cron. |
| **myDATA** | Rent drafts are **never** auto-transmitted. Automatic invoicing must not become automatic irrevocable fiscal transmission — the manager reviews VAT and document type and issues from Finance. |
| **Flows** | Public leads and buyer requests emit workspace-scoped flow events (`emitFlowEventToWorkspaceRoles`), so notification routing is configurable rather than hardcoded. |
| **Agent** | The `manage_real_estate` tool gives the JARVIS agent the same capabilities as the UI (capability-fabric parity). |
| **VR / media** | A listing can carry `vr_world_id` (Marble walkthrough), `virtual_tour_url` and `video_url`. |

---

## 8. Crons

| Job | Schedule (UTC) | Does |
|---|---|---|
| `real-estate-rent-invoicing-daily` | 06:00 | Drafts Finance invoices for rent charges due within 7 days (500/run, drafts only). |
| `real-estate-buyer-digests-daily` | 08:00 | Emails saved-search digests to buyers with new matches. |
| `public-realestate-submissions-prune` | 03:15 | Prunes the hashed-IP throttle counters. |

Both edge crons use the shared `isCronAuthorized` gate (`x-cron-secret` **or** service-role bearer) and fail closed.
