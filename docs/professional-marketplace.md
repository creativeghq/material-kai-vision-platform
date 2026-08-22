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
- **The supplier** sees who promotes it in the **Supplier Portal**
  (`SupplierAmbassadorsPanel`), via `list_supplier_brand_ambassadors(workspace_id)` - membership
  asserted from the JWT, rows limited to suppliers this workspace has CLAIMED
  (`platform_suppliers.claimed_workspace_id`, claim not revoked), and to PUBLIC profiles, because a
  private profile is not promoting anything yet. The join is
  `platform_supplier_id = ps.id OR lower(btrim(brand_name)) = lower(btrim(ps.legal_name))`, so a
  typed name that happens to be the company's legal name still counts.
- `get_brand_category_coverage(brands[])` is SECURITY **INVOKER**, so it reports the categories a
  brand has products in *within the catalogs the caller can already read*. Advisory only.

Guarded by [tests/unit/ambassadorships.test.ts](../tests/unit/ambassadorships.test.ts).

---

## Services

Services are stored in two columns for backwards compatibility:

- `services` (text[]) — legacy, name-only list
- `services_detail` (jsonb) — rich objects, preferred when available

### ServiceItem structure

```typescript
interface ServiceItem {
  id: string;
  name: string;
  description?: string;
  price?: string;
  previous_work?: { title: string; url?: string }[];
}
```

On the public profile, if `services_detail` is populated it takes precedence over `services`. Each service card has:
- Name + optional price badge
- Description (collapsible)
- Previous work links (collapsible)
- **Hire** button → opens `HireMeModal`

---

## Hire Me Flow

Visitors can contact a professional directly from their public profile.

### How it works

1. Visitor clicks **Hire Me** (global) or **Hire** on a specific service card
2. `HireMeModal` opens with optional service pre-selected
3. Visitor fills in name, email, message, and optionally selects services
4. On submit: inserts a row into `profile_contact_requests` and emits a `hire_me_received` flow event

### DB Table: `profile_contact_requests`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `to_user_id` | uuid | FK to `user_profiles.user_id` |
| `from_name` | text | Requester's name |
| `from_email` | text | Requester's email |
| `message` | text | Message body |
| `services_requested` | text[] | Selected service names (nullable) |
| `created_at` | timestamptz | Auto |

### Flow Event

Emits `hire_me_received` via `flowEventService` — can be used to trigger automated flows (e.g., email notification to the professional).

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
- `appointment_availability` — per-user per-day availability. Columns: `day_of_week` (0–6), `slots` (text[]), `timezone`, `is_active`.
- `appointments` — bookings. Columns: `professional_user_id`, `client_*`, `appointment_date`, `appointment_time`, `status` (pending/confirmed/cancelled/completed), `notes`, `inbox_conversation_id`.

### Routes
| Route | Component | Access |
|-------|-----------|--------|
| `/appointments` | `AppointmentsPage` | Authenticated (own appointments only) |

### Flow Events
| Event | When |
|-------|------|
| `appointment_booked` | Client submits booking |
| `appointment_confirmed` | Professional confirms |
| `appointment_cancelled` | Either party cancels |
| `appointment_moved_to_inbox` | Professional clicks "Email Client" |

### Inbox Bridge
"Email Client" in `AppointmentDetailDrawer` creates a new `agent_chat_conversations` row (`agent_id='kai'`) pre-seeded with appointment context, saves the `conversation_id` back to `appointments.inbox_conversation_id`, then navigates to `/agent-hub?conversation=<id>`.
