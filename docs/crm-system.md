# CRM System

Customer Relationship Management — contacts, companies, and user account management for workspace admins.

---

## Overview

The CRM provides workspace admins with a unified view of contacts, companies, and platform users. It integrates with the messaging system (SMS/email campaigns) and quotes system.

**Admin Route:** `/admin/crm`

**Edge Functions:**
- `crm-contacts-api` — Contact CRUD, user linking
- `crm-companies-api` — Company records, contact associations
- `crm-users-api` — Platform user management and role control
- `crm-stripe-api` — Subscription and credit billing (see [billing-credits-system.md](billing-credits-system.md))

**Individual API Docs:**
- [crm-contacts-api.md](api/crm-contacts-api.md)
- [crm-companies-api.md](api/crm-companies-api.md)
- [crm-users-api.md](api/crm-users-api.md)

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

Organisation records (manufacturers, suppliers, clients).

**Key fields:** name, domain, industry, address, website, contact_count, linked_contacts[]

**Routes:**
- `/admin/crm` (companies tab)
- `/admin/crm/companies/:id` (company detail)
- `CompanyDetailPage.tsx`

### Users

Platform user accounts. Admins can view all workspace users, update roles, and manage permissions.

**Key fields:** email, role, workspace_id, created_at, last_sign_in_at, subscription status

**Roles:** `admin`, `owner`, `manager`, `member`, `factory`

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
2. Campaign uses `messaging-api` to send SMS or WhatsApp to contact phone numbers
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
| `crm_activities` | Activity log (calls, emails, meetings) |

---

## Search & Filtering

All CRM list views support:
- Full-text search (name, email, company)
- Filter by role, tag, company, linked status
- Sort by name, created_at, last activity

---

**Last Updated:** March 2026
