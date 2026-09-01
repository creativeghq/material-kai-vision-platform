/**
 * THE tenant flow vocabulary. One source; everything else reads or is generated from it.
 *
 * This fact — "which triggers and actions may a workspace's own automation use?" — was typed out
 * by hand in FOUR places: the SQL enforcer, the agent tool's zod enum, the visual builder's
 * palette, and the guard test's own pin. Nothing made them agree, so they agreed by memory, and
 * the palette drifted wider than the enforcer: `payment_reversed`, `asset.warranty_expiring` and
 * `appointment_booked` were offered as draggable nodes that `enforce_tenant_flow_allowlist`
 * rejects. The node drags, the flow saves, and the write dies on a raw 42501 naming a constraint
 * the user has never heard of.
 *
 * Now: this file is the source, `paletteItems.ts` imports it, the Deno copy under
 * `_shared/tools/` is GENERATED (`npm run vocab:mirror`, part of `gen:all`), and the guard test
 * reads this file instead of restating it. Two things a human types — this and
 * `tenant_flow_allowed_triggers()` / `tenant_flow_allowed_actions()` in SQL — and the test pins
 * them to each other. The SQL half cannot be generated from here: it lives in the database and CI
 * has no Supabase token (the same blocker that stops `types:generate` running there).
 *
 * KEEP THIS FILE IMPORT-FREE. It is byte-copied across the Vite/Deno boundary — Vite resolves the
 * `@/` alias, Deno resolves by URL — so a single import makes the mirror unbuildable.
 *
 * ADMISSION RULE FOR A NEW TRIGGER — it is not "is this tenant-ish":
 * flow-engine matches a workspace-owned flow ONLY as
 *   `and(is_global.eq.false, workspace_id.eq.<ws>)`
 * and falls back to `eq('is_global', true)` for an event it cannot attribute to a workspace. So a
 * trigger qualifies only once a trusted server-side emitter puts `workspace_id` IN THE PAYLOAD —
 * verify the payload, not that an emitter exists. Without it the tenant flow never fires, and
 * through Reuse it is worse: `fork_workspace_flow_default` switches the platform default off in
 * the same transaction, so the owner ends up with FEWER notifications and nothing raises.
 * `appointment_booked` shipped in exactly that state (`appointments` has no workspace_id column).
 *
 * Guarded by tests/unit/flowEventContract.test.ts.
 */

/** Triggers a workspace-owned flow may listen for. Mirrors `tenant_flow_allowed_triggers()`. */
export const TENANT_TRIGGERS = [
  // Entry points: started, not emitted. `manual` is stamped onto every empty automation by
  // createFlowForWorkspace, so dropping it breaks "New automation" with a 42501.
  'manual', 'scheduled',
  // Finance
  'invoice_paid', 'payment_received', 'payment_sent', 'payment_reversed',
  'bank_payment_unmatched', 'card_spend_threshold', 'customer_credit_releasable',
  'finance_follow_up',
  // Quotes, orders, purchasing
  'quote_approved', 'quote_rejected', 'quote_sent', 'order_created', 'order_status_changed',
  'purchase_order.sent', 'purchase_order.received', 'supplier_po_received',
  'upstream_order_created', 'rfq_lines_requested', 'rfq_lines_priced', 'inventory_low_stock',
  'pricing_change_requested', 'pricing_change_decided',
  // Inbox
  'inbox.message_received', 'inbox.thread_assigned', 'inbox.order_intake_ready',
  'inbox.thread_labeled',
  // CRM, deals & contracts
  'crm_contact_created', 'crm_company_created', 'contract_signed', 'review_received',
  'deal_won', 'deal_lost', 'deal_stage_changed',
  // HR
  'hr.employee_added', 'hr.departure_recorded', 'hr.absence_requested', 'hr.absence_reviewed',
  'hr.overtime_recorded', 'hr.applicant_stage_changed', 'hr_late_checkin',
  // Installed base (#343) — a tenant's own customers' equipment.
  'asset.service_due', 'asset.service_overdue', 'asset.warranty_expiring',
  // Marketing, catalog, content
  'campaign_sent', 'catalog_sent_to_customers', 'client_view_feedback_received',
  'document_published', 'doc_suggestion_submitted', 'page_watch_changed',
  // Social & WhatsApp
  'social_post_published', 'social_post_failed', 'social_comment_received',
  'social_account_connected', 'social_account_disconnected',
  'whatsapp_number_status_changed', 'whatsapp_template_status_changed',
  // SEO
  'seo.article_refresh_due', 'seo.site_health_changed', 'seo.report_ready',
  'seo.ranking_movement', 'seo.backlink_movement',
  // Real estate
  'realestate.buyer_matches_found', 'realestate.new_listing_for_buyer',
  // Business events a workspace OWNS. Their emitters stamp workspace_id (verified 2026-08-31
  // by reading each emit payload); without that a tenant flow can never match and never fires.
  // `order_dispatched` is emitted from SQL by `_notify_order_dispatched`, which stamps it too.
  'order_dispatched', 'quote_requested', 'quote_pdf_generated',
  'moodboard_created', 'moodboard_shared', 'freight_quote_requested',
  'video_generation_completed', 'video_generation_failed',
] as const;

/**
 * Actions a workspace-owned flow may run. Mirrors `tenant_flow_allowed_actions()`.
 *
 * The first five tell a person; the last four write a record. Until 2026-08-31 only the first
 * five were here, so 64 triggers all ended the same way — a human is told, and the human does
 * the work. The record-writing four were already implemented in flow-engine, with palette items
 * and config forms; this list was the only thing making them unreachable.
 *
 * `create_planned_payment` is implemented and deliberately NOT here: it creates a money
 * obligation, which is a trust decision of its own rather than a rider on four safe actions.
 */
export const TENANT_ACTIONS = [
  'send_email', 'send_whatsapp', 'create_notification', 'send_agent_message', 'send_campaign',
  'create_task', 'advance_deal_stage', 'add_note', 'assign_user',
] as const;

/**
 * `send_sms` is the flow-engine ALIAS for send_whatsapp, and it exists only as a palette label —
 * it is not a fifth action and must never be added to TENANT_ACTIONS, which is pinned against SQL.
 */
export const PALETTE_ACTION_ALIASES = ['send_sms'] as const;

export type TenantTrigger = (typeof TENANT_TRIGGERS)[number];
export type TenantAction = (typeof TENANT_ACTIONS)[number];
