# Professional Marketplace

The platform includes a public marketplace where professionals (architects, designers, consultants, etc.) can publish profiles, list services, display skills, and be discovered by others.

---

## Routes

| Route | Component | Access |
|-------|-----------|--------|
| `/discover` | `DiscoverPage` | All authenticated users |
| `/u/:userId` | `PublicProfilePage` | Public (unauthenticated too) |

---

## Profile Visibility

Profiles are opt-in public. The `user_profiles.is_public` boolean controls visibility:

- `is_public = false` (default) — profile is private, not listed in `/discover`, `/u/:id` returns "not found"
- `is_public = true` — profile appears in directory and public profile page is accessible

Users toggle this in their profile settings (`ProfileTab`).

---

## Profile Fields

Stored in `user_profiles` table:

| Field | Type | Description |
|-------|------|-------------|
| `full_name` | varchar | Display name |
| `company` | text | Company or studio name |
| `bio` | text | Short personal/professional description |
| `avatar_url` | text | Profile photo URL |
| `location` | text | City, country, or region |
| `website_url` | text | External website link |
| `professional_type` | enum | Role classification (see below) |
| `is_public` | boolean | Controls public visibility |
| `services` | text[] | Legacy simple service name list |
| `services_detail` | jsonb | Rich service objects (preferred, see below) |
| `skill_tags` | text[] | Free-form skill/expertise tags |
| `featured_moodboard_id` | uuid | FK to `moodboards` — pinned to profile top |
| `profile_views` | integer | Incremented on each public profile view via `increment_profile_views()` RPC |

> `preferred_factories` (jsonb `[{name, country?}]`) was **dropped** on 2026-08-22. Brand
> relationships live in `profile_ambassadorships` — see **Brand Ambassadorships** below.

### Professional Types (enum)

```
designer | interior_designer | architect | manufacturer |
brand | supplier | sourcing_agent | consultant | other
```

---

## Brand Ambassadorships

Table: **`profile_ambassadorships`** (Profile -> **Ambassador** tab). One row per (person, brand),
unique on `(user_id, lower(btrim(brand_name)))`.

