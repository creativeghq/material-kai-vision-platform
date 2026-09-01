// =====================================================
// Flow Status Types
// =====================================================
export type FlowStatus = 'draft' | 'active' | 'paused' | 'archived';
export type FlowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
export type FlowStepStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

// =====================================================
// Trigger Types
// =====================================================
export type TriggerType =
  | 'manual'
  | 'scheduled'
  | 'webhook'
  | 'user_signup'
  | 'user_login'
  | 'quote_requested'
  | 'quote_approved'
  | 'quote_rejected'
  // Deal pipeline (#311). Emitted by dealsService when a deal changes stage or closes.
  | 'deal_stage_changed'
  | 'deal_won'
  | 'deal_lost'
  | 'contract_signed'
  | 'search_executed'
  | 'model_3d_created'
  | 'vr_world_created'
  | 'agent_search_completed'
  | 'product_added_to_quote'
  | 'moodboard_created'
  | 'moodboard_item_added'
  | 'moodboard_shared'
  | 'moodboard_commented'
  | 'moodboard_quote_requested'
  | 'moodboard_dormancy_warning'
  | 'moodboard_dormancy_reminder'
  | 'hire_me_received'
  | 'profile_followed'
  | 'profile_published'
  | 'material_reviewed'
  | 'review_submitted'
  | 'preferred_factory_added'
  // ── Event vocabulary for notification→flow migration ──
  | 'quote_pdf_generated'
  | 'factory_approved'
  | 'factory_rejected'
  | 'appointment_booked'
  | 'appointment_confirmed'
  | 'appointment_cancelled'
  | 'svbrdf_extraction_complete'
  | 'virtual_staging_completed'
  | 'vr_world_failed'
  | 'video_generation_completed'
  | 'video_generation_failed'
  | 'background_agent_failed'
  | 'role_upgrade_request_submitted'
  | 'role_upgrade_approved'
  | 'role_upgrade_rejected'
  | 'stripe_payment_succeeded'
  | 'stripe_payment_failed'
  | 'project_invitation_sent'
  | 'project_invitation_resent'
  | 'workspace_invitation_sent'
  | 'inventory_low_stock'
  | 'freight_quote_requested'
  | 'order_dispatched'
  // multi-tenant inbox (dotted keys; payload-only, no custom config UI)
  | 'inbox.message_received'
  | 'inbox.thread_assigned'
  // #342: an order was read out of a customer conversation and is waiting for approval
  | 'inbox.order_intake_ready'
  // A review was left on a connected platform profile (Google Business). A low rating is the
  // one that needs somebody today, and nobody is watching a screen they do not know changed.
  | 'review_received'
  // Surplus marketplace: a new listing matched a buyer's saved alert
  | 'marketplace_want_match'
  // Expense cards (trip / monthly / …): submit→finance, review→rep, request→rep
  | 'expense_card_submitted'
  | 'expense_card_reviewed'
  | 'expense_card_requested'
  // pricing-pyramid discount-approval workflow
  | 'pricing_change_requested'
  | 'pricing_change_decided'
  // Account receivable/payable: finance asked to issue a receipt/invoice
  | 'finance_document_requested'
  // Finance documents: a tax invoice / retail receipt was issued, or a payment was received
  | 'invoice_issued'
  | 'receipt_issued'
  | 'payment_received'
  | 'payment_reversed'
  | 'payment_sent'
  // Sourcing / purchase orders
  | 'purchase_order.sent'
  | 'purchase_order.received'
  // Flows governance — automated paths routed through Flows
  | 'material_alert'
  | 'finance_follow_up'
  | 'invoice_paid'
  // e-Invoicing (#193): a legal document did not land on myDATA — AADE refused it on delayed
  // transmission, or it has been stuck offline so long it needs a human. `reason` in the
  // payload separates the two. Both burn a legal number, so both are loud.
  | 'fiscal_document_rejected'
  // e-Invoicing (#193): the OPERATOR's provider credit pool crossed a low tier. Not a tenant
  // event — when this pool empties, every tenant stops invoicing at once.
  | 'fiscal_credits_low'
  // Banking (#315): an incoming bank transfer matched no invoice (payload-only)
  | 'bank_payment_unmatched'
  // Banking (#315): a company-card spend of ≥€100 landed (filter higher via amount)
  | 'card_spend_threshold'
  | 'module_access_requested'
  // Someone asked to run the platform on their own infrastructure. Operator-facing:
  // the most valuable message this platform receives, so it gets its own trigger
  // rather than borrowing one whose name would misdescribe it in every flow list.
  | 'self_hosting_requested'
  // HR: an employee has not clocked in past their start time + grace (payload-only)
  | 'hr_late_checkin'
  // HR recruiting: a job applicant moved through the pipeline (payload-only, dotted key)
  | 'hr.applicant_stage_changed'
  // HR lifecycle (payload-only, dotted keys)
  | 'hr.employee_added'
  | 'hr.absence_requested'
  | 'hr.absence_reviewed'
  | 'hr.departure_recorded'
  | 'hr.overtime_recorded'
  // HR compliance: an Ergani (ΠΣ Εργάνη) submission was REJECTED by the ministry. Until this
  // existed a failed statutory filing only ever landed as a row in hr_ergani_submissions —
  // nobody was told, and an unfiled Ε3/Ε4/Ε8 is a compliance exposure, not a UI nicety.
  | 'hr.ergani_filing_failed'
  // Finance — order lifecycle (sales/purchase orders)
  | 'order_created'
  | 'order_status_changed'
  // Finance — a party is holding money of ours to no purpose: cash of theirs that is settled
  // against nothing, with nothing outstanding on their side. Raised when an order closes and
  // when the nightly sweep finds a quiet account. Until this existed, leftover money sat as a
  // liability on the customer's account forever and the only way to find it was to open the
  // record and notice.
  | 'customer_credit_releasable'
  // Docs module: a workspace doc was published, or a member proposed an edit
  | 'document_published'
  | 'doc_suggestion_submitted'
  // Email Marketing: a campaign finished sending; a recipient bounced or complained
  | 'campaign_sent'
  | 'email_bounced'
  | 'email_complained'
  // A feature tried to send email but the workspace has no email sender configured (notify owner/admins)
  | 'email_sender_not_configured'
  // Social publishing (Zernio): a scheduled post went live or failed on all platforms
  | 'social_post_published'
  | 'social_post_failed'
  // ── Zernio inbound (WhatsApp + social). These are the events the API already sends us;
  //    routing them here rather than adopting Zernio's own workflow engine is deliberate —
  //    theirs can only see Zernio's world, this one already knows what a deal or a quote is.
  //
  //    A public comment under one of OUR posts. Distinct from inbox.message_received on
  //    purpose: a reply to this is published to the account's whole audience, so a flow that
  //    auto-answers a DM must not silently also auto-answer in public.
  | 'social_comment_received'
  // A number Meta declined / suspended / released / re-activated. Every one of these except
  // re-activation STOPS ALL SENDING, and nothing else in the platform can tell you.
  | 'whatsapp_number_status_changed'
  // Meta approved, rejected, or silently RE-CATEGORISED a template. A recategorisation
  // re-prices every message sent on that template without changing anything visible.
  | 'whatsapp_template_status_changed'
  // A connected account appeared or dropped (either side: our OAuth, or Zernio's dashboard).
  | 'social_account_connected'
  | 'social_account_disconnected'
  // Project Client Views: a client approved / requested changes / commented on a deliverable
  | 'client_view_feedback_received'
  // Project Requests: a client/teammate raised a request, or the team answered one
  | 'project_created'
  | 'project_task_completed'
  | 'project_milestone_reached'
  | 'project_snag_raised'
  | 'project_expense_approved'
  | 'project_delivery_issued'
  | 'project_asset_registered'
  | 'project_status_changed'
  | 'project_request_raised'
  | 'project_request_answered'
  // CRM: a new contact / company was created
  | 'crm_contact_created'
  | 'crm_company_created'
  // Email Marketing engagement (high-volume — see note in the config interfaces below)
  | 'email_opened'
  | 'email_clicked'
  // Catalog sent to customers; a quote emailed to its customer
  | 'catalog_sent_to_customers'
  | 'quote_sent'
  // Monitoring alerts (bridged from the Python dispatchers via DB triggers on the *_alert_log tables)
  | 'price_alert_triggered'
  | 'mention_alert_triggered'
  | 'job_alert_triggered'
  // Upstream line-level RFQ: a workspace routed unpriced quote lines up to
  // its supplier/parent for pricing; the supplier returned prices (payload-only, dotted-free keys)
  | 'rfq_lines_requested'
  | 'rfq_lines_priced'
  // A reseller accepted a quote with operator-catalog lines, auto-creating a mirrored
  // SALES order + draft invoice in the supplier/operator workspace (notify the supplier admins)
  | 'upstream_order_created'
  // A buyer handed a purchase order off in-app to a workspace's CLAIMED supplier identity —
  // a draft sales order materialized there (notify the supplier admins)
  | 'supplier_po_received'
  // A verified manufacturer published product FACTS to the shared master catalog (#324) —
  // these supersede our own extraction platform-wide
  | 'catalog_master_updated'
  // A verified manufacturer published a new PRICE. It is an offer to the OPERATOR only;
  // no tenant's negotiated cost changes until the operator accepts it
  | 'supplier_price_changed'
  | 'realestate.buyer_matches_found'
  | 'realestate.new_listing_for_buyer'
  | 'realestate.listing_published'
  // SEO movement alerts — detected week-over-week by the seo-domain-tracker / seo-site-audit
  // crons and fanned out to the site's workspace members (payload-only, server-only events)
  | 'seo.ranking_movement'
  | 'seo.backlink_movement'
  | 'seo.site_health_changed'
  // Content decay (#349 C1): a generated article has passed its own refresh cadence.
  // Emitted by seo-content-freshness; payload-only. Nothing was ever revisited before
  // this existed — an article silently stopped being cited and nobody was told.
  | 'seo.article_refresh_due'
  // A scheduled SEO report finished building. Payload carries the run id and a
  // one-line summary, so a flow can mail it, post it, or notify — the report
  // itself is stored, never re-derived by the delivery path.
  | 'seo.report_ready'
  // A watched non-price page changed — supplier T&C, a regulatory notice, partner
  // API docs, a competitor page (#331). Fired by the Firecrawl monitoring webhook.
  | 'page_watch_changed'
  // Installed base (#343): a customer's equipment needs recurring service, or its warranty
  // is running out. Emitted by asset-service-reminders-cron; payload carries both the internal
  // recipient and the customer's email so one flow can serve either audience.
  | 'asset.service_due'
  | 'asset.service_overdue'
  | 'asset.warranty_expiring';

