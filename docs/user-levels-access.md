# User Levels & Access Control

Reference document for all user roles on the Material KAI Vision Platform, how they are determined, and what each level can access.

---

## How Roles Are Determined

Roles are computed from two database sources:

| Source | Field | Purpose |
|--------|-------|---------|
| `user_profiles.professional_type` | string enum | Determines persona / feature set |
| `user_profiles.factory_verified` | boolean | Unlocks factory-side features |
| `workspace_members.role` | `'admin'` \| `'owner'` | Grants admin privileges |

**Derived flags** (from `useFactoryRole` hook):
- `isFactory` = `factory_verified === true` AND `professional_type` ∈ `['manufacturer', 'brand', 'supplier']`
- `isAdmin` = `workspace_members.role` ∈ `['admin', 'owner']`

---

## Complete User Level Table

| Level | How Determined | `isFactory` | `isAdmin` |
|-------|---------------|-------------|-----------|
| **Unauthenticated** | Not logged in | — | — |
| **Designer** | `professional_type = 'designer'` | false | false |
| **Interior Designer** | `professional_type = 'interior_designer'` | false | false |
| **Architect** | `professional_type = 'architect'` | false | false |
| **Sourcing Agent** | `professional_type = 'sourcing_agent'` | false | false |
| **Consultant** | `professional_type = 'consultant'` | false | false |
| **Other** | `professional_type = 'other'` | false | false |
| **Manufacturer (unverified)** | `professional_type = 'manufacturer'`, `factory_verified = false` | false | false |
| **Manufacturer (verified)** | `professional_type = 'manufacturer'`, `factory_verified = true` | **true** | false |
| **Brand (unverified)** | `professional_type = 'brand'`, `factory_verified = false` | false | false |
| **Brand (verified)** | `professional_type = 'brand'`, `factory_verified = true` | **true** | false |
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
| Quotes Cart (`/quotes`) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Factory Analytics (`/factory-analytics`) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Admin Panel (`/admin`) | ❌ | ❌² | ❌² | ❌² | ✅ |
| Public Profiles (`/u/:id`) | ✅ | ✅ | ✅ | ✅ | ✅ |

> ¹ Standard Users = Designer, Interior Designer, Architect, Sourcing Agent, Consultant, Other
> ² Sidebar shows the Admin link for all users; access is guarded by `AdminGuard` (redirects non-admins)

---

### Factory Analytics Page

| Tab | Verified Factory | Admin / Owner |
|-----|:---:|:---:|
| My Factory (own performance metrics) | ✅ | ✅ |
| Market Trends | ✅ | ✅ |
| Platform-wide analytics | ❌ | ✅ |

---

### KAI Agent Tools (RBAC via edge function)

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
- [ ] Whether Verified Factories get any elevated KAI agent tools beyond standard
- [ ] Credit quota differences per user level
- [ ] Public profile visibility rules (who can be discovered on `/discover`)
