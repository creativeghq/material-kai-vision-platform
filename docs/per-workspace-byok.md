# Per-Workspace BYOK (tenant Bring-Your-Own-Key)

Per-**tenant** third-party credentials, so a workspace's outbound integrations run under **its own** provider account instead of the operator's. Distinct from the platform-wide [platform-secrets.md](./platform-secrets.md) store: those are operator-set keys shared by every tenant; the BYOK credentials here live in dedicated `workspace_*` tables, are keyed by `workspace_id`, and are entered by the tenant.

The unified home is **Profile → Keys** (`/profile?tab=keys`).

---

## 1. The surface — Profile → Keys

[`WorkspaceKeysTab`](../src/components/core/Profile/WorkspaceKeysTab.tsx) is the single place a workspace manages its third-party access, scoped to the active workspace:

- **Bring your own key** (paste a secret) — four cards, each reusing the exact component also mounted in its module's settings (same RLS, same storage):
  - **AADE Special Access Codes** — [`AadeCredentialsCard`](../src/modules/myaade/components/AadeCredentialsCard.tsx)
  - **Resend email sender** — [`WorkspaceEmailConfigCard`](../src/modules/email/components/WorkspaceEmailConfigCard.tsx)
  - **myDATA Inbox (received docs)** — [`InboundSetupCard`](../src/modules/finance/components/InboundSetupCard.tsx)
  - **Ergani (HR filings)** — [`ErganiCredentialsCard`](../src/modules/hr/components/ErganiCredentialsCard.tsx)
- **Connections** (OAuth / connect-only, nothing to paste) — Stripe payouts, Social accounts (Zernio), WhatsApp (Zernio): status + a link to where they're managed.

Every BYOK card self-gates via RLS (finance-manager or workspace-admin, per credential — see §6). "Leave blank to use the platform defaults" is the consistent copy where a fallback exists.

---

## 2. The four BYOK cards

### Resend email — `workspace_email_config` (PK `workspace_id`)
Bring your own Resend API key + verified sender so invoices, statements, quotes and catalog emails go out from your own domain.

| Column | Notes |
|---|---|
| `resend_api_key` | secret; never returned to the browser |
| `from_email` / `from_name` | verified sender |
| `enabled` | toggle BYOK on/off |
| `daily_send_limit` | **platform-controlled** per-workspace override of the daily cap |
| `resend_audience_id`, `contacts_auto_sync`, `contacts_*` | Resend contacts sync bookkeeping |

Server resolver: [`_shared/email-sender.ts → resolveWorkspaceEmailSender`](../supabase/functions/_shared/email-sender.ts). Workspace BYOK wins **only when** `enabled ≠ false` **and** `resend_api_key` **and** `from_email` are all present; otherwise the platform `RESEND_API_KEY` + global `email_settings` sender. `checkWorkspaceSendQuota` enforces the daily cap off `email_logs.workspace_id`. The daily cap is **not** tenant-editable — shown read-only in the card.

### AADE Special Access Codes — `workspace_aade_credentials` (PK `workspace_id`)
"Ειδικοί Κωδικοί Πρόσβασης ΑΑΔΕ" for the **RgWsPublic2** SOAP registry/VAT lookup (SOAP 1.2 + WS-Security UsernameToken). Every lookup runs under the tenant's own TAXISnet account — its monthly quota, its audit inbox.

| Column | Notes |
|---|---|
| `username` | special-access username |
| `password` | secret; never returned to the browser |
| `afm_called_by` | optional caller VAT, named in the ΑΑΔΕ lookup audit |
| `enabled` | toggle |

Server resolver: [`_shared/aade/soap.ts → resolveAadeCredentials`](../supabase/functions/_shared/aade/soap.ts). **Not** the myDATA REST creds below — these are username+password for SOAP; those are user-id + subscription-key for REST.

### myDATA Inbox (received documents) — `workspace_inbound_credentials` (PK `workspace_id`)
myDATA **REST API** credentials for the received-documents poller ([`finance-inbound-sync`](../supabase/functions/finance-inbound-sync/index.ts)). Feeds Documents → Expenses.

| Column | Notes |
|---|---|
| `aade_user_id` | sent as the `aade-user-id` header |
| `subscription_key` | sent as `Ocp-Apim-Subscription-Key`; secret, never returned to the browser |
| `base_url` | myDATA endpoint (defaults to production) |
| `enabled` | toggle |

> `Ocp-Apim-Subscription-Key` is AADE myDATA's Azure-APIM **gateway** header — there is **no Azure Document Intelligence** in this flow. This inbox has **no platform default**: myDATA tags every received document to a specific issuer, so each workspace **must** supply its own credentials.

