# Contracts & E-Signature

One contract entity, three contexts (`hr` | `finance` | `project`), one public signing page.

A contract is a markdown body plus counterparty details that gets sent to someone outside the platform, who opens a tokenised link and signs it — no account required. The same table backs an employment contract, a supplier/customer agreement, and a project agreement; the **context** decides who may manage it and which subject it hangs off.

- **Edge function**: [`supabase/functions/contracts-api/index.ts`](../supabase/functions/contracts-api/index.ts)
- **Module slug**: `contracts` (paid add-on — gated by `isModuleEnabled('contracts')` + `assertEntitled(workspace, 'contracts')`)
- **Frontend**: [`ContractsSection.tsx`](../src/components/features/contracts/ContractsSection.tsx) (shared panel), [`ContractsPage.tsx`](../src/modules/contracts/pages/ContractsPage.tsx), [`PublicContractSignPage.tsx`](../src/pages/PublicContractSignPage.tsx)
- **Service**: [`contractsService.ts`](../src/services/contractsService.ts)
- **Public route**: `/sign/:token` — registered **outside** `AuthGuard` in [`App.tsx`](../src/App.tsx)

---

## The three contexts

`contracts.context` is one of `hr` | `finance` | `project`. It is **not cosmetic** — RLS branches on it, so the context determines the required role:

| Context | Who can manage | Subject column | Where the panel mounts |
|---|---|---|---|
| `hr` | workspace **admin** | `hr_employee_id` | `EmployeesSection` → "Employment contracts" |
| `finance` | **finance-manager** | `customer_company_id`, `supplier_company_id`, `order_id`, `quote_id` | Contracts page / finance surfaces |
| `project` | workspace **member** | `project_id` | `ProjectDetailPage` |

`ContractsSection` is one component reused in all three; it takes `workspaceId`, `context`, and a `subject` (e.g. `{ hr_employee_id }`).

---

## Status lifecycle

```
draft ──send──▶ sent ──sign──▶ signed
  │              │
  └────void──────┴──▶ void        (declined / expired are also terminal)
```

- `send` mints a `sign_token` (two concatenated UUIDs) and sets `sign_token_expires_at` to **now + 30 days**, then returns `sign_path: /sign/<token>`.
- `void` clears `sign_token`, immediately killing any outstanding link.
- Signing is **single-use**: a second attempt on a signed contract returns `409`.

---

## API

`POST` to the function with an `{ action, ... }` body.

### Public (no auth — the signer's page)

`verify_jwt` is **disabled** on this function so an anonymous counterparty can sign. Only these two actions are reachable without a session:

| Action | Body | Returns |
|---|---|---|
| `resolve_token` | `{ token }` | `{ contract }` · `{ signed: true, contract: { title } }` · `{ not_found: true }` |
| `sign` | `{ token, signer_name, signer_email?, signature_image? }` | `{ success, contract_id }` |

`resolve_token` deliberately leaks nothing: `void`, `declined`, and expired contracts all return the **same** `{ not_found: true }` as a bogus token. An already-signed contract returns only its `title`.

`sign` rejects anything not in `sent` state, or past `sign_token_expires_at`, with `410`.

### Authed (session JWT — management)

`create` · `list` · `get` · `update` · `send` · `void`

Writable fields are **allowlisted** (`contract_type`, `title`, `body_markdown`, `currency`, `value`, `effective_date`, `expiry_date`, `counterparty_name`, `counterparty_email`) plus the subject columns. `status`, `sign_token`, `workspace_id`, and `created_by` are **server-set only** — a body cannot touch them (invariant 8, mass assignment).

---

## Security model

This function is a good reference for [security invariant 1](../CLAUDE.md) (tenancy binding) on a route that *must* stay partly public:

1. `verify_jwt` is off, so **every management action re-authenticates** via `authenticate()` + `userCanAccessWorkspace()` — the public door does not widen the authed ones.
2. Management writes go through a **user-context client** (the caller's JWT), not the service-role client. The context-branched RLS (`hr`→admin, `finance`→finance-manager, `project`→member) is the *real* enforcement — there is no "service-role client + trust a body-supplied id" path here.
3. A `42501` (RLS denial) from Postgres is surfaced as **403**; a missing row is **404**.
4. The module gate returns **404** (not 403) when `contracts` is disabled, so a non-entitled workspace cannot probe for the feature's existence.

The service-role client is used only for the token paths, where there is no user to act as — and those paths read/write strictly by `sign_token`.

---

## Tables

**`contracts`**
`id`, `workspace_id`, `context`, `contract_type`, `title`, `body_markdown`, `status`, `currency`, `value`, `effective_date`, `expiry_date`, `hr_employee_id`, `customer_company_id`, `supplier_company_id`, `order_id`, `quote_id`, `project_id`, `counterparty_name`, `counterparty_email`, `sign_token`, `sign_token_expires_at`, `sent_at`, `signed_at`, `created_by`, `created_at`, `updated_at`

**`contract_signatures`**
`id`, `contract_id`, `workspace_id`, `signer_name`, `signer_email`, `signer_role`, `signature_image`, `signed_at`, `ip`, `user_agent`

The signature row is the audit record — it captures `ip` and `user_agent` at signing time, which is what makes the signature defensible after the fact. It is written with the service-role client (the signer has no session).

---

## Flows

Signing emits the **`contract_signed`** flow event via `emitFlowEvent`, carrying the contract payload. Per the Flows rule, notifications for a signed contract belong in a flow — do **not** hardcode a `user_notifications` insert or an `email-api` call for it. See [flows-notification-system.md](flows-notification-system.md).

> **Note:** `send` returns the `sign_path` but does **not** itself email the counterparty — delivery is the caller's/flow's job.

---

## Related

- [hr-system.md](hr-system.md) — the `hr` context (employment contracts)
- [finance-system.md](finance-system.md) — the `finance` context
- [projects.md](projects.md) — the `project` context
- [capabilities-and-tenancy.md](capabilities-and-tenancy.md) — module gating + entitlement
