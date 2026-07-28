/**
 * Trigger variable catalog
 *
 * Single source of truth for the `{{trigger.data.*}}` variables each flow
 * trigger emits. Powers two surfaces:
 *  - The flow builder's "Available variables" helper (click-to-insert into an
 *    action's config fields).
 *  - The email template builder's tag reference (so template authors know which
 *    platform/flow tags they can use).
 *
 * Keep this in sync with the actual `emit()` / `emitFlowEvent()` payloads in the
 * source code. When you add a converted event (see docs/flows-notification-system.md
 * §8), add its variables here too.
 */

export interface TriggerVariable {
  /** Field name under trigger.data — referenced as {{trigger.data.<key>}}. */
  key: string;
  /** Human label. */
  label: string;
  /** Short description of the value. */
  note: string;
  /** Example value. */
  example?: string;
}

export interface TriggerVariableGroup {
  /** The trigger_type this set of variables belongs to. */
  trigger: string;
  /** Display title for the group. */
  title: string;
  variables: TriggerVariable[];
}

// Every converted notification/email event emits this standard envelope. The
// recipient + display strings are built in the source at emit time.
const STANDARD: TriggerVariable[] = [
  { key: 'user_id', label: 'Recipient user ID', note: 'The user who receives the notification.', example: 'a1b2c3d4-…' },
  { key: 'title', label: 'Title', note: 'Pre-built notification/email title.', example: 'Your VR world is ready!' },
  { key: 'body', label: 'Body', note: 'Pre-built notification/email body text.', example: 'Your 3D environment has been generated.' },
  { key: 'action_url', label: 'Action URL', note: 'Where the notification deep-links to.', example: '/profile?tab=inbox' },
  { key: 'type', label: 'Type', note: 'Notification type / category key.', example: 'vr_world_ready' },
];

// Helper: standard envelope + event-specific extras.
const withStandard = (extra: TriggerVariable[]): TriggerVariable[] => [...STANDARD, ...extra];

/**
 * Per-trigger variables. Triggers not listed here either carry no structured
 * payload or only the standard envelope; callers fall back to STANDARD_VARIABLES.
 */
