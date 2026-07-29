# Real Estate API (edge functions)

Reference for the Real Estate module (#249, sub-modules #281). The module is split across **five** edge functions on purpose — the authenticated surface and the anonymous surface never share a function, so there is no code path where a missing auth check on a public action exposes an authed one.

| Function | Auth | Purpose |
|---|---|---|
| [`real-estate-api`](../../supabase/functions/real-estate-api/index.ts) | Supabase session JWT | Everything an agent/broker does: listings, leads, viewings, offers, sales, lettings, investments, deals. |
| [`real-estate-public`](../../supabase/functions/real-estate-public/index.ts) | Opaque token / anonymous | Public listing page `/p/:token`, buyer portal `/buyer/:token`, cross-workspace discovery, lead capture. |
| [`real-estate-feed`](../../supabase/functions/real-estate-feed/index.ts) | Feed token | Tokenized XML syndication feed (Kyero / OpenImmo / generic) pulled by property portals. |
| [`real-estate-buyer-digests`](../../supabase/functions/real-estate-buyer-digests/index.ts) | `x-cron-secret` | Daily saved-search digest email to buyers. |
| [`real-estate-rent-invoicing`](../../supabase/functions/real-estate-rent-invoicing/index.ts) | `x-cron-secret` | Daily draft-invoice run for rent charges coming due. |

Shared helpers: [`_shared/real-estate.ts`](../../supabase/functions/_shared/real-estate.ts) (`toPublic`, `matchesCriteria`, `estimateFromMedianPerSqm`, `createRentInvoiceForCharge`) and [`real-estate-api/rbac.ts`](../../supabase/functions/real-estate-api/rbac.ts) (`resolveRealEstateAccess`, `PROPERTY_WRITABLE`). Client: [`src/modules/real-estate`](../../src/modules/real-estate).

---

## 1. `real-estate-api` — the authenticated surface

```http
POST /functions/v1/real-estate-api
Authorization: Bearer <supabase_access_token>
Content-Type: application/json

{ "action": "<action>", "workspace_id": "<uuid>", ...params }
```

`action` and `workspace_id` are always required (missing either → `400`). Error shape is `{ "error": "message" }`.

### Gate chain

Every request runs the same chain before dispatch. `authenticate()` returns a **service-role** client (RLS bypassed), so each gate is re-derived from the verified JWT and the body is never trusted for identity:

1. **`authenticate(req, { requireUser: true })`** → `401`.
2. **`userCanAccessWorkspace(supabase, userId, workspace_id)`** → **`404` "not found"** on mismatch (not `403` — workspace ids must not be enumerable).
3. **`isModuleEnabled('real-estate')`** → `404` "Real Estate module is not available" when the platform switch is off.
4. **`assertEntitled(workspace_id, 'real-estate')`** → **`402`** upsell response when the workspace hasn't bought the module.
5. **RBAC** via `resolveRealEstateAccess` → `403` when `canView` is false.
6. **Sub-module entitlement** for the two add-on action sets (below) → `402`.

### Personas

| Persona | Who | `canView` | `canManage` | Sees |
|---|---|---|---|---|
| **Operator** | global `admin` / `super_admin` | ✅ | ✅ | Everything (`isBroker`). |
| **Broker** | workspace `owner` / `admin` | ✅ | ✅ | Every listing + every lead in the workspace. |
| **Agent** | workspace role `realestate_agent` | ✅ | ✅ | Own listings + listings flagged `open_for_all` (view-only) + own leads. |
| **Member** | any other active member | ✅ | ❌ | Reads the shared listing book; every write returns `403`. |

**Ownership → 404, not 403.** An agent asking for a listing they don't own and that isn't `open_for_all` gets `404 not found`, identical to a listing that doesn't exist. Attempting to *edit* a visible-but-not-owned listing is the one case that returns `403 "This listing belongs to another agent."` — by then the id is already known to the caller, so there is nothing left to leak.

**Write allowlist (anti-BOPLA).** Listing writes are filtered through `PROPERTY_WRITABLE`. `id`, `workspace_id`, `created_by`, timestamps, `view_count`, `public_listing_token`, `published_at`, `price_per_sqm`, `days_on_market` and the text embedding are **server-set only** and silently dropped from any request body.

### Sub-module add-ons

Two action sets sit behind their own entitlement on top of `real-estate`:

| Add-on entitlement | Actions |
|---|---|
| `real-estate-management` | `list-tenancies`, `upsert-tenancy`, `renew-tenancy`, `delete-tenancy`, `list-rent-charges`, `generate-rent-schedule`, `mark-rent-paid`, `invoice-rent-charge`, `list-maintenance`, `upsert-maintenance`, `delete-maintenance`, `landlord-statement` |
| `real-estate-investments` | `list-investments`, `get-investment`, `upsert-investment`, `delete-investment` |

Calling one without the add-on returns `402` with the standard upsell body. The operator's root workspace is entitled to everything.

### Actions

Legend — **M** = requires `canManage`; **PM** = also requires the `real-estate-management` add-on; **IN** = also requires `real-estate-investments`; 💳 = credit-metered (can return `402 insufficient_credits`).

#### Listings

| Action | Params (required **bold**) | Auth | Description |
|---|---|---|---|
| `ping` | — | view | Connectivity probe; echoes the resolved `access` flags. Useful for rendering the right persona UI. |
| `dashboard` | — | view | Counts by listing status, pipeline value, recent inquiries and viewings. |
| `list-properties` | `status?`, `limit?` | view | Listings visible to the caller (agent scoping applied). |
| `get-property` | **`property_id`** | view | One listing. `404` when not visible. |
| `create-property` | **`property`** | M | `workspace_id`, `created_by` and `listing_agent_id` are set server-side. |
| `update-property` | **`property_id`**, **`patch`** | M | Allow-listed fields only. |
| `delete-property` | **`property_id`** | M | Cascades to photos, viewings, offers and interest rows. |
| `publish-property` | **`property_id`**, `in_discovery?` | M | Sets `listing_status=active`, mints/keeps `public_listing_token` (the `/p/:token` capability). `in_discovery` additionally opts the listing into cross-workspace discovery **and** the syndication feed. |
| `unpublish-property` | **`property_id`** | M | Withdraws from the public page, discovery and the feed in one step. |
| `draft-description` 💳 | **`property_id`**, `tone?` | M | AI-drafts listing copy from the structured fields. |

#### Photos

| Action | Params | Auth | Description |
|---|---|---|---|
| `photo-upload-url` | **`property_id`**, **`filename`** | M | Signed upload URL. |
| `add-photo` | **`property_id`**, **`storage_path`** | M | Register the uploaded object against the listing. |
| `analyze-photos` 💳 | **`property_id`** | M | Claude-vision pass: room labels, condition, feature hints. |
| `delete-photo` | **`photo_id`** | M | |
| `set-cover` | **`photo_id`** | M | |
| `reorder-photos` | **`property_id`**, **`ordered_ids`** | M | |

#### Leads, viewings, offers, sales

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-inquiries` | `property_id?` | view | Agents see their own leads; brokers see all. |
| `create-inquiry` | **`inquiry`** | M | Log an off-platform lead (walk-in, phone, portal). |
| `update-inquiry` | **`inquiry_id`**, **`patch`** | M | Status / owner / notes. |
| `convert-inquiry` | **`inquiry_id`** | M | Promote to a `crm_contacts` record (optionally a buyer requirement). |
| `delete-inquiry` | **`inquiry_id`** | M | |
| `list-viewings` | `property_id?` | view | |
| `create-viewing` | **`viewing`** | M | Schedules and notifies attendees. |
| `update-viewing` | **`viewing_id`**, **`patch`** | M | Reschedule or record outcome/feedback. |
| `delete-viewing` | **`viewing_id`** | M | |
| `add-interest` | **`property_id`**, **`contact_id`** | M | Flags interest; feeds buyer matching. |
| `list-offers` | `property_id?` | view | |
| `create-offer` | **`offer`** | M | |
| `update-offer` | **`offer_id`**, **`patch`** | M | |
| `accept-offer` | **`offer_id`** | M | Moves the listing under-offer and rejects competing offers. |
| `delete-offer` | **`offer_id`** | M | |
| `complete-sale` | **`property_id`**, **`sale`** | M | Writes `property_sales`, records commission, marks the listing sold. |
| `list-sales` | — | view | Completed sales + commission totals. |
| `link-sale-invoice` | **`sale_id`**, **`invoice_id`** | M | Ties a Finance invoice to the sale (commission invoicing). |
| `delete-sale` | **`sale_id`** | M | |

#### Contacts, buyers and matching

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-sellers` | — | view | Vendor contacts with their instructed listings. |
| `contact-properties` | **`contact_id`** | view | Every listing a contact touches — seller, buyer, tenant, enquirer. |
| `list-buyer-requirements` | — | view | Saved buyer search profiles. |
| `upsert-buyer-requirement` | **`requirement`** | M | Includes the `/buyer/:token` portal and the daily-digest opt-in. |
| `delete-buyer-requirement` | **`requirement_id`** | M | |
| `match-buyer-requirement` | **`requirement_id`** | view | Requirement → ranked live listings. |
| `buyers-for-property` | **`property_id`** | view | Reverse match: which saved requirements this listing satisfies. |
| `get-contact-ext` / `upsert-contact-ext` / `delete-contact-ext` | **`contact_id`** (+ `patch`) | view / M / M | The real-estate extension record on a CRM contact. |
| `cma-report` | `property_id?`, `criteria?` | view | Comparative market analysis — comparables + a per-m² estimate. |

#### Syndication settings

| Action | Params | Auth | Description |
|---|---|---|---|
| `get-feed-settings` | — | view | Format, enabled flag, tokenized feed URL. |
| `update-feed-settings` | **`patch`** | M | `feed_enabled`, `feed_format`. |
| `rotate-feed-token` | — | M | **Instantly revokes every portal holding the old URL.** There is no grace period by design. |

#### Deals pipeline

`list-deals`, `upsert-deal`, `delete-deal`, `list-deal-tasks`, `add-deal-task`, `toggle-deal-task`, `delete-deal-task` — the module's own kanban pipeline with a per-deal task checklist. All writes require `canManage`.

#### Lettings — add-on `real-estate-management`

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-tenancies` | `property_id?` | PM | |
| `upsert-tenancy` | **`tenancy`** | PM + M | Tenant, term, rent, deposit. |
| `renew-tenancy` | **`tenancy_id`**, **`patch`** | PM + M | New term, optionally re-based rent. |
| `delete-tenancy` | **`tenancy_id`** | PM + M | |
| `list-rent-charges` | `tenancy_id?` | PM | Schedule with paid / due / overdue state. |
| `generate-rent-schedule` | **`tenancy_id`** | PM + M | Materialises the recurring charges for the term. |
| `mark-rent-paid` | **`charge_id`** | PM + M | |
| `invoice-rent-charge` | **`charge_id`** | PM + M | Manual twin of the nightly `real-estate-rent-invoicing` cron. |
| `list-maintenance` | `property_id?` | PM | |
| `upsert-maintenance` | **`job`** | PM + M | |
| `delete-maintenance` | **`maintenance_id`** | PM + M | |
| `landlord-statement` | **`property_id`**, `from?`, `to?` | PM | Rent collected, fees, maintenance, net due for the period. |

#### Investments — add-on `real-estate-investments`

`list-investments`, `get-investment`, `upsert-investment`, `delete-investment` — purchase price, costs, financing and projected yield / ROI per case.

---

## 2. `real-estate-public` — anonymous surface

```http
POST /functions/v1/real-estate-public
Content-Type: application/json

{ "action": "<action>", ...params }
```

No `Authorization` header. Security model:

- Service-role client, but **every read is bound to an opaque capability token** (`public_listing_token`, buyer `portal_token`, or a public agency slug). There is no id-addressable public read, so listing ids are not an attack surface.
- A listing resolves only when it is `is_public` **and** `listing_status='active'`. Anything else `404`s — including a listing that exists but was unpublished a minute ago.
- Responses are the **`toPublic()` projection only**. Internal pricing (`cost_basis`, `min_offer`, `commission_pct`, `previous_price`), compliance ids (`electronic_building_id`, `atak`), vendor/lead links and agent-internal fields never leave the function. When `hide_exact_address` is set, `address`, `street_number`, `postcode`, `lat` and `lng` are nulled — not merely hidden in the UI.
- Output is **JSON**; the React page renders it. No HTML-string assembly, no `dangerouslySetInnerHTML` (platform invariant #11).
- Lead writes require `gdpr_consent: true`, derive `property_id` + `workspace_id` **from the token** (the client cannot supply either), and are written server-side — there is no anon RLS insert path.
- **Rate limit:** 8 lead submissions per hour per IP, across all lead-writing actions → `429`. The IP is SHA-256 hashed before storage; the raw address is never persisted. A failure inside the throttle bookkeeping never blocks a legitimate submission (fail-open on the *counter*, not on the auth).

| Action | Params (required **bold**) | Description |
|---|---|---|
| `get` | **`token`** | Resolve a listing token → the public listing payload behind `/p/:token`. |
| `inquire` | **`token`**, **`name`**, **`email`**, **`gdpr_consent`**, `phone?`, `message?` | Anonymous lead capture. Rate-limited. |
| `discover` | `filters?`, `limit?` | Cross-workspace discovery — only listings explicitly opted in with `in_discovery=true`. |
| `agency-listings` | **`workspace_slug`**, `filters?` | Public listing wall for one agency. |
| `buyer-portal` | **`token`** | Buyer's matched listings, favourites and requirement summary (`/buyer/:token`). |
| `buyer-favorite` | **`token`**, **`property_id`** | Toggle a favourite from the portal. |
| `buyer-request-viewing` | **`token`**, **`property_id`**, `preferred_at?` | Buyer-initiated viewing request. Rate-limited. |
| `request-valuation` | **`workspace_slug`**, **`address`**, **`email`**, **`gdpr_consent`**, `size_sqm?` | "What's my property worth" lead. Returns a per-m² median estimate (`estimateFromMedianPerSqm`) and files the lead. Rate-limited. |

---

## 3. `real-estate-feed` — portal syndication

```http
GET /functions/v1/real-estate-feed?token=<feed_token>&format=kyero
```

`POST` with `{ token, format }` in the body is also accepted for portals that can't send query params. Response is `application/xml`.

| Param | Values | Notes |
|---|---|---|
| `token` | opaque | **Required.** The workspace `feed_token`. Rotate from `real-estate-api → rotate-feed-token`. |
| `format` | `kyero` \| `openimmo` \| `generic` | Defaults to `real_estate_settings.feed_format`, then `kyero`. |

**What appears in the feed.** Only listings that are `is_public` **and** `listing_status='active'` **and** `in_discovery=true`. That third condition is the one that matters: a listing published to the agency's own website but not opted into external distribution must never reach a third-party portal, and `unpublish` clears `in_discovery` so pulled listings drop out on the next fetch. Values are the `toPublic()` projection, XML-escaped.

A missing, unknown or disabled token returns a `404` XML error document — it does not distinguish "wrong token" from "feed disabled".

---

## 4. Crons

Both use the shared cron gate (`isCronAuthorized`: `x-cron-secret` **or** a service-role bearer) and fail closed.

### `real-estate-buyer-digests` (daily)

For every active buyer requirement with `digest_enabled`, a `portal_token` and a contact email: find listings that match the saved criteria (`matchesCriteria`) **and** were published since `last_digest_at`, email a summary linking to `/buyer/:token`, then stamp `last_digest_at` so the same listing never re-sends. A buyer with nothing new is skipped silently — no empty digests.

### `real-estate-rent-invoicing` (daily)

For every `due`/`overdue` rent charge on an active tenancy with a tenant, falling due within the next **7 days** and not yet invoiced (`invoice_id IS NULL`): create a **draft** Finance invoice to the tenant via `createRentInvoiceForCharge` and link it back on the charge. Batched at 500 charges per run.

Drafts are deliberately **never transmitted to myDATA**. The property manager reviews VAT treatment and document type and issues them from Finance — automatic rent invoicing must not automatically become an irrevocable fiscal transmission.

---

## Related

- [`docs/api/crm-api.md`](crm-api.md) — contacts/companies the module hangs off, plus `crm-lead-score` (the canonical lead scorer shared by CRM, Sales and Real Estate).
- [`docs/api/finance-api.md`](finance-api.md) — the invoices that rent charges and sale commissions become.
- [`public/api/openapi-edge.json`](../../public/api/openapi-edge.json) — machine-readable spec (tag **Real Estate**); browse it at [`/api/edge-swagger.html`](../../public/api/edge-swagger.html).
