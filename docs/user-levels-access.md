# User Levels & Access Control

Reference document for all user roles on the Material KAI Vision Platform, how they are determined, and what each level can access.

---

## Platform Roles

The `public.roles` table currently has **4 rows** (the `manager` role was removed 2026-05-23 — collapsed into admin):

| Level | Name | Description |
|---|---|---|
| 1 | `user` | Default for every signup. Basic access — view materials, create moodboards, view own profile. |
| 2 | `dealer` | View materials, manage orders, limited inventory access, manage customer contacts. **Admin-granted only.** |
| 3 | `factory` | Create/manage materials, manage inventory, view reports, manage production. **Admin-granted only.** |
| 5 | `admin` | Full platform access — user management, system config, billing, CRM. |

`super_admin` and `owner` also exist as code constants (workspace-level, not separate rows in `public.roles`) and count as admin for all platform-wide checks via `isAdmin()` in [`src/auth/roles.ts`](../src/auth/roles.ts).

### Signup flow (added 2026-05-23 / 24)

Public registration always lands a user at `role='user'`, `entity_type='solo'`, `subscription_tier='free'`. To become a dealer or factory:

1. User switches their profile from **Solo** to **Business entity** (Profile tab → Business section). They fill VAT, company name, address. Greek users get one-click pre-fill via VIES + ΑΑΔΕ.
2. User opens Subscription → "Apply for Dealer / Factory" card → picks role + writes optional justification → submits.
3. `role-upgrade-requests` edge function fires: re-validates VAT via VIES, snapshots `vat_validated*` on the request row, emails admins + posts bell notifications.
4. Admin reviews on the user detail page (`/admin/crm/users/{id}` → Role Upgrade Requests panel) → Approve flips `user_profiles.role_id` + emails the user (`role_upgrade_request.approved`).

See [`src/modules/myaade/README.md`](../src/modules/myaade/README.md) for the Greek-business auto-fill that runs during step 1.

---

## How Personas Are Determined (legacy `professional_type` flow, separate from platform roles)

Personas are computed from these sources:

| Source | Field | Purpose |
|--------|-------|---------|
| `user_profiles.professional_type` | string enum | Determines persona / feature set |
| `user_profiles.factory_verified` | boolean | Unlocks factory-side features |
| `user_profiles.entity_type` | `'solo'` \| `'business'` (default `solo`) | Required = `'business'` before applying for dealer/factory role |
| `user_profiles.business_id` | FK → `crm_companies(id)` | Set when entity_type='business'; links to a CRM company row |
| `workspace_members.role` | `'admin'` \| `'owner'` | Grants admin privileges |

**Derived flags** (from `useFactoryRole` hook):
- `isFactory` = `factory_verified === true` AND `professional_type === 'supplier'`
- `isAdmin` = `workspace_members.role` ∈ `['admin', 'owner']`

> Note: the `professional_type` enum was collapsed in 2026-05-24 from 9 values to 5
> (`architect_designer` / `supplier` / `sourcing_agent` / `consultant` / `other`). The
> legacy split between `manufacturer` / `brand` / `supplier` and between
> `designer` / `interior_designer` / `architect` was needless surface area; suppliers are
> the umbrella "anyone who supplies products" persona, and architects + designers behave
> identically in the product. The hook name `isFactory` is kept as legacy shorthand for
> "this user produces / supplies products and has been verified".

---

## Complete User Level Table

| Level | How Determined | `isFactory` | `isAdmin` |
|-------|---------------|-------------|-----------|
| **Unauthenticated** | Not logged in | — | — |
| **Architect / Interior Designer** | `professional_type = 'architect_designer'` | false | false |
| **Sourcing Agent** | `professional_type = 'sourcing_agent'` | false | false |
| **Consultant** | `professional_type = 'consultant'` | false | false |
| **Other** | `professional_type = 'other'` | false | false |
| **Supplier (unverified)** | `professional_type = 'supplier'`, `factory_verified = false` | false | false |
| **Supplier (verified)** | `professional_type = 'supplier'`, `factory_verified = true` | **true** | false |
| **Admin** | `workspace_members.role = 'admin'` | any | **true** |
| **Owner** | `workspace_members.role = 'owner'` | any | **true** |