export interface ManualTriggerConfig {}
export interface ModuleAccessRequestedTriggerConfig {}
export interface SelfHostingRequestedTriggerConfig {}
export interface HrLateCheckinTriggerConfig {}
export interface RealestateBuyerMatchesFoundTriggerConfig {}
export interface RealestateNewListingForBuyerTriggerConfig {}
export interface RealestateListingPublishedTriggerConfig {}
export interface SeoRankingMovementTriggerConfig {}
export interface SeoBacklinkMovementTriggerConfig {}
export interface SeoSiteHealthChangedTriggerConfig {}
export interface SeoArticleRefreshDueTriggerConfig {}
export interface SeoReportReadyTriggerConfig {}
export interface HrApplicantStageChangedTriggerConfig {}
export interface HrEmployeeAddedTriggerConfig {}
export interface HrAbsenceRequestedTriggerConfig {}
export interface HrAbsenceReviewedTriggerConfig {}
export interface HrDepartureRecordedTriggerConfig {}
export interface HrOvertimeRecordedTriggerConfig {}
export interface HrErganiFilingFailedTriggerConfig {}
export interface OrderCreatedTriggerConfig {}
export interface OrderStatusChangedTriggerConfig {}
export interface CustomerCreditReleasableTriggerConfig {}
export interface DocumentPublishedTriggerConfig {}
export interface DocSuggestionSubmittedTriggerConfig {}
export interface CampaignSentTriggerConfig {}
export interface EmailSenderNotConfiguredTriggerConfig {}
export interface EmailBouncedTriggerConfig {}
export interface EmailComplainedTriggerConfig {}
export interface SocialPostPublishedTriggerConfig {}
export interface SocialPostFailedTriggerConfig {}
export interface SocialCommentReceivedTriggerConfig {}
export interface WhatsappNumberStatusChangedTriggerConfig {}
export interface WhatsappTemplateStatusChangedTriggerConfig {}
export interface SocialAccountConnectedTriggerConfig {}
export interface SocialAccountDisconnectedTriggerConfig {}
export interface ClientViewFeedbackReceivedTriggerConfig {}
/**
 * A job moved to a new status (#378, Phase 4 — project lifecycle).
 *
 * Projects emitted almost nothing: of the platform's trigger vocabulary the only project events
 * were two invitation ones and two request ones, so "the job is now on site" — the thing everyone
 * downstream waits for — could not start an automation.
 *
 * `to_status` narrows it, because "any status change" fires on every drag of every card and a flow
 * run is metered. Empty means every change, which is the honest default for a filter.
 */
