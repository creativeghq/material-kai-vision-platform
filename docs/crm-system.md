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
- [api/crm-api.md](api/crm-api.md)

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

**VAT validation cache** (written by `vies-validate` and `myaade-rgwspublic2`): `vat_validated boolean`, `vat_validated_at timestamptz`, `vat_validated_name text`, `vat_validated_address text`, `vat_validation_source text` (today: `vies` or `aade`).

**ΑΑΔΕ (Greek-business) fields** (written by `myaade-rgwspublic2`, see [`src/modules/myaade/README.md`](../src/modules/myaade/README.md)): `commercial_title`, `legal_status`, `kad_primary`, `kad_primary_description`, `kad_secondary jsonb`, `business_start_date`, `aade_data jsonb`, `aade_data_at` (90-day cache).


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
contact or a company. Business events — quotes, orders, invoices, supplier bills, payments in and
out, credit notes, inbound shipments — are **derived from the documents themselves**, joined to the
party by company id or by any of the company's linked contacts. `crm_activities` / `crm_notes` /
`crm_meetings` supply only the entries that have no document behind them.

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