---

## Access Matrix

### Navigation / Pages

| Page / Route | Unauth | Standard Users¹ | Unverified Factory | Verified Factory | Admin / Owner |
|---|:---:|:---:|:---:|:---:|:---:|
| Dashboard (`/`) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Agent Hub (`/agent-hub`) | ❌ | ✅ | ✅ | ✅ | ✅ |
| MoodBoards (`/moodboard`) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Discover (`/discover`) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Quotes (`/quotes`) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Market Trends (`/market-trends`) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Admin Panel (`/admin`) | ❌ | ❌² | ❌² | ❌² | ✅ |
| Public Profiles (`/u/:id`) | ✅ | ✅ | ✅ | ✅ | ✅ |

> ¹ Standard Users = Architect / Interior Designer, Sourcing Agent, Consultant, Other
> ² Sidebar shows the Admin link for all users; access is guarded by `AdminGuard` (redirects non-admins)

---

### Factory Analytics Page

| Tab | Verified Factory | Admin / Owner |
|-----|:---:|:---:|
| My Factory (own performance metrics) | ✅ | ✅ |
| Market Trends | ✅ | ✅ |
| Platform-wide analytics | ❌ | ✅ |

---

### JARVIS agent Tools (RBAC via edge function)

| Tool | All Authenticated Users | Admin / Owner Only |
|------|:---:|:---:|
| `knowledge_base_search` | ✅ | — |
| `material_search` (7-vector fusion) | ✅ | — |
| `visual_search` (image similarity) | ✅ (when image attached) | — |
| `generate_3d` (Interior Designer agent) | ✅ | — |
| Sub-agent orchestration (`research_analysis`, `analytics_analysis`, `business_analysis`, `product_analysis`) | ❌ | ✅ |
| B2B tools (`b2b_manufacturer_search`, `company_website_scrape`, `company_enrichment`, `contact_discovery`, `email_validate`, `save_to_crm`) | ❌ | ✅ |
| SEO pipeline (`seo_keyword_research`, `seo_article_planner`, `seo_article_writer`, `seo_content_analyzer`, `create_seo_article`) | ❌ | ✅ |

---

### Product Detail Modal

| Tab / Action | Standard Users | Admin / Owner |
|---|:---:|:---:|
| Product info tab | ✅ | ✅ |
| Image viewer tab | ✅ | ✅ |
| AI Metadata tab | ❌ | ✅ |
| Edit / Enrichment tab | ❌ | ✅ |
| Embeddings debug tab | ❌ | ✅ |

---

### Profile Features

| Feature | Unverified Factory | Verified Factory |
|---------|:---:|:---:|
| Standard profile fields | ✅ | ✅ |
| Factory verification section (claim / view status) | ✅ | ✅ |
| Factory Analytics access | ❌ | ✅ |

---

### Quotes / Timeline

| Feature | Standard Users | Admin / Owner |
|---------|:---:|:---:|
| View quote timelines | ✅ | ✅ |
| Edit milestone dates | ❌ | ✅ |
| Manage quote status | ❌ | ✅ |

---

## Groups Summary

For implementation purposes, user levels collapse into **4 functional groups**:

| Group | Who | Key Privilege |
|-------|-----|---------------|
| **Unauthenticated** | Not logged in | Public pages only |
| **Standard** | Designer, Interior Designer, Architect, Sourcing Agent, Consultant, Other + unverified Manufacturer/Brand/Supplier | Core platform features |
| **Verified Factory** | Manufacturer/Brand/Supplier with `factory_verified = true` | + Factory Analytics (own data) |
| **Admin / Owner** | `workspace_members.role` = admin or owner | Full access + admin tools + RBAC-gated AI tools |

---

## Pending / To Define

The following access questions are **not yet implemented** and will be defined in the next task:

- [ ] How users self-select their professional type (onboarding flow vs profile edit)
- [ ] Whether Sourcing Agents get access to B2B manufacturer search tools
- [ ] Whether Verified Factories get any elevated JARVIS agent tools beyond standard
- [ ] Credit quota differences per user level
- [ ] Public profile visibility rules (who can be discovered on `/discover`)