/** A new job was created. */
export interface ProjectCreatedTriggerConfig {}
/** A task on a job was marked done. */
export interface ProjectTaskCompletedTriggerConfig {}
/** A task marked as a milestone was completed. */
export interface ProjectMilestoneReachedTriggerConfig {}
/** A defect was raised on site. */
export interface ProjectSnagRaisedTriggerConfig {}
/** An expense was approved as a cost on a job. */
export interface ProjectExpenseApprovedTriggerConfig {}
/** A delivery note was issued on a job. */
export interface ProjectDeliveryIssuedTriggerConfig {}
/** A unit of installed base was registered on a job. */
export interface ProjectAssetRegisteredTriggerConfig {}
export interface ProjectStatusChangedTriggerConfig {
  /** Only fire when the job moves INTO this status. Empty = any change. */
  to_status?: string;
}
export interface ProjectRequestRaisedTriggerConfig {}
export interface ProjectRequestAnsweredTriggerConfig {}
export interface CrmContactCreatedTriggerConfig {}
export interface CrmCompanyCreatedTriggerConfig {}
/** Opens/clicks are HIGH-VOLUME. Each event fires a metered flow run — pair with a
 *  Filter node (e.g. only a specific campaign) to avoid running on every open. */
export interface EmailOpenedTriggerConfig {}
export interface EmailClickedTriggerConfig {}
export interface CatalogSentToCustomersTriggerConfig {}
export interface QuoteSentTriggerConfig {}
export interface PriceAlertTriggeredTriggerConfig {}
export interface MentionAlertTriggeredTriggerConfig {}
export interface JobAlertTriggeredTriggerConfig {}
export interface RfqLinesRequestedTriggerConfig {}
export interface RfqLinesPricedTriggerConfig {}
export interface UpstreamOrderCreatedTriggerConfig {}
export interface SupplierPoReceivedTriggerConfig {}
export interface CatalogMasterUpdatedTriggerConfig {}
export interface SupplierPriceChangedTriggerConfig {}
export interface PageWatchChangedTriggerConfig {}
/** Payload-only. Fires once per occurrence when `due_on - lead_days` is reached. */
export interface AssetServiceDueTriggerConfig {}
/** Payload-only. Fires once per occurrence when `due_on` has passed and it is still open. */
export interface AssetServiceOverdueTriggerConfig {}
/** Payload-only. Fires once per configured offset in `remind_days_before`. */
export interface AssetWarrantyExpiringTriggerConfig {}
export interface InventoryLowStockTriggerConfig {}
export interface FreightQuoteRequestedTriggerConfig {}
export interface OrderDispatchedTriggerConfig {}
export interface InboxMessageReceivedTriggerConfig {}
export interface InboxThreadAssignedTriggerConfig {}
export interface InboxOrderIntakeReadyTriggerConfig {}
export interface ReviewReceivedTriggerConfig {
  /**
   * Only fire on these star ratings — the usual answer is the low ones, since a 1-star needs
   * somebody today and a 5-star does not. Unset or empty = every review.
   * Same list-not-threshold reason as `MaterialReviewedTriggerConfig.rating`.
   */
  rating?: number[];
}
export interface MarketplaceWantMatchTriggerConfig {}
export interface ExpenseCardSubmittedTriggerConfig {}
export interface ExpenseCardReviewedTriggerConfig {}
export interface ExpenseCardRequestedTriggerConfig {}
export interface PricingChangeRequestedTriggerConfig {}
export interface PricingChangeDecidedTriggerConfig {}
export interface FinanceDocumentRequestedTriggerConfig {}
export interface InvoiceIssuedTriggerConfig {}
export interface ReceiptIssuedTriggerConfig {}
export interface PaymentReceivedTriggerConfig {}
/** Refund or chargeback. Emitted by stripe-webhooks. */
export interface PaymentReversedTriggerConfig {}
export interface PaymentSentTriggerConfig {}
export interface PurchaseOrderSentTriggerConfig {}
export interface PurchaseOrderReceivedTriggerConfig {}
export interface MaterialAlertTriggerConfig {}
export interface FinanceFollowUpTriggerConfig {}
export interface InvoicePaidTriggerConfig {}
/** Payload-only. `reason` is 'rejected' (AADE refused it) or 'stuck_offline' (no verdict). */
export interface FiscalDocumentRejectedTriggerConfig {}
/** Payload-only. Carries `balance` + the `tier` that was crossed. */
export interface FiscalCreditsLowTriggerConfig {}
export interface BankPaymentUnmatchedTriggerConfig {}
export interface CardSpendThresholdTriggerConfig {}
export interface ReviewSubmittedTriggerConfig {}