export const TRIGGER_VARIABLES: Record<string, TriggerVariable[]> = {
  catalog_sent_to_customers: withStandard([
    { key: 'catalog_id', label: 'Catalog ID', note: 'The catalog that was emailed.' },
    { key: 'catalog_title', label: 'Catalog title', note: 'Title of the catalog.' },
    { key: 'send_batch_id', label: 'Send batch ID', note: 'Groups this dispatch’s recipients.' },
    { key: 'recipients_count', label: 'Recipients', note: 'How many customers were targeted.' },
    { key: 'sent_count', label: 'Sent', note: 'How many were emailed successfully.' },
    { key: 'failed_count', label: 'Failed', note: 'How many failed to send.' },
  ]),
  hire_me_received: withStandard([
    { key: 'from_name', label: 'Sender name', note: 'Name of the person sending the hire request.' },
    { key: 'from_email', label: 'Sender email', note: 'Email of the person sending the hire request.' },
    { key: 'services_requested', label: 'Services', note: 'Array of requested service names.' },
  ]),
  moodboard_quote_requested: withStandard([
    { key: 'moodboard_id', label: 'Moodboard ID', note: 'The moodboard the quote was requested from.' },
    { key: 'moodboard_title', label: 'Moodboard title', note: 'Title of the moodboard.' },
    { key: 'requester_id', label: 'Requester ID', note: 'The user who requested the quote.' },
    { key: 'requester_name', label: 'Requester name', note: 'Display name of the requester.' },
    { key: 'quote_request_id', label: 'Quote request ID', note: 'The generated quote request.' },
  ]),
  moodboard_dormancy_warning: withStandard([
    { key: 'moodboard_id', label: 'Moodboard ID', note: 'The inactive moodboard.' },
    { key: 'moodboard_title', label: 'Moodboard title', note: 'Title of the moodboard.' },
    { key: 'owner_email', label: 'Owner email', note: 'Email of the board owner (email recipient).' },
    { key: 'deletion_scheduled_at', label: 'Deletion date', note: 'When the board will be removed if not kept active.' },
    { key: 'keep_active_url', label: 'Keep-active link', note: 'One-click URL that keeps the board and clears the schedule.' },
    { key: 'email_html', label: 'Email body (HTML)', note: 'Pre-built HTML body for the send-email action.' },
  ]),
  moodboard_dormancy_reminder: withStandard([
    { key: 'moodboard_id', label: 'Moodboard ID', note: 'The inactive moodboard.' },
    { key: 'moodboard_title', label: 'Moodboard title', note: 'Title of the moodboard.' },
    { key: 'owner_email', label: 'Owner email', note: 'Email of the board owner (email recipient).' },
    { key: 'deletion_scheduled_at', label: 'Deletion date', note: 'When the board will be removed if not kept active.' },
    { key: 'keep_active_url', label: 'Keep-active link', note: 'One-click URL that keeps the board and clears the schedule.' },
    { key: 'email_html', label: 'Email body (HTML)', note: 'Pre-built HTML body for the send-email action.' },
  ]),
  marketplace_want_match: withStandard([
    { key: 'listing_id', label: 'Listing ID', note: 'The newly published surplus listing.' },
    { key: 'listing_title', label: 'Listing title', note: 'Title of the matched listing.' },
    { key: 'want_list_id', label: 'Want-list ID', note: 'The buyer saved alert that matched.' },
    { key: 'want_list_label', label: 'Want-list label', note: 'The buyer label for their saved alert.' },
  ]),
  pricing_change_requested: withStandard([
    { key: 'request_id', label: 'Request ID', note: 'The discount-change request awaiting approval.' },
    { key: 'workspace_id', label: 'Workspace ID', note: 'The workspace the request belongs to.' },
    { key: 'subject_type', label: 'Subject type', note: "'company' or 'contact' the discount applies to." },
    { key: 'subject_id', label: 'Subject ID', note: 'The company/contact id.' },
  ]),
  pricing_change_decided: withStandard([
    { key: 'request_id', label: 'Request ID', note: 'The decided discount-change request.' },
    { key: 'workspace_id', label: 'Workspace ID', note: 'The workspace the request belongs to.' },
    { key: 'approved', label: 'Approved', note: 'true if the change was approved, false if declined.' },
  ]),
  profile_followed: withStandard([
    { key: 'follower_id', label: 'Follower ID', note: 'The user who started following.' },
    { key: 'following_id', label: 'Followed ID', note: 'The profile being followed.' },
  ]),
  review_submitted: withStandard([
    { key: 'to_user_id', label: 'Reviewed user ID', note: 'The professional who received the review (recipient).' },
    { key: 'from_user_id', label: 'Reviewer ID', note: 'Who left the review.' },
    { key: 'overall_rating', label: 'Rating', note: 'Star rating left.', example: '5' },
    { key: 'service_name', label: 'Service', note: 'The service the review is about, if any.' },
  ]),
  material_reviewed: withStandard([
    { key: 'product_id', label: 'Product ID', note: 'The reviewed material.' },
    { key: 'reviewer_id', label: 'Reviewer ID', note: 'Who left the review.' },
    { key: 'owner_user_id', label: 'Owner ID', note: 'The material owner (recipient).' },
    { key: 'rating', label: 'Rating', note: 'Star rating left.', example: '5' },
  ]),
  preferred_factory_added: withStandard([
    { key: 'factory_user_id', label: 'Brand user ID', note: 'The verified brand user (recipient).' },
    { key: 'factory_name', label: 'Brand name', note: 'The added brand name.' },
  ]),
  vr_world_created: withStandard([
    { key: 'world_id', label: 'World ID', note: 'The generated VR world.' },
    { key: 'quality_tier', label: 'Quality tier', note: 'The model/quality used.' },
  ]),
  vr_world_failed: withStandard([{ key: 'world_id', label: 'World ID', note: 'The VR world that failed.' }]),
  virtual_staging_completed: withStandard([
    { key: 'job_id', label: 'Job ID', note: 'The staging job.' },
    { key: 'room', label: 'Room', note: 'The staged room type.' },
  ]),
  video_generation_completed: withStandard([
    { key: 'job_id', label: 'Job ID', note: 'The video job.' },
    { key: 'video_type', label: 'Video type', note: 'The kind of video generated.' },
  ]),
  video_generation_failed: withStandard([
    { key: 'job_id', label: 'Job ID', note: 'The video job that failed.' },
    { key: 'video_type', label: 'Video type', note: 'The kind of video attempted.' },
  ]),
  svbrdf_extraction_complete: withStandard([
    { key: 'extraction_id', label: 'Extraction ID', note: 'The SVBRDF extraction job.' },
  ]),
  agent_search_completed: withStandard([
    { key: 'agent_id', label: 'Agent ID', note: 'The background agent.' },
    { key: 'run_id', label: 'Run ID', note: 'The agent run.' },
  ]),
  background_agent_failed: withStandard([
    { key: 'agent_id', label: 'Agent ID', note: 'The background agent.' },
    { key: 'run_id', label: 'Run ID', note: 'The failed agent run.' },
  ]),
  role_upgrade_request_submitted: withStandard([
    { key: 'requested_role', label: 'Requested role', note: 'The role applied for.' },
  ]),
  role_upgrade_approved: withStandard([
    { key: 'request_id', label: 'Request ID', note: 'The upgrade request.' },
    { key: 'requested_role', label: 'Requested role', note: 'The granted role.' },
  ]),
  role_upgrade_rejected: withStandard([
    { key: 'request_id', label: 'Request ID', note: 'The upgrade request.' },
    { key: 'requested_role', label: 'Requested role', note: 'The rejected role.' },
  ]),
  factory_approved: withStandard([
    { key: 'request_id', label: 'Request ID', note: 'The verification request.' },
    { key: 'company_name', label: 'Company name', note: 'The approved supplier.' },
  ]),
  factory_rejected: withStandard([
    { key: 'request_id', label: 'Request ID', note: 'The verification request.' },
    { key: 'company_name', label: 'Company name', note: 'The rejected supplier.' },
  ]),
  appointment_booked: withStandard([
    { key: 'appointment_id', label: 'Appointment ID', note: 'The booking.' },
    { key: 'professional_user_id', label: 'Professional ID', note: 'The professional (recipient).' },
    { key: 'client_name', label: 'Client name', note: 'Who booked.' },
    { key: 'client_email', label: 'Client email', note: 'Client contact.' },
    { key: 'date', label: 'Date', note: 'Appointment date.' },
    { key: 'time', label: 'Time', note: 'Appointment time slot.' },
    { key: 'service_name', label: 'Service', note: 'Booked service.' },
  ]),
  appointment_confirmed: withStandard([
    { key: 'appointment_id', label: 'Appointment ID', note: 'The booking.' },
    { key: 'professional_user_id', label: 'Professional ID', note: 'The professional.' },
  ]),
  appointment_cancelled: withStandard([
    { key: 'appointment_id', label: 'Appointment ID', note: 'The booking.' },
    { key: 'professional_user_id', label: 'Professional ID', note: 'The professional.' },
  ]),
  quote_approved: [
    { key: 'admin_ids', label: 'Admin IDs', note: 'Array of workspace admins to notify — iterate with a Loop ({{item}} = each admin id).' },
    { key: 'quote_id', label: 'Quote ID', note: 'The accepted quote.' },
    { key: 'user_id', label: 'Quote owner', note: 'The quote owner.' },
    { key: 'title', label: 'Title', note: 'Pre-built notification title.' },
    { key: 'body', label: 'Body', note: 'Pre-built notification body.' },
    { key: 'action_url', label: 'Action URL', note: 'Deep link to the quote.' },
    { key: 'type', label: 'Type', note: 'Notification type.' },
  ],
  quote_rejected: [
    { key: 'admin_ids', label: 'Admin IDs', note: 'Array of workspace admins to notify — iterate with a Loop ({{item}} = each admin id).' },
    { key: 'quote_id', label: 'Quote ID', note: 'The declined quote.' },
    { key: 'user_id', label: 'Quote owner', note: 'The quote owner.' },
    { key: 'title', label: 'Title', note: 'Pre-built notification title.' },
    { key: 'body', label: 'Body', note: 'Pre-built notification body.' },
    { key: 'action_url', label: 'Action URL', note: 'Deep link to the quote.' },
    { key: 'type', label: 'Type', note: 'Notification type.' },
  ],
  quote_pdf_generated: withStandard([{ key: 'quote_id', label: 'Quote ID', note: 'The quote whose PDF is ready.' }]),
  stripe_payment_succeeded: withStandard([
    { key: 'credit_amount', label: 'Credit amount', note: 'Credits added.' },
    { key: 'payment_intent_id', label: 'Payment intent ID', note: 'The Stripe payment intent.' },
  ]),
  stripe_payment_failed: withStandard([
    { key: 'payment_intent_id', label: 'Payment intent ID', note: 'The failed Stripe payment intent.' },
  ]),
  // Email events — emit `to`/`subject`/`body` rather than a notification envelope.
  project_invitation_sent: [
    { key: 'to', label: 'Recipient email', note: 'Invitee email address.' },
    { key: 'subject', label: 'Subject', note: 'Pre-built email subject.' },
    { key: 'body', label: 'Body (HTML)', note: 'Pre-rendered invite email HTML.' },
    { key: 'project_id', label: 'Project ID', note: 'The project.' },
    { key: 'project_name', label: 'Project name', note: 'The project name.' },
    { key: 'inviter_name', label: 'Inviter name', note: 'Who sent the invite.' },
  ],
  project_invitation_resent: [
    { key: 'to', label: 'Recipient email', note: 'Invitee email address.' },
    { key: 'subject', label: 'Subject', note: 'Pre-built email subject.' },
    { key: 'body', label: 'Body (HTML)', note: 'Pre-rendered invite email HTML.' },
    { key: 'project_id', label: 'Project ID', note: 'The project.' },
    { key: 'project_name', label: 'Project name', note: 'The project name.' },
    { key: 'inviter_name', label: 'Inviter name', note: 'Who sent the invite.' },
  ],
  // Infrastructure triggers
  webhook: [
    { key: 'any field from the POST body', label: 'Webhook body', note: 'Whatever JSON the external caller POSTs becomes trigger.data.*' },
    { key: '_webhook.method', label: 'HTTP method', note: 'The request method.' },
    { key: '_webhook.query_params', label: 'Query params', note: 'URL query parameters as an object.' },
  ],
  scheduled: [
    { key: 'scheduled', label: 'Scheduled flag', note: 'Always true on a scheduled run.' },
    { key: 'cron', label: 'Cron expression', note: 'The schedule that fired.' },
    { key: 'timestamp', label: 'Fire time', note: 'ISO timestamp of the run.' },
  ],
  // #237 Phase 4.4 — upstream line-level RFQ. The delivering payload (with admin_ids + the
  // notification envelope) is enriched server-side by the master_requests DB bridge; the
  // frontend also emits a lightweight signal carrying just the ids below.
  rfq_lines_requested: withStandard([
    { key: 'admin_ids', label: 'Admin IDs', note: 'Array of PARENT-workspace admins to notify — iterate with a Loop ({{item}} = each admin id).' },
    { key: 'master_request_id', label: 'Master request ID', note: 'The upstream RFQ request.' },
    { key: 'quote_id', label: 'Quote ID', note: 'The quote whose lines were routed up.' },
    { key: 'line_count', label: 'Line count', note: 'How many lines were routed up for pricing.' },
  ]),
  rfq_lines_priced: withStandard([
    { key: 'admin_ids', label: 'Admin IDs', note: 'Array of REQUESTER-workspace admins to notify — iterate with a Loop ({{item}} = each admin id).' },
    { key: 'master_request_id', label: 'Master request ID', note: 'The upstream RFQ request.' },
    { key: 'quote_id', label: 'Quote ID', note: 'The quote to fold the returned prices back into.' },
    { key: 'requester_workspace_id', label: 'Requester workspace ID', note: 'The workspace that asked for pricing.' },
    { key: 'priced_count', label: 'Priced count', note: 'How many lines the supplier priced.' },
  ]),
  // #237 — reseller quote acceptance mirrored an order into the supplier/operator workspace.
  // The delivering payload (admin_ids + envelope) is enriched by the finance_orders DB bridge.
  upstream_order_created: withStandard([
    { key: 'admin_ids', label: 'Admin IDs', note: 'Array of SUPPLIER-workspace admins to notify — iterate with a Loop ({{item}} = each admin id).' },
    { key: 'quote_id', label: 'Quote ID', note: 'The reseller quote that was accepted.' },
    { key: 'supplier_workspace_id', label: 'Supplier workspace ID', note: 'The recipient (operator/supplier) workspace.' },
    { key: 'sales_order_id', label: 'Sales order ID', note: 'The mirrored sales order created in the supplier workspace.' },
    { key: 'purchase_order_id', label: 'Purchase order ID', note: 'The reseller-side purchase order paired to the sales order.' },
  ]),
  'seo.ranking_movement': withStandard([
    { key: 'website_id', label: 'Website ID', note: 'The connected website whose rankings moved.' },
    { key: 'domain', label: 'Domain', note: 'The website domain.', example: 'flobali.gr' },
    { key: 'metric', label: 'Metric', note: 'Which metric moved.', example: 'ranking_keywords' },
    { key: 'direction', label: 'Direction', note: 'up or down.', example: 'down' },
    { key: 'previous', label: 'Previous value', note: 'Value at the prior snapshot.' },
    { key: 'current', label: 'Current value', note: 'Value at this snapshot.' },
    { key: 'delta_pct', label: 'Change %', note: 'Percentage change week-over-week.' },
  ]),
  'seo.backlink_movement': withStandard([
    { key: 'website_id', label: 'Website ID', note: 'The connected website whose backlinks moved.' },
    { key: 'domain', label: 'Domain', note: 'The website domain.', example: 'flobali.gr' },
    { key: 'metric', label: 'Metric', note: 'referring_domains or backlinks.', example: 'referring_domains' },
    { key: 'direction', label: 'Direction', note: 'up or down.' },
    { key: 'previous', label: 'Previous value', note: 'Value at the prior snapshot.' },
    { key: 'current', label: 'Current value', note: 'Value at this snapshot.' },
    { key: 'delta_pct', label: 'Change %', note: 'Percentage change week-over-week.' },
  ]),
  'seo.site_health_changed': withStandard([
    { key: 'website_id', label: 'Website ID', note: 'The connected website audited.' },
    { key: 'domain', label: 'Domain', note: 'The website domain.', example: 'flobali.gr' },
    { key: 'direction', label: 'Direction', note: 'regressed or recovered.', example: 'regressed' },
    { key: 'previous_score', label: 'Previous score', note: 'On-page score at the prior audit.' },
    { key: 'current_score', label: 'Current score', note: 'On-page score at this audit.' },
  ]),
};

