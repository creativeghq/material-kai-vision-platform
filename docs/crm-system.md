# CRM System

Customer Relationship Management — contacts, companies, and user account management for workspace admins.

---

## Overview

The CRM provides workspace admins with a unified view of contacts, companies, and platform users. It integrates with the messaging system (WhatsApp via Zernio / email campaigns), the quotes system, and the [Finance / Orders](orders-system.md) layer.

**Admin Route:** `/admin/crm`

### Finance / Orders integration
- **Company page tabs:** **Account** (balance + ledger) and **Orders** (the company's orders; quotes/invoices/payments are now viewed *inside* each order, not as separate tabs). The net figure is labelled **"Account balance (they owe us / we owe them / settled)"**.
- **Business-contact rollup:** a quote/invoice for a contact who belongs to a business is attributed to the **company** (quotes enforce an at-most-one-party constraint, so the contact is dropped on a quote; invoices keep both with company precedence). Linking a contact to a company re-points their existing contact-level quotes/invoices to it.
- **Parties (Finance):** contacts that belong to a business are **hidden** from the Customers & Suppliers list — the business represents them.
- **Contacts list:** the company column shows the **attached business** (via the `crm_company_contacts` junction), not only the legacy free-text field.
- **Company role:** Customer / Supplier are **editable checkboxes** (a company can be both); set at creation, adjustable on the company page.

**Edge Function:** `crm-api` — a single router with resource handlers (the former separate `crm-*-api` functions were consolidated):
- `companies` — Company records, contact associations
- `contacts` — Contact CRUD, user linking, potential-matches
- `users` — Platform user management and role control
- `stripe` — Subscription and credit billing (see [billing-credits-system.md](billing-credits-system.md))

**API Docs:**
- [crm-system.md](crm-system.md)

---

## Entities

### Contacts

Individual people (customers, suppliers, prospects).

**Key fields:** name, email, phone, company_id, role, tags, notes, linked_user_id

**Linking:** Contacts can be linked to platform user accounts (`linked_user_id → auth.users`). A linked contact gives admins visibility into which platform user corresponds to a CRM contact.

**Routes:**
- `/admin/crm` (contacts list)
- `/admin/crm/contacts/:id` (contact detail)
- `ContactDetailPage.tsx`

### Companies

Organisation records (manufacturers, suppliers, clients). Also where a user's own business lives once they switch their profile to `entity_type='business'` — the platform creates a `crm_companies` row owned by the user and links it via `user_profiles.business_id`.

**Key fields:** name, domain, industry, address, website, contact_count, linked_contacts[]

**Business-profile fields** (populated by VIES + ΑΑΔΕ auto-fill): `vat_number`, `tax_office`, `profession`, `country_code`, `street`, `street_number`, `postal_code`, `city`, `country`.

**Address derivations run in SQL, in the `crm_normalize_country` BEFORE-write trigger** on
`crm_companies` / `crm_contacts` / `crm_address_units` — not in the form, because seven writers touch
these tables. It (a) fills whichever of `country` / `country_code` is missing from the other and folds
ISO spellings to the VAT prefix (Greece → `EL`); (b) clears a `state` that merely repeats the row's own
country code; (c) for `country_code = 'EL'` **only**, fills a blank `state` with the περιφέρεια derived
from `postal_code` via `greek_region_for_postal_code(text)` — the ΤΚ's first two digits identify the
prefecture, prefectures group into the 13 regions. Every derivation fills a *missing* side only: a
hand-typed `state` (say the prefecture `Thessaloniki`, where the derivation would say
`Central Macedonia`) is never overwritten, and an unassigned TK range leaves `state` NULL rather than
guessing. ΑΑΔΕ returns no region field and VIES is not consulted for `EL`, so before this the one
country whose companies we hold most of was also the only one whose State never filled.

**VAT validation cache** (written by `vies-validate` and `myaade-rgwspublic2`): `vat_validated boolean`, `vat_validated_at timestamptz`, `vat_validated_name text`, `vat_validated_address text`, `vat_validation_source text` (today: `vies` or `aade`), plus `vat_validated_name_latin text`, `vat_validated_address_latin text`.

**VIES has no English/language option — do not go looking for one.** VIES is a proxy: it forwards the
query to the member state's own VAT register and echoes back whatever script that register stores —
Cyrillic for BG (`Виваком България - ЕАД`), Greek for EL/CY. Verified 2026-08-03 against the REST
endpoint, the legacy SOAP `checkVatService`, an `Accept-Language: en` header, and `lang`/`locale`/
`language` body fields; every one returned identical Cyrillic. The response schema has no
name/address language field at all — the extra `trader*` fields are the *qualified*-check echo of
values **you** supply, not a translation.

So the `*_latin` columns hold a deterministic transliteration produced by
`_shared/transliterate.ts` (BG Transliteration Act 2009 incl. its `ия`→`ia` and `България`→`Bulgaria`
exceptions; ELOT 743 for Greek incl. the αυ/ευ voicing rule). They are a **readability aid, not a
translation and not a trading name** — `Виваком` transliterates to `Vivakom` while the company trades
as "Vivacom". `vat_validated_name` stays authoritative and is what belongs on an invoice. The Latin
columns are NULL when the register already answered in Latin, so a populated value always means a
real script conversion happened. Getting the actual *trading* name needs `company-enrich` (a paid
web-search call), not transliteration. Covered by [tests/unit/transliterate.test.ts](../tests/unit/transliterate.test.ts).

**ΑΑΔΕ (Greek-business) fields** (written by `myaade-rgwspublic2`, see [`src/modules/myaade/README.md`](../src/modules/myaade/README.md)): `commercial_title`, `legal_status`, `kad_primary`, `kad_primary_description`, `kad_secondary jsonb`, `business_start_date`, `aade_data jsonb`, `aade_data_at` (90-day cache).


**Lookalikes — "who else in our CRM does what this company does"** (#289). The Market tab's
Competitors panel carries four signals, and only this one ranks by business substance: ΚΑΔ overlap is
a code an accountant picked, and Apollo / Gemini / `web_search` look outward at companies we do not
hold. `crm_companies.text_embedding_1024` is a Voyage `voyage-4` 1024D vector of the company's own
registry prose; `crm_company_lookalikes(company_id, limit)` cosine-ranks the workspace's CRM against
the seed's **stored** vector, so asking costs nothing — no query is embedded and no provider is called
on render.

- **`crm_company_embedding_text(id)` is the derivation, and it lives in SQL.** Nothing in TypeScript assembles this text. The drain embeds exactly what it returns and the staleness hash is taken over exactly what it returns, so the two cannot disagree about what a company *is*. ΚΑΔ descriptions carry most of the signal — full ΑΑΔΕ/ΓΕΜΗ activity prose, in Greek, which `voyage-4` handles natively.
- **There is no trigger and no refresh-on-write hook.** `crm_companies_embedding_backlog()` compares the stored `embedding_source_hash` against the hash of the derivation *right now*, so a CRM edit, a ΓΕΜΗ re-import, an XML import and a catalogue change all fall out of one comparison — including the writers nobody would have remembered to hook. The first run of `crm-company-embedding-backfill` (pg_cron, `*/20`) is therefore also the backfill; there is no separate one.
- **`crm_company_lookalikes` runs with INVOKER rights**, so the `is_workspace_member(workspace_id)` SELECT policy scopes the seed and the candidates alike. There is no `workspace_id` parameter to pass in and therefore none to forge.
- **It returns `{seed_status, population, matches}`, not a row set.** "The query broke", "not profiled yet", "nothing worth embedding" and "genuinely nobody similar" would otherwise all render as no rows, and the panel would state a fact about the customer's CRM that is really a fact about our pipeline.
- **The score is relative, and the UI never shows a percentage.** Measured over this workspace's 861 company pairs: the MEDIAN pair — two businesses with nothing in common — scores **0.645** cosine and the floor is 0.324. "65% similar" would be a valid, confident, meaningless number that an operator would act on. So the RPC returns `z` — standard deviations above the *seed's own* mean similarity to the workspace — drops everything below +1σ (a company with no close neighbour returns nothing, not its four least-distant strangers), and the panel renders "Very close / Close / Related". The absolute cosine buries exactly the matches that matter most: the CRM's two software companies score 0.637 to each other, which is *below* the median unrelated pair and **+4.0σ** for that seed.
- **`embedding_status='skipped'` is a verdict, not an absence.** A company whose only fact is its name is not embedded: that vector would encode spelling and rank strangers as lookalikes. Left `pending` it would also be re-picked on every run forever.
- Guarded by `ops.crm_company_embeddings_never_written` — see [prevention-coverage.md](prevention-coverage.md).

**Routes:**
- `/admin/crm` (companies tab)
- `/admin/crm/companies/:id` (company detail)
- `CompanyDetailPage.tsx`

### Users

Platform user accounts. Admins can view all workspace users, update roles, and manage permissions.

**Key fields:** email, role, workspace_id, entity_type (`solo` | `business`), business_id (FK → `crm_companies`), created_at, last_sign_in_at, subscription status

**Platform roles:** `admin`, `owner`, `super_admin` (admin tier) + `factory`, `dealer`, `user`. The `manager` role was removed 2026-05-23 (collapsed into admin). `dealer` and `factory` are **admin-granted only** — users self-apply via the Role Upgrade Requests flow on the Subscription tab; admins approve on the user detail page. See [user-levels-access.md](user-levels-access.md) for the full role table.

**Routes:**
- `/admin/crm/users/:id` (user detail)
- `UserDetailPage.tsx`

---

## Access Control

| Role | Contacts | Companies | Users |
|---|---|---|---|
| `admin` / `owner` | Full CRUD | Full CRUD | View + role update |
| `manager` | Read + write | Read + write | Read only |
| `factory` | Read own | Read own | None |
| `member` | None | None | None |

---

## CRM + Messaging Integration

Contacts from the CRM can be targeted in messaging campaigns:

1. Admin selects contacts/segments in `/admin/messaging`
2. Campaign uses `messaging-api` to send WhatsApp (via Zernio / Meta Cloud API) to contact phone numbers — cold sends require a Meta-approved template (SMS removed 2026-06-08)
3. Delivery status and analytics sync back to `message_logs`

---

## CRM + Quotes Integration

Contacts can be associated with quotes:

- `quotes.contact_id` → links a quote to a CRM contact
- Contact detail page shows quote history
- Admin can initiate a quote from a contact record

---

## Database Tables

| Table | Description |
|---|---|
| `crm_contacts` | Individual contact records |
| `crm_companies` | Company records |
| `crm_contact_company` | Junction: contacts ↔ companies |
| `crm_tags` | Custom tags for contacts |
| `crm_contact_tags` | Junction: contacts ↔ tags |
| `crm_notes` | Notes attached to contacts/companies |
| `crm_activities` | Document-less activity only (calls, emails sent, lead status, company attach/detach) |

---

## The record Activity feed is derived, not logged

`crm_record_timeline(target_kind, target_id, limit)` is the single source for the Activity tab on a
contact or a company. Everything is **derived from the source rows**, joined to the party by company
id or by any of the company's linked contacts; `crm_activities` / `crm_notes` / `crm_meetings`
supply only the entries that have no document behind them (notes, calls, emails sent, lead status,
company attach/detach).

| Group | Shows | Derived from |
|---|---|---|
| Trade | quote created/accepted, sales & purchase orders, invoices issued/paid, supplier bills received/paid, payments in and out, credit notes both directions, inbound shipments | `quotes`, `orders`, `invoices`, `supplier_bills`, `payments`, `credit_notes`, `supplier_credit_notes`, `inbound_shipments` |
| Design | project created, project lifecycle events, moodboards, presentation sheets, client views shared, **client feedback left on a sheet**, quote requested from a moodboard | `projects` (+ `project_events`), `moodboards`, `moodboard_presentation_sheets`, `project_client_views`, `client_view_feedback`, `moodboard_quote_requests` — all reached through the project, which is the only row that names the client |
| Real estate | property viewings booked with this party | `property_viewings.crm_contact_id` |
| Page visits | shared catalogue opened (per catalogue per day, with the page count), catalogue access granted/denied, shared quote viewed/downloaded, account statement opened | `catalog_view_events` + `catalog_access_log` (which resolves the visitor's email to a CRM party), `quote_analytics_events` where `view_context='public'`, `finance_statement_shares` |
| Email | opened, link clicked, bounced | `email_logs` matched on `to_email` against the party's addresses, **scoped to `workspace_id`** |

Page-view sources are aggregated per document per day — a client paging through a 40-page catalogue
is one line saying 40 pages, not 40 lines.

Known gaps: `project_client_views.share_view_count` and `moodboard_presentation_sheets.share_view_count`
keep a counter but no per-view rows, so those opens cannot be placed in time; `append_project_event`
exists but has no caller, so `project_events` is empty; and `email_logs.workspace_id` is only stamped
by senders that pass it (the CRM composer does), so older sends never match.

It used to be a write-log fed by two triggers on `invoices` and `quotes`, which meant orders and
payments never appeared at all and the rows it did write outlived the documents they described.
Do not re-introduce a trigger that logs a business event, and do not re-assemble the feed in
TypeScript — [tests/unit/crmTimelineDerivation.test.ts](../tests/unit/crmTimelineDerivation.test.ts)
fails the build for both.

---

## Search & Filtering

All CRM list views support:
- Full-text search (name, email, company)
- Filter by role, tag, company, linked status
- Sort by name, created_at, last activity

---

**Last Updated:** March 2026