export interface ScheduledTriggerConfig {
  cron: string;
  timezone?: string;
}

export interface WebhookTriggerConfig {
  webhook_id?: string;
  secret?: string;
  method?: 'POST' | 'GET';
}

export interface UserSignupTriggerConfig {
  filter_role?: string;
}

export interface UserLoginTriggerConfig {
  filter_role?: string;
}

export interface QuoteRequestedTriggerConfig {
  filter_status?: string;
}

export interface QuoteApprovedTriggerConfig {}
/** Narrow a deal trigger to one deal type, e.g. only fire for Real Estate. Empty = all. */
/**
 * Narrow a deal trigger to a subset of its events. Every key here is matched by EQUALITY
 * against the same-named key in the event payload (flow-engine), so these names are not
 * decorative — `stage` filters on `trigger.data.stage`. Blank means "any".
 */
export interface DealStageChangedTriggerConfig { deal_type_key?: string; stage?: string }
export interface DealWonTriggerConfig { deal_type_key?: string }
export interface DealLostTriggerConfig { deal_type_key?: string }
export interface QuoteRejectedTriggerConfig {}
export interface ContractSignedTriggerConfig {}

export interface SearchExecutedTriggerConfig {
  filter_agent?: string;
}

export interface Model3DCreatedTriggerConfig {}
export interface VRWorldCreatedTriggerConfig {}

export interface AgentSearchCompletedTriggerConfig {
  filter_agent?: string;
}

export interface ProductAddedToQuoteTriggerConfig {
  filter_added_from?: 'search' | 'agent' | '3d_generation' | 'manual' | 'product_page' | 'moodboard';
}

export interface MoodboardCreatedTriggerConfig {}

export interface MoodboardItemAddedTriggerConfig {
  filter_moodboard_id?: string;
}

export interface MoodboardQuoteRequestedTriggerConfig {}

export interface MoodboardSharedTriggerConfig {}

export interface MoodboardDormancyWarningTriggerConfig {}
export interface MoodboardDormancyReminderTriggerConfig {}

export interface MoodboardCommentedTriggerConfig {
  filter_moodboard_id?: string;
}

export interface HireMeReceivedTriggerConfig {
  /** Only fire when specific services were selected */
  filter_has_services?: boolean;
}

export interface ProfileFollowedTriggerConfig {}

export interface ProfilePublishedTriggerConfig {}

export interface MaterialReviewedTriggerConfig {
  /**
   * Only fire on these star ratings. Unset or empty = every review.
   *
   * A LIST, not a `min`, because flow-engine's `trigger_config` matcher is deliberately
   * domain-free: every key must EQUAL (or, for an array, contain) the same-named key in the
   * event payload. The old `filter_min_rating: 4` therefore asked for an event whose
   * `filter_min_rating` was 4 — a key nothing emits — so the flow matched nothing, forever, and
   * reported `{triggered: 0}` without an error. No stored flow used it (checked 2026-08-24).
   */
  rating?: number[];
}

export interface PreferredFactoryAddedTriggerConfig {}

// ── Notification→flow migration events. These carry their
// full notification payload in trigger.data, so no filter config is needed. ──
export interface QuotePdfGeneratedTriggerConfig {}
export interface FactoryApprovedTriggerConfig {}
export interface FactoryRejectedTriggerConfig {}
export interface AppointmentBookedTriggerConfig {}
export interface AppointmentConfirmedTriggerConfig {}
export interface AppointmentCancelledTriggerConfig {}
export interface SvbrdfExtractionCompleteTriggerConfig {}
export interface VirtualStagingCompletedTriggerConfig {}
export interface VRWorldFailedTriggerConfig {}
export interface VideoGenerationCompletedTriggerConfig {}
export interface VideoGenerationFailedTriggerConfig {}
export interface BackgroundAgentFailedTriggerConfig {}
export interface RoleUpgradeRequestSubmittedTriggerConfig {}
export interface RoleUpgradeApprovedTriggerConfig {}
export interface RoleUpgradeRejectedTriggerConfig {}
export interface StripePaymentSucceededTriggerConfig {}
export interface StripePaymentFailedTriggerConfig {}
export interface ProjectInvitationSentTriggerConfig {}
export interface ProjectInvitationResentTriggerConfig {}
/** Team invitation into a workspace with a role/portal (owner/admin invites a colleague). */
export interface WorkspaceInvitationSentTriggerConfig {}

