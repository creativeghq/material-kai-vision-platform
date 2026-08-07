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
| `property_open_houses` | Scheduled open-house events. Created from the workbench **Viewings** tab. |
| `property_documents` | Listing paperwork (ΠΕΑ, Ηλ. Ταυτότητα, title deed, agency agreement…). Workbench **Documents** tab; private bucket, signed URL per read. |
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

### Marketing consent

Both buyer-facing sends — the immediate new-listing alert in `real-estate-api` and the nightly digest — gate on `crm_contacts.marketing_consent`, and that column is `NOT NULL DEFAULT false`. So the consent has to be **captured**, not just enforced: the public listing enquiry, the valuation widget and `convert-inquiry` each carry an optional marketing opt-in (`property_inquiries.marketing_consent`), kept as a **separate** checkbox from the required processing consent — bundling them would make the processing consent not freely given. The buyer portal's own toggle (`buyer-set-consent`) is the withdrawal path, and it writes both the requirement's `digest_enabled` and the contact's `marketing_consent`, because the two sends read different flags.

Before this existed the enforcement was live and the capture was not, so every lead the module captured itself was permanently opted out and the alert path could never fire — a silent zero, not a policy.

---

## 6. Syndication

`real-estate-feed` serves `GET ?token=…&format=kyero|openimmo|generic` as XML. The `feed_token` is the only credential; `rotate-feed-token` revokes every portal holding the old URL **immediately**, with no grace window — a leaked feed URL is a data-exposure event, and a grace period would just extend it.

---

## 7. Where the module touches the rest of the platform

| Boundary | Behaviour |
|---|---|
| **CRM** | Leads convert to `crm_contacts`. `crm-lead-score` writes the *shared* `lead_score` / `health_score`, so CRM, Sales and Real Estate show one number rather than three. |
| **Finance** | `complete-sale` → commission invoice via `link-sale-invoice`. Rent charges → **draft** invoices via `invoice-rent-charge` (manual) or the nightly `real-estate-rent-invoicing` cron. |
| **Rent settlement** | `get_rent_charge_settlements(uuid[])` is the SINGLE derivation. An **invoiced** charge settles from `payment_allocations` (money IN against its invoice); an **uninvoiced** one from the manual `status`/`paid_amount`, which is then the only record of the money. `list-rent-charges` and `landlord-statement` read it through `withRentSettlements`; `mark-rent-paid` **409s** on an invoiced charge (record the payment, or a credit note to waive, in Finance). `realestate.rent_charge_status_drift` compares the stored flag against the derivation and heals it. Never sum `status = 'paid'` to answer "how much rent came in". |
| **myDATA** | Rent drafts are **never** auto-transmitted. Automatic invoicing must not become automatic irrevocable fiscal transmission — the manager reviews VAT and document type and issues from Finance. |
| **Flows** | Public leads and buyer requests emit workspace-scoped flow events (`emitFlowEventToWorkspaceRoles`), so notification routing is configurable rather than hardcoded. `publish-property` emits `realestate.listing_published`; the seeded locked flow turns it into a **draft** social post per connected account (`real-estate-listing-social`) plus a team notification. |
| **Social** | Announcements stop at **draft**, on purpose. `zernio-api` authorises publishing against a real workspace member and the flow runs service-role with no user — publishing from there would mean weakening the check that stops one tenant posting through another tenant's connected account. The caption is built from the listing's own fields (no credits, and no unreviewed AI copy on a property ad, which is where fair-housing language goes wrong). |
| **Agent** | The `manage_real_estate` tool gives the JARVIS agent the same capabilities as the UI (capability-fabric parity). |
| **VR / media** | The workbench Media tab generates a Marble VR walkthrough from the cover photo (`generate-vr-world`, 18 credits, saved as `vr_world_id`); the Content step edits `virtual_tour_url` / `video_url` (http(s) enforced at write time — these render as links to anonymous visitors). The public page embeds the completed splat world (lazy-loaded Spark viewer), a privacy-friendly YouTube/Vimeo embed, and the tour link. |
| **Semantic search** | `publish-property` / `update-property` maintain `properties.text_embedding` (Voyage 1024D through the MIVAA gateway, best-effort). Discovery's free-text query ranks by cosine via the service-role-only `search_properties_semantic` RPC (HNSW-indexed), restricted to the exact discover population; embedding failure degrades to facet/recency search. |