A professional does not merely "prefer" a brand - they represent it, and they represent it *for
something*. The category is what a visitor is actually asking about ("who do you use for
sanitary?"), so it is part of the relationship rather than a tag on the person.

**Nobody approves an ambassadorship.** Being on the platform's supplier list is the whole
condition: pick a brand, choose the categories, and it is live on the public profile. A short-lived
confirm/decline design was removed on 2026-08-22 - it hung off `user_profiles.factory_verified`,
which #350 established no account has ever held.

| Field | Type | Description |
|-------|------|-------------|
| `brand_name` / `brand_source` | text | The brand; `supplier` (from `platform_suppliers`), `catalog` (a name the product catalog knows) or `manual` (typed) |
| `platform_supplier_id` | uuid | The `platform_suppliers` row this brand IS, when picked off the list. This is what makes the supplier's own view an id join rather than a name comparison |
| `category_keys` | text[] | `material_categories.category_key` values - validated and re-ordered into registry order by a trigger |
| `relationship` | text | `ambassador` \| `authorized_dealer` \| `certified_installer` \| `specifier` |
| `headline`, `since_year`, `brand_url`, `brand_country` | - | What the public profile shows. `brand_url` is https-only (CHECK) |
| `showcase_moodboard_id` | uuid | The person's own work with the brand; the link renders only if that moodboard is public |
| `is_featured`, `sort_order` | - | Lead brands and ordering on the public profile |

### The two sides

- **The professional** manages entries in Profile -> Ambassador. `search_platform_brands(q, limit)`
  serves the list; it is SECURITY DEFINER over `platform_suppliers` (an operator-owned registry) and
  returns business-identity fields only - never the VAT number or contact email. A name that is not
  on the list can still be used; it simply carries no `platform_supplier_id`, so it never reaches a
  brand.
- **The brand** is read from two directions, by one component (`BrandAmbassadorsPanel`), because
  both surfaces already existed:
  - **CRM company -> Market -> Demand** (`mode="company"`), which is where per-supplier analytics
    live (#350). `list_brand_ambassadors_for_company(workspace_id, company_id)` matches a company
    to ambassadorships three ways, since a brand is named three different ways here: the company's
    VAT -> `platform_suppliers` -> `platform_supplier_id`; the brand names on products already
    stamped `brand_company_id`; and the company's own name.
  - **Supplier Portal** (`mode="supplier"`), where a workspace that CLAIMED its own supplier
    identity sees its own numbers. `list_supplier_brand_ambassadors(workspace_id)` is limited to
    suppliers with `claimed_workspace_id = <this workspace>` and no revoked claim.

  Both assert workspace membership from the JWT and return PUBLIC profiles only - a private
  profile is not promoting anything yet.
- `get_brand_category_coverage(brands[])` is SECURITY **INVOKER**, so it reports the categories a
  brand has products in *within the catalogs the caller can already read*. Advisory only.

Guarded by [tests/unit/ambassadorships.test.ts](../tests/unit/ambassadorships.test.ts).

---

## Services

**A profile service IS a Finance service.** There is ONE store: `products` rows with
`item_type='service'` (priced in `product_prices`, myDATA-classified on the product — the rows the
invoice and quote pickers read). A member "lists" one on their public profile by pointing at it:
`products.profile_user_id` (CHECK: only a service may be listed). Until 2026-09-05 there were two
stores — this one, and a jsonb blob on `user_profiles` (`services_detail`, free-text price) that
fed the profile and the Hire form and that no invoice could ever read. The blob is dropped.

| Where | Reads | Writes |
|---|---|---|
| Profile → Services (`ProfileTab`) | `get_public_profile_services(user_id)` — own rows, public or not | `upsert_profile_service` (create / edit one I list), `set_profile_service_listing` (list an existing Finance service / take mine off) |
| Public profile (`PublicProfilePage`, Discover `ProfileModal`) | `get_public_profile_services(user_id)` — only while `is_public` | — |
| Finance → Settings → Services (`ServicesCard`) | `servicesService.list(workspace)` — every service of the workspace, with an "On your profile" tag | direct RLS writes (admin/owner) + the same listing RPC |

- The RPCs are `SECURITY DEFINER` because a profile owner is often a plain member and `products`
  UPDATE/DELETE RLS is admin/owner only. They bind to the caller: you may edit or unlist only what
  YOU list (or be a finance manager). "Remove from profile" unlists — it never deletes the
  product, because "not on my profile" and "not sellable" are different facts.
- `user_profiles.services` (text[]) — what Discover searches and tags by — is a **trigger-derived
  cache** (`tg_products_sync_profile_services`). Nothing writes it by hand.
- **Price is a number, net of VAT, or NULL = "on request".** A priced service can be hired and
  paid straight from the profile; an unpriced one turns the hire into an enquiry. VAT category
  and myDATA income classification are set under Finance → Settings → Services; a service created
  from the profile takes the workspace defaults.
- `previous_work` (`[{title, url?}]`) lives in `products.metadata` — marketing content beside
  `unit`. A Finance edit merges metadata rather than replacing it, so it survives.

`servicesService.ts` is the one client (`ProfileService` is the public shape; `ServiceItem` in
`ProfileTab` is a re-export of it for the surfaces that already imported that name). Guarded by
[tests/unit/profileServicesSingleSource.test.ts](../tests/unit/profileServicesSingleSource.test.ts).

Each service card on the public profile shows name, the price badge (or "On request"), description
and previous work (collapsible), and a **Hire** button → `HireMeModal`.

---

## Hire Me Flow

Visitors can contact a professional directly from their public profile.

### How it works

1. Visitor clicks **Hire Me** (global) or **Hire** on a specific service card
2. `HireMeModal` opens with optional service pre-selected; each service shows its net price + VAT
   or "Price on request"; a **buying as a business** switch takes company name + VAT number
3. Visitor fills in name, email, message, and optionally selects services
4. On submit: POSTs `action: 'profile_contact'` to the `inbox-api` edge function — never a direct
   client write. The modal renders on a page with no auth gate, so a browser-side insert fails for
   exactly the audience the form exists for. The function is Turnstile-gated and rate-limited
   (3 per sender / 10 min, 20 per recipient / hour), and both guards run BEFORE the bot check so a
   malformed or flooding request never burns a Turnstile verification.
5. **If every picked service is priced, the hire is an ORDER.** `create_service_order_from_profile`
   (one SQL transaction, service-role only) opens a `sales` order in `draft` with one line per
   service (VAT rate from the mirrored `vatVocabulary`, category from the product) and creates the
   draft **pre-invoice** through `_generate_invoice_from_order_core` — the same order→invoice writer
   the quote path and the Orders hub use, which derives the document type from the buyer and the
   lines (`2.1` service invoice to a company / VAT-holder, `11.2` retail services receipt otherwise)
   and refuses an unjustified 0% line. The pre-invoice is born with a `pay_token`; the visitor gets
   the `/pay/:token` link back in the response ("Pay now"), the message body carries it, the thread
   holds it as `metadata.hire_order` (rendered in the Inbox rail), and `hire_me_received` carries
   `order_id` / `pay_url`. Only services the PROFILE OWNER lists can be ordered — the ids are
   resolved against `products.profile_user_id`, never trusted.
   - A business buyer (VAT number given) is matched to a `crm_companies` row by normalised VAT or
     created, the contact linked to it, and the company is the invoice's counterparty.
   - Anything else — an "on request" service, no CRM contact, the writer refusing — files as a
     plain enquiry; the refusal is logged, never shown.
6. **When the pre-invoice is paid online in full, it is issued automatically.** The provider-neutral
   payment path (`_shared/payments/record-payment.ts`, all of Stripe / Viva / Revolut) calls
   `issue_invoice_on_online_payment` BEFORE allocating the payment: it re-derives the document type
   (a business gets an invoice, a consumer a retail receipt — also correcting the storefront's
   hard-coded `11.1`), stamps the myDATA payment method by name, numbers the document through
   `_mark_invoice_issued_core`, fires `invoice_issued`/`receipt_issued`, and transmits to myDATA
   through `finance-issue-invoice` (which reserves the workspace's transmission credits). A deposit
   leaves the pre-invoice a draft. `finance.paid_draft_never_issued` (nightly integrity probe) names
   any draft that reached `paid` without an issue date.

### Where the enquiry lands: the unified Inbox

There is **no `profile_contact_requests` table** (dropped 2026-08-23). An enquiry is an ordinary
`inbox_threads` row, so it gets everything the Inbox has — a reply that reaches the sender, their
reply threading back, assignment, labels, archive, search, AI draft, and a CRM contact for the lead.

| Field | Value |
|---|---|
| `thread_type` | `customer` |
| `channel` | `email` — the transport a reply goes out on |
| `metadata.source` | **`public_profile`** — the tag, and the one thing the channel cannot tell you |
| `metadata.profile_user_id` | the profile owner; also the `owner` member participant |
| `metadata.email_to` / `email_from` | the owner's inbound address / the visitor's — what the email relay needs |
| `metadata.services_requested` | the services ticked on the form (rendered in the thread details) |
| `agent_state` | `'off'`, deliberately — see below |

- **Workspace** — `user_email_addresses.workspace_id` when the owner has an inbound address, else
  the workspace they own/administer, else any active membership. Mail to their address and a
  message through their profile are the same person being reached, so they must not split.
- **The inbound address is allocated on demand.** Without a real mailbox on both ends the email
  relay in `insertMessageAndNotify` silently skips: the member would see their own reply and the
  sender would receive nothing.
- **The assistant does NOT auto-engage**, unlike every other inbound channel. "Hire me" is
  addressed to a person by someone who picked them off their profile; an instant AI answer is the
  one reply that loses the job. The Bot toggle hands it over when the member wants that.
- **A repeat enquiry from the same sender continues the open thread** (30-day window) rather than
  stacking near-identical threads on a member who has answered none of them.

The source tag is derived in one place — [`src/pages/Inbox/inboxSource.ts`](../src/pages/Inbox/inboxSource.ts),
guarded by [tests/unit/inboxSource.test.ts](../tests/unit/inboxSource.test.ts). `/profile?tab=inbox`
(the old separate screen) redirects to that Inbox with the Source filter pre-set.

### Flow Event

Emits `hire_me_received` — the seeded, locked `Hire Me → Notify Recipient` flow owns delivery, so
an admin can retarget it without a deploy. `action_url` is `/inbox?thread=<id>`: the bell opens the
conversation itself.

---

## Discover Directory (`/discover`)

Lists all public profiles ordered by `profile_views DESC`, limit 60.

### Features

- **Search** — filters by name, company, bio, services, skill tags, location (client-side)
- **Tag filters** — dynamically built from all professional types + services + skill tags across listed profiles (up to 24 tags). Click to filter by tag.
- **Creator cards** — show avatar, name, professional type badge, company, location, bio snippet, up to 3 services, follower count, website link, and a Follow button
- **Follow** — `user_follows` table, `FollowButton` component

### Data fetched

```sql
SELECT user_id, full_name, company, bio, avatar_url, location,
       website_url, services, skill_tags, profile_views, professional_type
FROM user_profiles
WHERE is_public = true
ORDER BY profile_views DESC
LIMIT 60
```

Follower counts are fetched in a second query and merged client-side.

---

## Public Profile Page (`/u/:userId`)

Full profile view for a single user.

### Sections (in order)

1. **Header** — avatar, name, professional type badge, company, location, follower count, website, bio, Follow + Hire Me buttons
2. **Skills & Expertise** — skill tags as badges
3. **Services** — rich service cards with Hire button per service
4. **Featured Board** — pinned moodboard with image preview and comments
5. **Preferred Factories** — factory name + country grid
6. **Moodboards** — all other public moodboards with image previews and comments

### Social

- **Follow/Unfollow** — `FollowButton` component, stored in `user_follows`
- **Moodboard comments** — `MoodboardComments` component inline on each board
- **Profile views** — auto-incremented on every page load via `increment_profile_views(p_user_id)` RPC (fire-and-forget)

---

## Flow Triggers Related to Profiles

| Event | When |
|-------|------|
| `hire_me_received` | Hire Me form submitted |
| `profile_followed` | A user follows a public profile |
| `profile_published` | User makes their profile public |
| `preferred_factory_added` | User adds a brand to their profile (Ambassador tab) |

These can be used in the Flow Builder to trigger automated actions (emails, notifications, etc.).

---

## Key Components

| Component | Path |
|-----------|------|
| Profile editing | [src/components/core/Profile/ProfileTab.tsx](../src/components/core/Profile/ProfileTab.tsx) |
| Public profile page | [src/pages/PublicProfilePage.tsx](../src/pages/PublicProfilePage.tsx) |
| Discover directory | [src/pages/DiscoverPage.tsx](../src/pages/DiscoverPage.tsx) |
| Hire Me modal | [src/components/core/Profile/HireMeModal.tsx](../src/components/core/Profile/HireMeModal.tsx) |
| Follow button | [src/components/features/social/FollowButton.tsx](../src/components/features/social/FollowButton.tsx) |
| Moodboard comments | [src/components/features/social/MoodboardComments.tsx](../src/components/features/social/MoodboardComments.tsx) |
| Reviews display | [src/components/features/profile/ReviewsSection.tsx](../src/components/features/profile/ReviewsSection.tsx) |
| Review modal | [src/components/features/profile/ReviewModal.tsx](../src/components/features/profile/ReviewModal.tsx) |
| Booking widget (public) | [src/components/features/profile/BookingWidget.tsx](../src/components/features/profile/BookingWidget.tsx) |
| Booking modal | [src/components/features/profile/BookingModal.tsx](../src/components/features/profile/BookingModal.tsx) |
| Appointments dashboard | [src/pages/AppointmentsPage.tsx](../src/pages/AppointmentsPage.tsx) |

---

## Ratings & Reviews

### DB Tables
- `profile_reviews` — one review per reviewer per professional. Columns: `to_user_id`, `from_user_id`, `overall_rating` (1–5), `dimension_ratings` JSONB (`communication`, `expertise`, `timeliness`, `value`), `comment`, `service_name`, `reply` (professional's reply), `is_verified`.
- `review_summaries` — cached AI-generated summary per professional (`summary_text`, `last_computed_at`).

### Public profile
Displays: aggregate score card, AI summary, per-dimension stars, individual reviews, reply thread. Authenticated users (not the owner) see "Write a Review" button.

---

## Appointment Booking

### DB Tables
- `appointment_availability` — availability for one CALENDAR DATE, not a weekly pattern. Columns: `user_id`, `available_date` (date), `time_ranges` (jsonb `[{start,end}]`). There is no `day_of_week`, no `slots`, no `timezone` and no `is_active` — the toggle is `user_profiles.booking_enabled`.
- `appointments` — bookings. Columns: `professional_user_id`, `client_*`, `appointment_date`, `appointment_time`, `status` (pending/confirmed/cancelled/completed), `notes`, `inbox_conversation_id`, plus the single-subject link (`project_id` / `deal_id` / `property_id` / `order_id`, at most one, enforced by `appointments_single_subject_ck`).

### Where it lives: Profile → Schedule

Availability, the bookings it produces and your CRM calendar are one tab with a side rail
(`SchedulePanel`), addressed by `?section=`. They used to be three separate places — availability
was a card partway down the Profile tab, Appointments and Calendar were tabs of their own — which
meant "why has nobody booked me?" took three tabs to answer.

| Section | URL | Component | Shows |
|---|---|---|---|
| Appointments (default) | `/profile?tab=schedule&section=appointments` | `AppointmentsPage` | Bookings clients made from your public profile |
| Availability | `/profile?tab=schedule&section=availability` | `AvailabilitySettings` | The dates and hours you publish |
| Calendar | `/profile?tab=schedule&section=calendar` | `ProfileMeetingsTab` | `crm_meetings` you logged against a party |

There is **no `/appointments` route** — `AppointmentsPage` renders only inside that rail. The
retired `?tab=appointments` and `?tab=calendar` redirect (`RETIRED_TABS` in `UserProfilePage`), so
stored notification `action_url`s and bookmarks keep working. `?section=` ids are pinned by
[tests/unit/profileSectionLinks.test.ts](../tests/unit/profileSectionLinks.test.ts).

### Flow Events
| Event | When |
|-------|------|
| `appointment_booked` | Client submits booking |
| `appointment_confirmed` | Professional confirms |
| `appointment_cancelled` | Either party cancels |
| `appointment_moved_to_inbox` | Professional clicks "Email Client" |

### Inbox Bridge
"Email Client" in `AppointmentDetailDrawer` creates a new `agent_chat_conversations` row (`agent_id='kai'`) pre-seeded with appointment context, saves the `conversation_id` back to `appointments.inbox_conversation_id`, then navigates to `/agent-hub?conversation=<id>`.