export type TriggerConfigMap = {
  manual: ManualTriggerConfig;
  scheduled: ScheduledTriggerConfig;
  webhook: WebhookTriggerConfig;
  user_signup: UserSignupTriggerConfig;
  user_login: UserLoginTriggerConfig;
  quote_requested: QuoteRequestedTriggerConfig;
  quote_approved: QuoteApprovedTriggerConfig;
  quote_rejected: QuoteRejectedTriggerConfig;
  deal_stage_changed: DealStageChangedTriggerConfig;
  deal_won: DealWonTriggerConfig;
  deal_lost: DealLostTriggerConfig;
  contract_signed: ContractSignedTriggerConfig;
  search_executed: SearchExecutedTriggerConfig;
  model_3d_created: Model3DCreatedTriggerConfig;
  vr_world_created: VRWorldCreatedTriggerConfig;
  agent_search_completed: AgentSearchCompletedTriggerConfig;
  product_added_to_quote: ProductAddedToQuoteTriggerConfig;
  moodboard_created: MoodboardCreatedTriggerConfig;
  moodboard_item_added: MoodboardItemAddedTriggerConfig;
  moodboard_shared: MoodboardSharedTriggerConfig;
  moodboard_commented: MoodboardCommentedTriggerConfig;
  moodboard_quote_requested: MoodboardQuoteRequestedTriggerConfig;
  moodboard_dormancy_warning: MoodboardDormancyWarningTriggerConfig;
  moodboard_dormancy_reminder: MoodboardDormancyReminderTriggerConfig;
  hire_me_received: HireMeReceivedTriggerConfig;
  profile_followed: ProfileFollowedTriggerConfig;
  profile_published: ProfilePublishedTriggerConfig;
  material_reviewed: MaterialReviewedTriggerConfig;
  review_submitted: ReviewSubmittedTriggerConfig;
  preferred_factory_added: PreferredFactoryAddedTriggerConfig;
  quote_pdf_generated: QuotePdfGeneratedTriggerConfig;
  factory_approved: FactoryApprovedTriggerConfig;
  factory_rejected: FactoryRejectedTriggerConfig;
  appointment_booked: AppointmentBookedTriggerConfig;
  appointment_confirmed: AppointmentConfirmedTriggerConfig;
  appointment_cancelled: AppointmentCancelledTriggerConfig;
  svbrdf_extraction_complete: SvbrdfExtractionCompleteTriggerConfig;
  virtual_staging_completed: VirtualStagingCompletedTriggerConfig;
  vr_world_failed: VRWorldFailedTriggerConfig;
  video_generation_completed: VideoGenerationCompletedTriggerConfig;
  video_generation_failed: VideoGenerationFailedTriggerConfig;
  background_agent_failed: BackgroundAgentFailedTriggerConfig;
  role_upgrade_request_submitted: RoleUpgradeRequestSubmittedTriggerConfig;
  role_upgrade_approved: RoleUpgradeApprovedTriggerConfig;
  role_upgrade_rejected: RoleUpgradeRejectedTriggerConfig;
  stripe_payment_succeeded: StripePaymentSucceededTriggerConfig;
  stripe_payment_failed: StripePaymentFailedTriggerConfig;
  project_invitation_sent: ProjectInvitationSentTriggerConfig;
  project_invitation_resent: ProjectInvitationResentTriggerConfig;
  workspace_invitation_sent: WorkspaceInvitationSentTriggerConfig;
  inventory_low_stock: InventoryLowStockTriggerConfig;
  freight_quote_requested: FreightQuoteRequestedTriggerConfig;
  order_dispatched: OrderDispatchedTriggerConfig;
  'inbox.message_received': InboxMessageReceivedTriggerConfig;
  'inbox.thread_assigned': InboxThreadAssignedTriggerConfig;
  'inbox.order_intake_ready': InboxOrderIntakeReadyTriggerConfig;
  review_received: ReviewReceivedTriggerConfig;
  marketplace_want_match: MarketplaceWantMatchTriggerConfig;
  expense_card_submitted: ExpenseCardSubmittedTriggerConfig;
  expense_card_reviewed: ExpenseCardReviewedTriggerConfig;
  expense_card_requested: ExpenseCardRequestedTriggerConfig;
  pricing_change_requested: PricingChangeRequestedTriggerConfig;
  pricing_change_decided: PricingChangeDecidedTriggerConfig;
  finance_document_requested: FinanceDocumentRequestedTriggerConfig;
  invoice_issued: InvoiceIssuedTriggerConfig;
  receipt_issued: ReceiptIssuedTriggerConfig;
  payment_received: PaymentReceivedTriggerConfig;
  payment_reversed: PaymentReversedTriggerConfig;
  payment_sent: PaymentSentTriggerConfig;
  'purchase_order.sent': PurchaseOrderSentTriggerConfig;
  'purchase_order.received': PurchaseOrderReceivedTriggerConfig;
  material_alert: MaterialAlertTriggerConfig;
  finance_follow_up: FinanceFollowUpTriggerConfig;
  invoice_paid: InvoicePaidTriggerConfig;
  fiscal_document_rejected: FiscalDocumentRejectedTriggerConfig;
  fiscal_credits_low: FiscalCreditsLowTriggerConfig;
  bank_payment_unmatched: BankPaymentUnmatchedTriggerConfig;
  card_spend_threshold: CardSpendThresholdTriggerConfig;
  module_access_requested: ModuleAccessRequestedTriggerConfig;
  self_hosting_requested: SelfHostingRequestedTriggerConfig;
  hr_late_checkin: HrLateCheckinTriggerConfig;
  'hr.applicant_stage_changed': HrApplicantStageChangedTriggerConfig;
  'hr.employee_added': HrEmployeeAddedTriggerConfig;
  'hr.absence_requested': HrAbsenceRequestedTriggerConfig;
  'hr.absence_reviewed': HrAbsenceReviewedTriggerConfig;
  'hr.departure_recorded': HrDepartureRecordedTriggerConfig;
  'hr.overtime_recorded': HrOvertimeRecordedTriggerConfig;
  'hr.ergani_filing_failed': HrErganiFilingFailedTriggerConfig;
  order_created: OrderCreatedTriggerConfig;
  order_status_changed: OrderStatusChangedTriggerConfig;
  customer_credit_releasable: CustomerCreditReleasableTriggerConfig;
  document_published: DocumentPublishedTriggerConfig;
  doc_suggestion_submitted: DocSuggestionSubmittedTriggerConfig;
  campaign_sent: CampaignSentTriggerConfig;
  email_sender_not_configured: EmailSenderNotConfiguredTriggerConfig;
  email_bounced: EmailBouncedTriggerConfig;
  email_complained: EmailComplainedTriggerConfig;
  social_post_published: SocialPostPublishedTriggerConfig;
  social_post_failed: SocialPostFailedTriggerConfig;
  social_comment_received: SocialCommentReceivedTriggerConfig;
  whatsapp_number_status_changed: WhatsappNumberStatusChangedTriggerConfig;
  whatsapp_template_status_changed: WhatsappTemplateStatusChangedTriggerConfig;
  social_account_connected: SocialAccountConnectedTriggerConfig;
  social_account_disconnected: SocialAccountDisconnectedTriggerConfig;
  client_view_feedback_received: ClientViewFeedbackReceivedTriggerConfig;
  project_created: ProjectCreatedTriggerConfig;
  project_task_completed: ProjectTaskCompletedTriggerConfig;
  project_milestone_reached: ProjectMilestoneReachedTriggerConfig;
  project_snag_raised: ProjectSnagRaisedTriggerConfig;
  project_expense_approved: ProjectExpenseApprovedTriggerConfig;
  project_delivery_issued: ProjectDeliveryIssuedTriggerConfig;
  project_asset_registered: ProjectAssetRegisteredTriggerConfig;
  project_status_changed: ProjectStatusChangedTriggerConfig;
  project_request_raised: ProjectRequestRaisedTriggerConfig;
  project_request_answered: ProjectRequestAnsweredTriggerConfig;
  crm_contact_created: CrmContactCreatedTriggerConfig;
  crm_company_created: CrmCompanyCreatedTriggerConfig;
  email_opened: EmailOpenedTriggerConfig;
  email_clicked: EmailClickedTriggerConfig;
  catalog_sent_to_customers: CatalogSentToCustomersTriggerConfig;
  quote_sent: QuoteSentTriggerConfig;
  price_alert_triggered: PriceAlertTriggeredTriggerConfig;
  mention_alert_triggered: MentionAlertTriggeredTriggerConfig;
  job_alert_triggered: JobAlertTriggeredTriggerConfig;
  rfq_lines_requested: RfqLinesRequestedTriggerConfig;
  rfq_lines_priced: RfqLinesPricedTriggerConfig;
  upstream_order_created: UpstreamOrderCreatedTriggerConfig;
  supplier_po_received: SupplierPoReceivedTriggerConfig;
  catalog_master_updated: CatalogMasterUpdatedTriggerConfig;
  supplier_price_changed: SupplierPriceChangedTriggerConfig;
  'realestate.buyer_matches_found': RealestateBuyerMatchesFoundTriggerConfig;
  'realestate.new_listing_for_buyer': RealestateNewListingForBuyerTriggerConfig;
  'realestate.listing_published': RealestateListingPublishedTriggerConfig;
  'seo.ranking_movement': SeoRankingMovementTriggerConfig;
  'seo.backlink_movement': SeoBacklinkMovementTriggerConfig;
  'seo.site_health_changed': SeoSiteHealthChangedTriggerConfig;
  'seo.article_refresh_due': SeoArticleRefreshDueTriggerConfig;
  'seo.report_ready': SeoReportReadyTriggerConfig;
  page_watch_changed: PageWatchChangedTriggerConfig;
  'asset.service_due': AssetServiceDueTriggerConfig;
  'asset.service_overdue': AssetServiceOverdueTriggerConfig;
  'asset.warranty_expiring': AssetWarrantyExpiringTriggerConfig;
};

