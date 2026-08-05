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
  // Banking (#315): an incoming bank transfer matched no invoice (payload-only)
  | 'bank_payment_unmatched'
  // Banking (#315): a company-card spend of ≥€100 landed (filter higher via amount)
  | 'card_spend_threshold'
  | 'module_access_requested'
  // HR: an employee has not clocked in past their start time + grace (payload-only)
  | 'hr_late_checkin'
  // HR recruiting: a job applicant moved through the pipeline (payload-only, dotted key)
  | 'hr.applicant_stage_changed'
  // HR lifecycle (payload-only, dotted keys)
  | 'hr.employee_added'
  | 'hr.absence_requested'
  | 'hr.absence_reviewed'
  // Finance — order lifecycle (sales/purchase orders)
  | 'order_created'
  | 'order_status_changed'
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
  // Project Client Views: a client approved / requested changes / commented on a deliverable
  | 'client_view_feedback_received'
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
  | 'realestate.buyer_matches_found'
  | 'realestate.new_listing_for_buyer'
  // SEO movement alerts — detected week-over-week by the seo-domain-tracker / seo-site-audit
  // crons and fanned out to the site's workspace members (payload-only, server-only events)
  | 'seo.ranking_movement'
  | 'seo.backlink_movement'
  | 'seo.site_health_changed';

export interface ManualTriggerConfig {}
export interface ModuleAccessRequestedTriggerConfig {}
export interface HrLateCheckinTriggerConfig {}
export interface RealestateBuyerMatchesFoundTriggerConfig {}
export interface RealestateNewListingForBuyerTriggerConfig {}
export interface SeoRankingMovementTriggerConfig {}
export interface SeoBacklinkMovementTriggerConfig {}
export interface SeoSiteHealthChangedTriggerConfig {}
export interface HrApplicantStageChangedTriggerConfig {}
export interface HrEmployeeAddedTriggerConfig {}
export interface HrAbsenceRequestedTriggerConfig {}
export interface HrAbsenceReviewedTriggerConfig {}
export interface OrderCreatedTriggerConfig {}
export interface OrderStatusChangedTriggerConfig {}
export interface DocumentPublishedTriggerConfig {}
export interface DocSuggestionSubmittedTriggerConfig {}
export interface CampaignSentTriggerConfig {}
export interface EmailSenderNotConfiguredTriggerConfig {}
export interface EmailBouncedTriggerConfig {}
export interface EmailComplainedTriggerConfig {}
export interface SocialPostPublishedTriggerConfig {}
export interface SocialPostFailedTriggerConfig {}
export interface ClientViewFeedbackReceivedTriggerConfig {}
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
export interface InventoryLowStockTriggerConfig {}
export interface FreightQuoteRequestedTriggerConfig {}
export interface OrderDispatchedTriggerConfig {}
export interface InboxMessageReceivedTriggerConfig {}
export interface InboxThreadAssignedTriggerConfig {}
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
  /** Only fire when rating is at least this value */
  filter_min_rating?: number;
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
  bank_payment_unmatched: BankPaymentUnmatchedTriggerConfig;
  card_spend_threshold: CardSpendThresholdTriggerConfig;
  module_access_requested: ModuleAccessRequestedTriggerConfig;
  hr_late_checkin: HrLateCheckinTriggerConfig;
  'hr.applicant_stage_changed': HrApplicantStageChangedTriggerConfig;
  'hr.employee_added': HrEmployeeAddedTriggerConfig;
  'hr.absence_requested': HrAbsenceRequestedTriggerConfig;
  'hr.absence_reviewed': HrAbsenceReviewedTriggerConfig;
  order_created: OrderCreatedTriggerConfig;
  order_status_changed: OrderStatusChangedTriggerConfig;
  document_published: DocumentPublishedTriggerConfig;
  doc_suggestion_submitted: DocSuggestionSubmittedTriggerConfig;
  campaign_sent: CampaignSentTriggerConfig;
  email_sender_not_configured: EmailSenderNotConfiguredTriggerConfig;
  email_bounced: EmailBouncedTriggerConfig;
  email_complained: EmailComplainedTriggerConfig;
  social_post_published: SocialPostPublishedTriggerConfig;
  social_post_failed: SocialPostFailedTriggerConfig;
  client_view_feedback_received: ClientViewFeedbackReceivedTriggerConfig;
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
  'realestate.buyer_matches_found': RealestateBuyerMatchesFoundTriggerConfig;
  'realestate.new_listing_for_buyer': RealestateNewListingForBuyerTriggerConfig;
  'seo.ranking_movement': SeoRankingMovementTriggerConfig;
  'seo.backlink_movement': SeoBacklinkMovementTriggerConfig;
  'seo.site_health_changed': SeoSiteHealthChangedTriggerConfig;
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
