# Email Marketing (tenant add-on)

> Issue **#255**. Module slug: **`email-marketing`** · category `communications` · price tier `pro` · [`src/modules/email-marketing/manifest.json`](../src/modules/email-marketing/manifest.json).
> Multi-tenant: **tenant = workspace**. Sending is **Resend BYOK-only** — each workspace sends from its OWN Resend account + verified sender.

Email Marketing is a per-workspace **paid add-on** that lets a tenant design email templates in a visual builder and send bulk campaigns to their CRM audiences — entirely from their own verified Resend domain. It is built on the [modules/entitlements framework](capabilities-and-tenancy.md) (#251) and **reuses** the shared GrapesJS email builder + the `campaigns` / `email_templates` / `campaign_recipients` tables rather than forking them.

> **Not to be confused with [Campaign System](campaign-system.md).** That older doc describes the **internal / platform (admin-only)** campaign tooling at `/admin/emails` — admin-RLS'd, sending from the shared platform sender (historically SES). This add-on is the **tenant-facing** surface at `/marketing/email`: workspace-scoped RLS, BYOK Resend, entitlement-gated. The two share the same tables (distinguished by `campaigns.workspace_id` / `channel_type='email'`) but are different products with different auth models. See [§7](#7-vs-the-internal-campaign-system).

Related docs: [CRM](crm-system.md) · [Per-workspace BYOK keys](../src/modules/myaade/README.md) · [Capabilities & Tenancy](capabilities-and-tenancy.md) · [Campaign System (internal)](campaign-system.md).

---

## 1. What it covers

- **Templates** — workspace-scoped email templates built in the reused GrapesJS visual builder, stored in `email_templates` with `category='marketing'`.
- **Campaigns** — bulk email sends to a resolved audience, tracked per-recipient in `campaign_recipients`, driven by the `campaign-processor` cron.
- **Audience** — resolve recipients from CRM categories (via a membership-guarded RPC) or the workspace's full addressable CRM-contact list; plus manual email entry.
- **Setup / BYOK** — the workspace's own Resend API key + verified sender (`workspace_email_config`). **Mandatory** before any campaign or template surface is shown.
- **Resend contacts sync** — optionally push CRM contacts into the workspace's Resend audience; pull delivery/open/click/bounce stats back from the workspace's own Resend.

---

## 2. Module & routes

[`src/modules/email-marketing/index.ts`](../src/modules/email-marketing/index.ts) declares two routes with **no** `requireAdmin`, so `buildModuleRoutes()` wraps them in the `EntitlementGuard`: the active workspace must own the `email-marketing` module or an upsell is shown.

| Route | Component |
|---|---|
| `/marketing/email` | [`EmailMarketingPage`](../src/modules/email-marketing/pages/EmailMarketingPage.tsx) |
| `/marketing/email/templates/:id/edit` | [`MarketingTemplateBuilderPage`](../src/modules/email-marketing/pages/MarketingTemplateBuilderPage.tsx) |

The nav entry lives in `SIDEBAR_NAV_ITEMS` (`moduleSlug:'email-marketing'`, `requireCapability:'marketing.email'`), so `navItems` in the module definition is empty.

[`EmailMarketingPage`](../src/modules/email-marketing/pages/EmailMarketingPage.tsx) is a four-tab surface (Campaigns · Templates · Contacts · Setup) **but** BYOK is a hard prerequisite: until the workspace has a resolvable sender it shows **only** the setup prompt (`MarketingSetupCard`). "Ready to send" means `emailService.getWorkspaceConfig()` resolves `source === 'workspace'` — with one exception: the operator **root** workspace is allowed to send from the configured platform default sender (BYOK-only is a tenant rule, not an operator one).

---

## 3. Resend BYOK-only sending

The defining constraint of this add-on: **there is no shared platform sender for tenants.** A workspace must bring its own Resend key + verified `from_email`, stored in `workspace_email_config` (`resend_api_key`, `from_email`, `from_name`, `enabled`, `daily_send_limit`, …). Config is edited in **Profile → Keys** via the shared per-workspace BYOK card; RLS on `workspace_email_config` is `is_workspace_finance_manager(workspace_id)`.

Sender resolution + cap enforcement live in [`_shared/email-sender.ts`](../supabase/functions/_shared/email-sender.ts):

- `resolveWorkspaceEmailSender(supabase, workspaceId)` → returns `{ apiKey, fromEmail, fromName, source }`. **Workspace BYOK wins** when `enabled !== false` and both key + `from_email` are present (`source='workspace'`); otherwise it falls back to the platform `RESEND_API_KEY` + global `email_settings` sender (`source='platform'`).
- `checkWorkspaceSendQuota(supabase, workspaceId)` → enforces the **platform-controlled** daily cap: the per-workspace override (`workspace_email_config.daily_send_limit`) or the global `system_settings.email_workspace_daily_limit` (default 300), counted off today's `email_logs.workspace_id` rows.

### The `email-api` send gate

The nothing-here-calls-Resend-directly rule means every send goes through the [`email-api`](../supabase/functions/email-api/index.ts) `send` action, which accepts (relevant fields):

- `workspace_id` — resolves the workspace's BYOK sender, stamps `email_logs.workspace_id`, and applies the daily cap.
- `requireWorkspaceSender: true` — **BYOK-only gate**: if the resolved sender is not `source='workspace'` (and the workspace is not root), it returns **503** with `code='workspace_sender_required'` instead of falling back to the platform domain.
- `templateSlug` + `subjectOverride` — renders the template's HTML/text with `variables`, while the **campaign's** `subject_line` (passed as `subjectOverride`) wins over the template's own `subject_template`.
- When the daily cap is hit it returns **429** with `code='workspace_email_quota_exceeded'`.

---

## 4. Campaign lifecycle & the processor cron

### Creating a campaign (frontend)

[`marketingService`](../src/modules/email-marketing/services/marketingService.ts) writes everything workspace-scoped (RLS `is_workspace_member` enforces tenancy):

- `createCampaign()` inserts a `campaigns` row with `channel_type='email'`, `workspace_id`, `template_id`, `subject_line`, `preview_text`, `audience_filter` (`{category_ids, manual_emails}`), and a `status` derived from the schedule (`now`→`sending`, `later`→`scheduled`, otherwise `draft`), then bulk-inserts `campaign_recipients` (`email`, `contact_id`, `variables`, `status='pending'`) in 500-row chunks.
- `createTemplate()` inserts a workspace-scoped `email_templates` row (`category='marketing'`, a globally-unique auto slug `mkt-…`, `is_active=false`) and returns its id so the builder can open.
- Status transitions: `startCampaign` / `pauseCampaign` / `resumeCampaign` / `cancelCampaign` (guarded on `from` statuses), `deleteCampaign` (draft only).

### Audience resolution

- `resolveAudience(workspaceId, categoryIds)` → the membership-guarded `crm_categories_resolve_recipients_ws(p_workspace_id, p_category_ids)` RPC (the `crm_categories` table itself is admin-only, so it can't be read directly by a tenant).
- `listContacts(workspaceId)` → the full addressable audience: all `crm_contacts` in the workspace that have an email (workspace-RLS-scoped), de-duplicated by email.
- `listCategories()` → the `list_crm_categories` RPC (picker fields only).

### The `campaign-processor` cron

[`campaign-processor`](../supabase/functions/campaign-processor/index.ts) runs **every minute** (pg_cron; `config.toml` sets `verify_jwt=false`, and the handler enforces `isCronAuthorized` — service-role bearer OR the shared `x-cron-secret`). It **only** handles `channel_type='email'` campaigns (WhatsApp/messaging campaigns are driven by `messaging-processor`). Per tick it:

1. Flips `scheduled` campaigns whose `scheduled_at` has passed to `sending`.
2. For each `sending` campaign, in order:
   - **Entitlement paywall** — `is_workspace_entitled(workspace_id, 'email-marketing')`; if not entitled the campaign is blocked (`status='paused'`, `metadata.blocked_reason='not_entitled'`). The cron enforces this server-side even though the route/UI is entitlement-gated on the client.
   - **BYOK check** — `canWorkspaceSendMarketing` (workspace has an enabled key + `from_email`, or is the root workspace); else block with `workspace_sender_required` before touching any recipient.
   - **Template resolution** — resolves `email_templates.slug` from `template_id`; blocks on a missing/inactive template, or one whose `workspace_id` doesn't match the campaign (defense against a forged `template_id` pointing at another tenant).
   - **Credit metering** — charges the workspace **once per campaign** via `chargeCronWorkspace(…, 'email-campaign')`, guarded by `metadata.credit_charged` so the many ticks a large send spans never double-charge. Out of credits → leave `sending` with `blocked_reason='insufficient_credits'`; auto-resumes on top-up.
   - **Batch send** — pulls up to a **per-workspace** budget of `SEND_RATE_PER_MINUTE = 8` pending recipients (shared across all of that workspace's campaigns this tick), and POSTs each to `email-api` `send` with `templateSlug`, `subjectOverride=subject_line`, per-recipient `variables` (merged with `{{firstName}}`/`{{fullName}}`/`{{email}}` identity tags), `emailType:'marketing'`, `workspace_id`, and `requireWorkspaceSender:true`.
   - **Failure handling** — a 503 `workspace_sender_required` (BYOK removed mid-run) re-queues the recipient (back to `pending`) and blocks the campaign; a 429 `workspace_email_quota_exceeded` re-queues and stops the batch (retries next day); other errors mark the recipient `failed` with `error_message` + `retry_count`.
3. When a campaign has no pending recipients left, it's finalized to `sent` (or `partial_failure` if any recipient `failed`) with `sent_at`.

> A previous version of the processor POSTed keys `email-api` didn't read (`{template_id, subject, variables}`) and never passed `workspace_id`, so every campaign errored and would have used the platform key. #255 rewrote it to the workspace-scoped BYOK contract above and added its missing cron schedule.

### Stats

`marketingService.syncStats()` calls `email-api` `sync-campaign-stats` to pull delivery/open/click/bounce state from the **workspace's own** Resend and update `campaign_recipients`; `getStats()` aggregates those rows locally for the dashboard.

---

## 5. Tables & RLS

Reuses the shared campaign tables; the tenant-scoping came in with #255.

- **`campaigns`** — `workspace_id`, `channel_type`, `name`, `description`, `template_id`, `subject_line`, `preview_text`, `audience_filter`, `status`, `scheduled_at`, `sent_at`, `recipient_count`, `metadata`, … . RLS: `campaigns_member_select/insert/update/delete` gate on `is_workspace_member(workspace_id)` (delete restricted to `status='draft'`); `campaigns_member_insert` closed the earlier always-true INSERT BOLA (its `WITH CHECK` is `workspace_id IS NULL OR is_workspace_member(...)`). Legacy admin-only + service-role policies coexist for the internal campaign tooling.
- **`email_templates`** — `workspace_id`, `name`, `slug` (globally unique), `category`, `subject_template`, `html_template`, `text_template`, `variables`, `is_active`, … . RLS: `email_templates_select/insert/update/delete` gate on `is_workspace_member(workspace_id)` **or** platform admin/super_admin; a NULL-workspace template is world-readable (shared/system templates).
- **`campaign_recipients`** — per-recipient tracking (`email`, `contact_id`, `variables`, `status`, delivery timestamps, `error_message`, `retry_count`, `email_log_id`), FK to `campaigns` (cascade). See [Campaign System §Database Schema](campaign-system.md#database-schema).
- **`workspace_email_config`** — the BYOK row (`resend_api_key`, `from_email`, `from_name`, `enabled`, `daily_send_limit`, contacts-sync bookkeeping). RLS: `is_workspace_finance_manager(workspace_id)`.

---

## 6. Frontend components

Under [`src/modules/email-marketing/`](../src/modules/email-marketing/):

- `pages/EmailMarketingPage.tsx` — tabbed shell + BYOK gate.
- `pages/MarketingTemplateBuilderPage.tsx` — the reused GrapesJS builder over a workspace template.
- `components/MarketingSetupCard.tsx` — workspace Resend BYOK config (the activation step).
- `components/MarketingCampaignsTab.tsx` + `CreateMarketingCampaignModal.tsx` + `CampaignStatsDialog.tsx` — campaign list, creation wizard, per-campaign stats.
- `components/MarketingTemplatesTab.tsx` — workspace template list.
- `components/MarketingContactsTab.tsx` — Resend audience / CRM-contacts sync.
- `services/marketingService.ts` — the single workspace-scoped client.

---

## 7. vs the internal Campaign System

| | Email Marketing (this doc, #255) | [Campaign System](campaign-system.md) (internal) |
|---|---|---|
| Audience | Tenant workspace owners/finance managers | Platform admins |
| Route | `/marketing/email` (module, entitlement-gated) | `/admin/emails → Campaigns` (admin) |
| Tenancy | `workspace_id` + `is_workspace_member` RLS | admin-role RLS |
| Sender | **Resend BYOK-only** (`workspace_email_config`; 503 if unconfigured) | shared platform sender |
| Tables | `campaigns` / `email_templates` / `campaign_recipients` (shared, `workspace_id` + `channel_type='email'`) | same tables, admin-scoped rows |
| Processor | `campaign-processor` cron, per-workspace budget + entitlement + credit metering | historical SES-based flow described in [campaign-system.md](campaign-system.md) |

The two coexist on the same schema; they're separated by `campaigns.workspace_id` and the RLS policy that matches the caller. Keep new tenant-facing work in this module and its BYOK path; keep platform/system blasts in the internal tooling.