// =====================================================
// Condition Types
// =====================================================
export type ConditionType =
  | 'if_else'
  | 'switch'
  | 'filter'
  | 'delay'
  | 'ab_split'
  | 'loop'
  | 'stop';

export type ComparisonOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty';

export interface IfElseConfig {
  field: string;
  operator: ComparisonOperator;
  value: string;
}

export interface SwitchConfig {
  field: string;
  cases: Array<{ value: string; label: string }>;
  default_label?: string;
}

export interface FilterConfig {
  conditions: Array<{
    field: string;
    operator: ComparisonOperator;
    value: string;
  }>;
  logic: 'and' | 'or';
}

export interface DelayConfig {
  duration: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days';
}

export interface ABSplitConfig {
  split_percentage: number;
}

export interface LoopConfig {
  collection_field: string;
  item_variable: string;
  max_iterations: number;
}

export interface StopConfig {
  reason?: string;
}

// =====================================================
// Action Types
// =====================================================
export type ActionType =
  | 'send_sms'
  | 'send_whatsapp'
  | 'send_email'
  | 'send_campaign'
  | 'send_price_alert'
  | 'send_push'
  | 'send_quote'
  | 'build_quote'
  | 'approve_quote'
  | 'http_request'
  | 'create_notification'
  | 'assign_user'
  | 'add_tag'
  | 'add_note'
  | 'update_contact'
  | 'update_product'
  | 'create_task'
  | 'advance_deal_stage'
  | 'create_planned_payment'
  | 'link_document'
  | 'run_edge_function'
  | 'log_event'
  | 'send_agent_message'
  | 'create_moodboard'
  | 'add_to_moodboard'
  | 'web_search'
  | 'firecrawl_scrape'
  | 'apollo_enrich'
  | 'hunter_find_contacts'
  | 'zerobounce_validate';