---

## 8. Crons

| Job | Schedule (UTC) | Does |
|---|---|---|
| `real-estate-rent-invoicing-daily` | 06:00 | Drafts Finance invoices for rent charges due within 7 days (500/run, drafts only). |
| `real-estate-buyer-digests-daily` | 08:00 | Emails saved-search digests to buyers with new matches. |
| `real-estate-vendor-reports-weekly` | Mon 07:00 | Emails each instructing vendor a performance report on their own listing. |
| `public-realestate-submissions-prune` | 03:15 | Prunes the hashed-IP throttle counters. |

Both edge crons use the shared `isCronAuthorized` gate (`x-cron-secret` **or** service-role bearer) and fail closed.

## 9. Listing performance and the vendor report

`get_property_performance(uuid[])` is the SINGLE derivation for how a listing is doing — days-on-market included. `property_daily_stats` is the time series behind it (one row per listing per day, written only by `increment_property_view_count`, so traffic cannot be forged from a client). The workbench **Performance** tab reads both.

**`days_on_market` is derived, never stored.** The column of that name was dropped: nothing had ever written it, `toPublic()` shipped it to the public page and every portal feed as a permanent null, and the CMA had routed around it with its own inline `sold_at − created_at` that measured from creation rather than publication. Read the derivation.

The **vendor report** is what the instructing seller is told: traffic, viewings and their feedback, and a comps-based price recommendation. `buildVendorReport` / `sendVendorReport` are shared by the in-app preview, the manual "Send now" and the weekly cron, so the seller and the agent can never be looking at different numbers. Comps come from `buildCompsReport`, the same engine behind the CMA — deliberately, so the two documents cannot quote different valuations.

It is a **service communication** under the agency agreement, not marketing: gated per listing on `properties.vendor_reports_enabled`, not on `crm_contacts.marketing_consent` (which would be the wrong legal basis). `last_vendor_report_at` is stamped only on a successful send, so a failed week retries rather than being skipped.

## 10. Commission splits, lead routing, import

**Commission splits.** `property_sale_commission_splits` shares one sale's fee between the listing agent, the buyer agent, the house, a referral or an external party. A split row stores the **rule** (50%, or €500), never the figure: `get_sale_commission_splits(uuid[])` derives every amount, so correcting a sale price re-derives the shares instead of leaving stale numbers. Percentages are of **`commission_base`** — the fee net of VAT — because the VAT is remitted to the state, not shared with an agent. `agent-commission-statement` answers "what am I owed for this period"; an agent may always run their own, only a broker may run someone else's.

**Lead routing.** `realestate_lead_routing_rules` matches the listing's town / region / postcode prefix (an empty array means "don't care", so a criteria-less rule is the catch-all), then deals round-robin inside the winning rule. `route_property_lead` picks and advances the cursor in one statement — deriving "who got the last one" from the inquiries table would make two simultaneous leads pick the same agent. Both `list-inquiries` and `update-inquiry` recognise the **assignee** as well as the listing owner, so a lead routed across desks is visible and workable by the person who got it.

**Import.** `import-listings` takes CSV rows (parsed in the browser) or Kyero XML, normalises both through `normaliseImportRow`, and upserts on `reference_code`. The payload is built field by field from `IMPORT_WRITABLE` — deliberately narrower than `PROPERTY_WRITABLE`, and never a spread (invariant 8). Imported listings land as **unpublished drafts**: they have not been through `checkPublishRequirements`, and a bulk import that pushed 300 listings to the public site and the portal feeds is not undoable.

## 11. Integrity checks

| Key | Watches |
|---|---|
| `realestate.rent_charge_status_drift` | An invoiced rent charge whose stored status disagrees with the ledger-derived settlement. Autoheals by restamping the cache from the derivation — never the other way round. |
| `realestate.rent_never_invoiced` | The **output** of `real-estate-rent-invoicing`: a charge more than 2 days past due, on an active tenancy with a tenant, still carrying no `invoice_id`. The cron drafts these unconditionally, so this means it is not landing — and `cron.job_run_details` reports success either way. |
| `realestate.commission_over_allocated` | Splits on a completed sale summing beyond `commission_base`. Not a display bug — the brokerage has promised out more than it earned. No autoheal: which split is wrong is a business decision. |

The generic `ops.silent_zero` probes already cover these crons for "fires but never succeeds"; these two watch the work itself.