### Ergani — `workspace_ergani_credentials` (PK `workspace_id`)
Ergani II Web API credentials so the platform files work-card punches, leaves, E3 hires and schedules under the tenant's own e-EFKA "Ergani" account. Shared client: [`_shared/ergani/client.ts`](../supabase/functions/_shared/ergani/client.ts).

| Column | Notes |
|---|---|
| `username` | Ergani Web API username |
| `password` | secret; never returned to the browser |
| `employer_afm` | `f_afm_ergodoti` |
| `branch_aa` | `f_aa` branch number |
| `usertype` | submission user type (e.g. `02`) |
| `environment` | `trial` (submissions stamped "VOID") \| `production` |
| `enabled` | toggle |

---

## 3. Resolution model (workspace-first, ROOT-only fallback)

Every resolver is passed the active `workspace_id` and applies the same policy:

1. **The workspace's own row wins** — use the tenant's credentials.
2. **No usable row + this is the operator's ROOT workspace** (`workspaces.is_root`) → fall back to platform env / `platform_secrets` (e.g. AADE `AADE_USERNAME` / `AADE_PASSWORD` / `AADE_AFM_CALLED_BY`; Resend `RESEND_API_KEY` + global `email_settings` sender). Only the root workspace inherits the operator default.
3. **Any other workspace with no row → not configured** — the caller returns a `*_not_configured` **503** (or falls back to the platform sender for email). **Tenants never use the operator's master keys** — so each tenant's provider quota and audit trail stays under its own identity.

The **myDATA Inbox has no fallback at all** (§2) — no row means the poller is simply off for that workspace.

The BYOK cards surface this: when a workspace has no own row but the platform default is active (root workspace), the AADE and Resend cards show an "…default is active / In use" banner so the operator knows nothing needs entering.

---

## 4. Masked status — secrets never reach the browser

Reads go through per-credential `SECURITY DEFINER` status RPCs that return only **whether** a secret is set, never its value:

| RPC | Returns |
|---|---|
| `get_workspace_email_config_status` | `from_email`, `from_name`, `enabled`, `has_api_key`, `effective_daily_limit`, `sent_today`, `source` (`workspace`\|`platform`), platform sender |
| `get_aade_creds_status` | `username`, `afm_called_by`, `enabled`, `has_password` |
| `get_inbound_creds_status` | `aade_user_id`, `base_url`, `enabled`, `has_key` |
| `get_ergani_creds_status` | `username`, `employer_afm`, `branch_aa`, `usertype`, `environment`, `enabled`, `has_password` |

The cards render placeholders (`•••••••• (configured — leave blank to keep)`) and only send a new secret on save when the user actually typed one — a blank field **preserves** the stored value.

---

## 5. Where the credentials are consumed

| Credential | Consumer |
|---|---|
| Resend BYOK | [`_shared/email-sender.ts`](../supabase/functions/_shared/email-sender.ts) → `email-api` and all tenant-branded senders (invoices, statements, quotes, catalog) |
| AADE Special Access Codes | [`_shared/aade/soap.ts`](../supabase/functions/_shared/aade/soap.ts) → `myaade-rgwspublic2` (VAT/registry lookups) |
| myDATA Inbox REST | [`finance-inbound-sync`](../supabase/functions/finance-inbound-sync/index.ts) received-docs poller |
| Ergani | [`_shared/ergani/client.ts`](../supabase/functions/_shared/ergani/client.ts) → `hr-api` workforce declarations |

---

## 6. RLS & access control

- **AADE, Resend, myDATA Inbox** — writes and the status RPC are gated to `is_workspace_finance_manager(workspace_id)`.
- **Ergani** — gated to `is_workspace_admin(workspace_id)` (or the platform operator).
- All secret columns are stored plaintext under service-role RLS and are **only** read server-side for an actual outbound call; the browser sees masked status only.

---

## 7. BYOK vs. platform secrets

| | Per-workspace BYOK (this doc) | Platform secrets ([platform-secrets.md](./platform-secrets.md)) |
|---|---|---|
| Scope | one tenant (`workspace_id`) | whole platform |
| Storage | `workspace_email_config` / `workspace_aade_credentials` / `workspace_inbound_credentials` / `workspace_ergani_credentials` | `platform_secrets` |
| Set by | the tenant (Profile → Keys) | the operator (`/admin/operations → Keys`) |
| Runs under | the tenant's own provider account | the operator's account |
| Fallback | ROOT workspace → platform default; others → not-configured 503 | env-first, DB-second |

---

**Last updated:** 2026-07-11.