export interface SendSmsConfig {
  to: string;
  message: string;
  channel_id?: string;
}

/** Messaging module — WhatsApp via Zernio; there is no Twilio/SMS path.
 *  `send_sms` remains a legacy alias in the engine; new flows use this. */
export interface SendWhatsAppConfig {
  to: string;
  message: string;
  /** Meta-approved template name (required for cold/marketing sends outside the 24h window). */
  template_id?: string;
  from?: string;
}

/** Email Marketing module — flips an existing draft/paused/scheduled campaign
 *  (owned by the flow's workspace) to 'sending' so campaign-processor fans it out via
 *  the workspace's BYOK Resend. Tenant-scoped flows only. */
export interface SendCampaignConfig {
  campaign_id: string;
}

/** Price Monitoring module — module-gated price alert (bell + audit log). Required
 *  fields resolve from trigger.data; product_id OR tracked_query_id identifies the subject. */
export interface SendPriceAlertConfig {
  user_id: string;
  alert_type: 'price_drop' | 'new_retailer' | 'promo_started' | 'anomaly_detected';
  title: string;
  body: string;
  product_id?: string;
  tracked_query_id?: string;
  retailer_name?: string;
  retailer_domain?: string;
  action_url?: string;
}

export interface SendEmailConfig {
  to: string;
  subject: string;
  body: string;
  template_id?: string;
  from?: string;
  /** JSON object mapping email-template {{tag}} names → values (values may use {{trigger.data.*}}). */
  variables?: string;
}

export interface SendPushConfig {
  user_id: string;
  title: string;
  body: string;
  url?: string;
}

export interface SendQuoteConfig {
  quote_id: string;
  send_email: boolean;
  send_sms: boolean;
}

export interface BuildQuoteConfig {
  user_id: string;
  items: string;
  name?: string;
}

export interface ApproveQuoteConfig {
  quote_id: string;
}

export interface CreateNotificationConfig {
  user_id: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface HttpRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  timeout_ms?: number;
}

export interface AssignUserConfig {
  user_id: string;
  assign_to: string;
  entity_type: 'quote' | 'contact' | 'task';
  entity_id: string;
}

export interface AddTagConfig {
  entity_type: 'contact' | 'product' | 'quote';
  entity_id: string;
  tag: string;
}

export interface AddNoteConfig {
  entity_type: 'contact' | 'quote';
  entity_id: string;
  note: string;
}

export interface UpdateContactConfig {
  contact_id: string;
  fields: Record<string, string>;
}

export interface UpdateProductConfig {
  product_id: string;
  fields: Record<string, string>;
}

/**
 * Put work on somebody's list (#378 Phase 4).
 *
 * The first action that CREATES a business record outside quotes and moodboards. The action
 * vocabulary was otherwise communication and enrichment, so every automation — however good its
 * trigger — ended with a human being told and the human doing the work.
 *
 * A task deliberately, and not an invoice: money-moving and legally-numbered documents produce a
 * PREFILL, never a finished record. A task is the safe end of that spectrum — reversible, owned by
 * a person, and worthless to forge.
 */
export interface CreateTaskConfig {
  /** The job the task belongs to. Verified against the flow's workspace before anything is written. */
  project_id: string;
  title: string;
  description?: string;
  /** `YYYY-MM-DD`. Nothing derives "today" here — a UTC date files a Greek job's task to yesterday. */
  due_date?: string;
  assignee_id?: string;
  /** Default 'internal'. A flow that silently starts showing work to the client is the wrong
   *  direction to be wrong in. */
  visibility?: 'internal' | 'client_visible';
}

/**
 * Move a deal along the pipeline (#378 Phase 4).
 *
 * Stages are per deal TYPE — a composite FK on (deal_type_id, stage) means a construction deal
 * physically cannot be moved into "Conveyancing". The database refuses an illegal destination, so
 * this config does not need to police it and must not pretend to.
 */
export interface AdvanceDealStageConfig {
  deal_id: string;
  /** A stage KEY belonging to this deal's type. The DB rejects anything else. */
  stage: string;
}

/**
 * Schedule money that is expected to move (#378 Phase 4).
 *
 * Allowed where create_expense and raise_purchase_order are not, and the distinction is not a
 * technicality: a planned payment MOVES NO MONEY. It is an entry in the cash-flow forecast, and
 * `paid_payment_id` links it to the real payment if one happens. Nothing is numbered and nothing
 * is transmitted to AADE. An invoice conjured behind the operator is a different animal — those
 * stay prefills.
 */
export interface CreatePlannedPaymentConfig {
  title: string;
  amount: number;
  /** 'in' = money we expect to receive, 'out' = money we expect to pay. */
  direction: 'in' | 'out';
  /** `YYYY-MM-DD`. Required — nothing derives "today" here, and a schedule with no date is not one. */
  scheduled_for: string;
  currency?: string;
  notes?: string;
  /** Optional settlement target. Verified against the flow's workspace before anything is written. */
  invoice_id?: string;
  supplier_bill_id?: string;
}

/**
 * Attach a document to the job or the deal it belongs to (#378 Phase 4).
 *
 * Creates nothing and moves nothing — it writes one foreign key the document already has. Mostly
 * for the DEAL: since #378 Phase 1 the SQL chain functions carry `project_id` down from the parent
 * themselves, so a flow re-doing that is redundant, while nothing derives the deal link at all.
 */
export interface LinkDocumentConfig {
  document_kind: 'invoice' | 'order' | 'quote' | 'expense';
  document_id: string;
  target_kind: 'project' | 'deal';
  /** Blank detaches — "deal lost, detach the quote" is as real as attaching it. */
  target_id?: string;
}

export interface RunEdgeFunctionConfig {
  function_name: string;
  payload: string;
}