/** The standard envelope every notification/email event carries. */
export const STANDARD_VARIABLES = STANDARD;

/** Loop-scoped variables, available inside a Loop's downstream action. */
export const LOOP_VARIABLES: TriggerVariable[] = [
  { key: 'item', label: 'Loop item', note: 'The current item from the collection. Use {{item}} or {{item.field}}.' },
  { key: 'loop_index', label: 'Loop index', note: 'Zero-based index of the current iteration.' },
];

/**
 * Returns the variables for a trigger as ready-to-paste template strings, e.g.
 * { token: '{{trigger.data.title}}', label: 'Title', note: '…' }.
 * Falls back to the standard envelope for unknown/payload-less triggers.
 */
export function getTriggerVariables(trigger: string | undefined): Array<TriggerVariable & { token: string }> {
  const vars = (trigger && TRIGGER_VARIABLES[trigger]) || STANDARD;
  return vars.map((v) => ({ ...v, token: `{{trigger.data.${v.key}}}` }));
}

/** Human display title for every trigger that has a documented payload. */
export const TRIGGER_TITLES: Record<string, string> = {
  hire_me_received: 'Hire Me request',
  moodboard_quote_requested: 'Moodboard quote request',
  marketplace_want_match: 'Surplus alert match',
  pricing_change_requested: 'Discount approval requested',
  pricing_change_decided: 'Discount approval decided',
  profile_followed: 'New follower',
  material_reviewed: 'Material reviewed',
  review_submitted: 'Profile review received',
  preferred_factory_added: 'Preferred brand added',
  vr_world_created: 'VR world ready',
  vr_world_failed: 'VR world failed',
  virtual_staging_completed: 'Virtual staging ready',
  video_generation_completed: 'Video generated',
  video_generation_failed: 'Video failed',
  svbrdf_extraction_complete: 'SVBRDF maps ready',
  agent_search_completed: 'Agent run completed',
  background_agent_failed: 'Agent run failed',
  role_upgrade_request_submitted: 'Role upgrade requested',
  role_upgrade_approved: 'Role upgrade approved',
  role_upgrade_rejected: 'Role upgrade rejected',
  factory_approved: 'Brand approved',
  factory_rejected: 'Brand rejected',
  appointment_booked: 'Appointment booked',
  appointment_confirmed: 'Appointment confirmed',
  appointment_cancelled: 'Appointment cancelled',
  quote_approved: 'Quote accepted',
  quote_rejected: 'Quote declined',
  quote_pdf_generated: 'Quote PDF ready',
  stripe_payment_succeeded: 'Payment succeeded',
  stripe_payment_failed: 'Payment failed',
  project_invitation_sent: 'Project invite sent',
  project_invitation_resent: 'Project invite resent',
  webhook: 'Webhook (external)',
  scheduled: 'Scheduled (cron)',
  'seo.ranking_movement': 'SEO Rankings Moved',
  'seo.backlink_movement': 'SEO Backlinks Moved',
  'seo.site_health_changed': 'SEO Site Health Changed',
};

/**
 * All documented event sources as { title, trigger, variables } groups, ordered
 * by TRIGGER_TITLES. Used by the email template builder's tag reference so an
 * author can see every event whose data a flow can map into a template.
 */
export function getAllTriggerGroups(): Array<{ trigger: string; title: string; variables: Array<TriggerVariable & { token: string }> }> {
  return Object.keys(TRIGGER_TITLES)
    .filter((t) => TRIGGER_VARIABLES[t]) // only triggers with a documented payload
    .map((trigger) => ({
      trigger,
      title: TRIGGER_TITLES[trigger],
      variables: getTriggerVariables(trigger),
    }));
}
