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
  | 'contract_created'
  | 'image_uploaded'
  | 'document_processed'
  | 'product_added'
  | 'search_executed'
  | 'model_3d_created'
  | 'vr_world_created'
  | 'agent_search_completed'
  | 'agent_image_analyzed'
  | 'product_added_to_quote'
  | 'moodboard_created'
  | 'moodboard_item_added'
  | 'moodboard_shared'
  | 'moodboard_commented'
  | 'moodboard_quote_requested'
  | 'hire_me_received'
  | 'profile_followed'
  | 'profile_published'
  | 'material_reviewed'
  | 'review_submitted'
  | 'preferred_factory_added'
  // ── Added 2026-05-30: event vocabulary for notification→flow migration ──
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
  | 'inventory_low_stock'
  // #209 — multi-tenant inbox (dotted keys; payload-only, no custom config UI)
  | 'inbox.message_received'
  | 'inbox.thread_assigned'
  // #225 — surplus marketplace: a new listing matched a buyer's saved alert
  | 'marketplace_want_match'
  // Expense cards (trip / monthly / …): submit→finance, review→rep, request→rep
  | 'expense_card_submitted'
  | 'expense_card_reviewed'
  | 'expense_card_requested'
  // #227 — pricing-pyramid discount-approval workflow
  | 'pricing_change_requested'
  | 'pricing_change_decided'
  // Account receivable/payable: finance asked to issue a receipt/invoice
  | 'finance_document_requested'
  // Finance documents: a tax invoice / retail receipt was issued, or a payment was received
  | 'invoice_issued'
  | 'receipt_issued'
  | 'payment_received'
  // Sourcing / purchase orders (#237)
  | 'purchase_order.sent'
  | 'purchase_order.received'
  // Flows governance — automated paths routed through Flows (#245 D)
  | 'material_alert'
  | 'finance_follow_up'
  | 'invoice_paid'
  | 'module_access_requested';

export interface ManualTriggerConfig {}
export interface ModuleAccessRequestedTriggerConfig {}
export interface InventoryLowStockTriggerConfig {}
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
export interface PurchaseOrderSentTriggerConfig {}
export interface PurchaseOrderReceivedTriggerConfig {}
export interface MaterialAlertTriggerConfig {}
export interface FinanceFollowUpTriggerConfig {}
export interface InvoicePaidTriggerConfig {}
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
export interface ContractCreatedTriggerConfig {}
export interface ImageUploadedTriggerConfig {
  filter_category?: string;
}
export interface DocumentProcessedTriggerConfig {
  filter_status?: 'success' | 'failed';
}
export interface ProductAddedTriggerConfig {
  filter_source?: 'pdf_processing' | 'web_scraping' | 'xml_import' | 'manual';
}

export interface SearchExecutedTriggerConfig {
  filter_agent?: string;
}

export interface Model3DCreatedTriggerConfig {}
export interface VRWorldCreatedTriggerConfig {}

export interface AgentSearchCompletedTriggerConfig {
  filter_agent?: string;
}

export interface AgentImageAnalyzedTriggerConfig {
  filter_category?: string;
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

// ── Added 2026-05-30: notification→flow migration events. These carry their
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

export type TriggerConfigMap = {
  manual: ManualTriggerConfig;
  scheduled: ScheduledTriggerConfig;
  webhook: WebhookTriggerConfig;
  user_signup: UserSignupTriggerConfig;
  user_login: UserLoginTriggerConfig;
  quote_requested: QuoteRequestedTriggerConfig;
  quote_approved: QuoteApprovedTriggerConfig;
  quote_rejected: QuoteRejectedTriggerConfig;
  contract_created: ContractCreatedTriggerConfig;
  image_uploaded: ImageUploadedTriggerConfig;
  document_processed: DocumentProcessedTriggerConfig;
  product_added: ProductAddedTriggerConfig;
  search_executed: SearchExecutedTriggerConfig;
  model_3d_created: Model3DCreatedTriggerConfig;
  vr_world_created: VRWorldCreatedTriggerConfig;
  agent_search_completed: AgentSearchCompletedTriggerConfig;
  agent_image_analyzed: AgentImageAnalyzedTriggerConfig;
  product_added_to_quote: ProductAddedToQuoteTriggerConfig;
  moodboard_created: MoodboardCreatedTriggerConfig;
  moodboard_item_added: MoodboardItemAddedTriggerConfig;
  moodboard_shared: MoodboardSharedTriggerConfig;
  moodboard_commented: MoodboardCommentedTriggerConfig;
  moodboard_quote_requested: MoodboardQuoteRequestedTriggerConfig;
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
  inventory_low_stock: InventoryLowStockTriggerConfig;
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
  'purchase_order.sent': PurchaseOrderSentTriggerConfig;
  'purchase_order.received': PurchaseOrderReceivedTriggerConfig;
  material_alert: MaterialAlertTriggerConfig;
  finance_follow_up: FinanceFollowUpTriggerConfig;
  invoice_paid: InvoicePaidTriggerConfig;
  module_access_requested: ModuleAccessRequestedTriggerConfig;
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
  | 'send_email'
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
  config: SendSmsConfig | SendEmailConfig | SendPushConfig | SendQuoteConfig | BuildQuoteConfig | ApproveQuoteConfig | CreateNotificationConfig | HttpRequestConfig | AssignUserConfig | AddTagConfig | AddNoteConfig | UpdateContactConfig | UpdateProductConfig | RunEdgeFunctionConfig | LogEventConfig | SendAgentMessageConfig | CreateMoodboardConfig | AddToMoodboardConfig | WebSearchConfig | FirecrawlScrapeConfig | ApolloEnrichConfig | HunterFindContactsConfig | ZeroBounceValidateConfig;
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
