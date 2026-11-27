# CRM System

Customer Relationship Management — leads, contacts, companies, the workspace team, and (for the platform operator) platform accounts.

---

## Overview

The CRM gives a workspace one place for its leads, contacts, companies and team. It integrates with the messaging system (WhatsApp via Zernio / email campaigns), the quotes system, and the [Finance / Orders](orders-system.md) layer.

**Route:** `/crm` (tabs `?tab=pipeline|leads|users|contacts|companies|categories`), record pages `/crm/leads/:id`, `/crm/contacts/:id`, `/crm/companies/:id`, `/crm/users/:id`. Gated by the `crm.view` capability.

### Finance / Orders integration
- **Account tab** (`PartyAccountTabs`, the same component on companies and contacts): a pinned `CustomerAccountOverview`, then one `OpeningBalanceCard` per side the party is on (customer / supplier) — **Set opening balance** (as of, direction, amount, currency, source, note; entries dated on or before it are shown but not counted again) and **Record payment on account** (`RecordPaymentDialog`, seeded with the opening date) — then tabs **Orders**, **Payments**, **Issued Invoices** (every party, with **New invoice** prefilled to the party), **Received Invoices** (supplier companies: what they filed on myDATA, flagging rows not yet in Expenses), **Top Items** and **Payment Rules**. The net figure is **"Account balance (they owe us / we owe them / settled)"**.
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
- **There is no trigger and no refresh-on-write hook.** `crm_companies_embedding_backlog()` compares the stored `embedding_source_hash` against the hash of the derivation *right now*, so a CRM edit, a ΓΕΜΗ re-import, an XML import and a catalogue change all fall out of one comparison — including the writers nobody would have remembered to hook. The first run of `embedding-drain?task=crm-companies` (pg_cron, `*/20`) is therefore also the backfill; there is no separate one.
- **`crm_company_lookalikes` runs with INVOKER rights**, so the `is_workspace_member(workspace_id)` SELECT policy scopes the seed and the candidates alike. There is no `workspace_id` parameter to pass in and therefore none to forge.
- **It returns `{seed_status, population, matches}`, not a row set.** "The query broke", "not profiled yet", "nothing worth embedding" and "genuinely nobody similar" would otherwise all render as no rows, and the panel would state a fact about the customer's CRM that is really a fact about our pipeline.
- **The score is relative, and the UI never shows a percentage.** Measured over this workspace's 861 company pairs: the MEDIAN pair — two businesses with nothing in common — scores **0.645** cosine and the floor is 0.324. "65% similar" would be a valid, confident, meaningless number that an operator would act on. So the RPC returns `z` — standard deviations above the *seed's own* mean similarity to the workspace — drops everything below +1σ (a company with no close neighbour returns nothing, not its four least-distant strangers), and the panel renders "Very close / Close / Related". The absolute cosine buries exactly the matches that matter most: the CRM's two software companies score 0.637 to each other, which is *below* the median unrelated pair and **+4.0σ** for that seed.
- **`embedding_status='skipped'` is a verdict, not an absence.** A company whose only fact is its name is not embedded: that vector would encode spelling and rank strangers as lookalikes. Left `pending` it would also be re-picked on every run forever.
- Guarded by `ops.crm_company_embeddings_never_written` — see [prevention-coverage.md](prevention-coverage.md).

**Agencies / dealers:** `crm_company_representations` links an agent to a principal (factory) with an arrangement, the agency person, and `material_category_id` — the **range covered** (NULL = whole range). The pair key is (agent, principal, range), so one factory can have a different agency per range. Last contact is `crm_representation_last_contact()`: the latest of the hand-set `last_contact_on`, CRM calls/emails, past meetings and Inbox messages from the agency's people.

**Quick add from a VAT number:** `splitPartyQuery` routes a bare 9-digit ΑΦΜ, `EL`/`GR`+ΑΦΜ, or a known EU prefix + mostly numeric body to the VAT field (and country) of `QuickAddCompanyDialog`, so Enter runs the ΑΑΔΕ / VIES lookup. A lookup that fails or is unsupported leaves a note on screen; the party can still be added with the VAT as typed.

**Website confirmation by EU VAT:** the site check reads EU VAT numbers printed on a company's website, confirms them in VIES and requires the registered name to match the company. `company-enrich` `verify_only` (platform operator, no billing) re-checks web-sourced websites and fills a blank `vat_number`; it never changes the website.