export interface LogEventConfig {
  /** Table to insert the marker/audit row into (e.g. quote_activities, material_alerts). */
  table: string;
  /** JSON object of templated columns to insert. Supports {{trigger.data.x}} templates. */
  row: string;
}

export interface SendAgentMessageConfig {
  conversation_id: string;
  message: string;
  role: 'user' | 'system';
  trigger_agent_response: boolean;
  agent_id?: string;
  use_active_conversation?: boolean;
  target_user_id?: string;
}

export interface CreateMoodboardConfig {
  title: string;
  description?: string;
  is_public: boolean;
  user_id: string;
}

export interface AddToMoodboardConfig {
  moodboard_id: string;
  product_id: string;
  notes?: string;
}

export interface WebSearchConfig {
  category: string;
  country?: string;
  region?: string;
  limit?: number;
}

export interface FirecrawlScrapeConfig {
  url: string;
  extract?: string;
}

export interface ApolloEnrichConfig {
  company_name: string;
  domain?: string;
  country?: string;
}

export interface HunterFindContactsConfig {
  domain?: string;
  company_name?: string;
  first_name?: string;
  last_name?: string;
  roles?: string;
}

export interface ZeroBounceValidateConfig {
  email: string;
}

// =====================================================
// Node Data Types (stored in xyflow node.data)
// =====================================================
export type FlowNodeCategory = 'trigger' | 'condition' | 'action';

// Index signature is required so FlowNodeData satisfies xyflow's
// `Record<string, unknown>` constraint on Node<T> data.
export interface BaseNodeData {
  label: string;
  description?: string;
  category: FlowNodeCategory;
  [key: string]: unknown;
}

export interface TriggerNodeData extends BaseNodeData {
  category: 'trigger';
  triggerType: TriggerType;
  config: TriggerConfigMap[TriggerType];
}

export interface ConditionNodeData extends BaseNodeData {
  category: 'condition';
  conditionType: ConditionType;
  config: IfElseConfig | SwitchConfig | FilterConfig | DelayConfig | ABSplitConfig | LoopConfig | StopConfig;
}

export interface ActionNodeData extends BaseNodeData {
  category: 'action';
  actionType: ActionType;
  config: SendSmsConfig | SendWhatsAppConfig | SendEmailConfig | SendCampaignConfig | SendPriceAlertConfig | SendPushConfig | SendQuoteConfig | BuildQuoteConfig | ApproveQuoteConfig | CreateNotificationConfig | HttpRequestConfig | AssignUserConfig | AddTagConfig | AddNoteConfig | UpdateContactConfig | UpdateProductConfig | RunEdgeFunctionConfig | LogEventConfig | SendAgentMessageConfig | CreateMoodboardConfig | AddToMoodboardConfig | WebSearchConfig | FirecrawlScrapeConfig | ApolloEnrichConfig | HunterFindContactsConfig | ZeroBounceValidateConfig;
}

export type FlowNodeData = TriggerNodeData | ConditionNodeData | ActionNodeData;

// =====================================================
// xyflow Graph Definition (stored in flows.graph_definition)
// =====================================================
export interface FlowGraphNode {
  id: string;
  type: 'triggerNode' | 'conditionNode' | 'actionNode';
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  animated?: boolean;
  type?: string;
}

export interface FlowGraphDefinition {
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
  viewport: { x: number; y: number; zoom: number };
}

// =====================================================
// Database Models
// =====================================================
export interface Flow {
  id: string;
  name: string;
  description: string | null;
  status: FlowStatus;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  graph_definition: FlowGraphDefinition;
  version: number;
  tags: string[];
  /** When true, the flow cannot be deleted (also enforced by a DB trigger). */
  is_locked?: boolean;
  /** Owning workspace of a tenant flow; NULL for a platform/operator flow. */
  workspace_id?: string | null;
  /** True = operator flow that fires across ALL workspaces (operator-only toggle);
   *  false = tenant flow scoped to workspace_id. */
  is_global?: boolean;
  /** Global flows only: may a workspace owner see this on their Automations page and switch it off
   *  (or mute one of its channels) via `workspace_flow_preferences`? Never lets them EDIT the
   *  graph. Default false is fail-closed — a new operator flow stays invisible to tenants until
   *  it is deliberately opened. */
  tenant_configurable?: boolean;
  created_by: string | null;
  updated_by: string | null;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * A platform "area" that should always have a flow pointed at it. Each area maps
 * to a trigger_type; `bound_flow_id` records the canonical handler flow. The
 * System Areas tab surfaces each area as filled or empty so coverage is visible.
 */
export interface FlowAreaRegistryEntry {
  area_key: string;
  title: string;
  description: string | null;
  category: string;
  trigger_type: TriggerType;
  required: boolean;
  bound_flow_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FlowRun {
  id: string;
  flow_id: string;
  flow_version: number;
  status: FlowRunStatus;
  trigger_type: string;
  trigger_event_data: Record<string, unknown>;
  context: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  error_node_id: string | null;
  initiated_by: string;
  is_test_run: boolean;
  created_at: string;
}

export interface FlowRunStep {
  id: string;
  flow_run_id: string;
  node_id: string;
  node_type: string;
  node_label: string | null;
  node_config: Record<string, unknown>;
  status: FlowStepStatus;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  branch_taken: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  retry_count: number;
  execution_order: number;
  created_at: string;
}

// =====================================================
// Node Palette Definition (UI only)
// =====================================================
export interface NodePaletteItem {
  type: 'triggerNode' | 'conditionNode' | 'actionNode';
  category: FlowNodeCategory;
  subType: TriggerType | ConditionType | ActionType;
  group: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  defaultData: FlowNodeData;
}