**Signals tab:** every saved company has a Signals tab (`CompanySignalsPanel`, read from its website): open roles, technologies, intent, careers page — each section module-gated (`signals-*`) and explaining why it is empty.

**Routes:** `/crm?tab=companies`, `/crm/companies/:id` (`CompanyDetailPage.tsx`).

### Leads

An enquiry that is not a contact yet. `crm_leads` (workspace-scoped): name, email, phone, company
name, `source` (email | phone | website | whatsapp | walk_in | referral | social | other), `title`
(Interested In), `request`, `status` (new | contacted | quoted | lost | converted), `lost_reason`,
estimated value, follow-up date, `source_ref`, and for captured leads `capture_flow_id`,
`conversation_summary`, `conversation_synced_at`, `auto_tracking`. Vocabulary:
`src/modules/crm/leadVocabulary.ts` (mirrored to Deno). Leads never appear in Contacts.

- **UI:** CRM → Leads (`LeadsPanel`: list or `?view=board`; dragging a card changes status, dropping on Converted opens the convert dialog) and `/crm/leads/:id` (`LeadDetailPage`, HubRecordPage: details, Quotes, Request, Activity, Conversation).
- **Quotes before a contact exists:** `quotes.lead_id`. Creating or linking a quote moves a new/contacted lead to `quoted`; the Quotes list shows the lead's name as customer.
- **Activity:** `crm_notes` / `crm_activities` / `crm_meetings` accept target kind `lead`; `crm_record_timeline` has a lead branch. A legacy `crm_leads.notes` renders read-only as Earlier Notes. `_crm_lead_target_guard` stamps `workspace_id` from the target record for every kind (lead/contact/company/deal) and requires `crm.view` or `finance.operate` there.
- **Convert:** `convert_crm_lead()` is the one path to a contact. It reuses a same-email contact, carries the lead history as a note, hands linked quotes to the contact (and deal), optionally opens a deal whose stage follows the lead status with the follow-up as a task, and replays on a repeat call (`already_converted`). A converted lead's timeline shows on its contact; deleting a converted lead moves it there.
- **Capture:** an `inquiry_received` flow creates leads from matching inbound email / WhatsApp through the `create_lead` action — see [flows-notification-system.md](flows-notification-system.md#inquiry--lead-is-a-flow). A reply from the team moves a `new` lead to `contacted` (trigger on member/agent WhatsApp messages; Gmail SENT history for email).
- **Conversation sync:** background agent `lead-conversation-sync` (every 30 min, operator workspace) reads open auto-tracked leads' conversations with new messages (fenced as data; prompt `agent/lead_conversation_sync` in `prompts`) and writes summary, status and follow-up through `apply_lead_conversation_sync`, which never moves status backwards or to `converted`. A status change by any other writer switches `auto_tracking` off; the lead page has Stop / Resume syncing.

### Users

CRM → Users is the **workspace team** for every workspace: `TeamPanel` (the same component as
Finance → Settings → Team and Profile → Team) — invite with a role, pending invitations, Support
access, members with role change and removal. The platform operator additionally sees
`PlatformAccountsPanel` (`CrmUsersTab.tsx`): every platform account with account tier, type,
subscription, credits and status, bulk actions, and `/crm/users/:id` (`UserDetailPage.tsx`).
`/admin/users` no longer exists.

**Account tiers** (`public.roles`): `user`, `supplier`, `architect`, `admin` — platform-wide.
Functional roles are workspace roles (see [capabilities-and-tenancy.md](capabilities-and-tenancy.md)).

**Delete guards** (`crm-api` users handler, operator-only): refuses the caller's own account, the
root-workspace owner (409), and any account with an active subscription or a credit balance
(`user_delete_blockers`); a failed workspace cleanup stops the delete. Bulk actions run one request
at a time. `DELETE /contacts/:id` maps a `23503` (invoices / supplier bills RESTRICT) to a 409 in
plain words.

---

## Access Control

Inside a workspace the server checks a **capability**, not membership — see
[capabilities-and-tenancy.md](capabilities-and-tenancy.md). CRM reads and writes need `crm.view`
(held by owner, admin, member, support, sales, sales_manager and realestate_agent); the team panel's
controls need `workspace.manage`; platform accounts need the platform operator.

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
| `crm_leads` | Enquiries not yet contacts (see Leads) |
| `crm_company_representations` | Agency ↔ factory links, per range (`material_category_id`) |
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
