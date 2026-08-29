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

/**
 * What kind of thing a variable holds, so an operator pasting it into an outbound email knows
 * what they are pasting (#357 AE-14).
 *
 * The helper offered ninety variables as one undifferentiated list of `{{…}}` tokens. Among them
 * are one-click URLs that ACT on possession, other people's email addresses, and internal UUIDs —
 * and nothing on the screen distinguished those from a title or a count. Placing a keep-active
 * link or an invite URL into a body that goes to a different recipient hands that recipient the
 * capability, and the flow builder is exactly where somebody does that without meaning to.
 *
 * DERIVED FROM THE KEY, not hand-labelled per variable. Ninety hand-kept flags is the "a rule
 * written N times" shape: the ninety-first variable arrives unlabelled and reads as safe.
 */
export type VariableSensitivity =
  | 'capability'  // acts on possession — anyone holding it can use it, signed in or not
  | 'link'        // a URL into the app; still needs the recipient to be signed in
  | 'personal'    // somebody's own contact detail
  | 'internal'    // an internal id — meaningless to a customer, and it leaks structure
  | 'markup'      // pre-built HTML, not a value to drop into a sentence
  | 'plain';      // a title, a name, a count

/**
 * Keys whose SHAPE misleads. Shrink-only: an entry here means the derivation got it wrong for a
 * named reason, never that somebody wanted a quieter badge.
 */
const SENSITIVITY_OVERRIDES: Array<{ key: string; sensitivity: VariableSensitivity; why: string }> = [
  { key: 'action_url', sensitivity: 'link', why: 'Ends _url but is an in-app deep link — following it still lands on the login wall.' },
  { key: 'keep_active_url', sensitivity: 'capability', why: 'Acts with no session at all: one click keeps the board and clears the deletion schedule.' },
  { key: 'invite_url', sensitivity: 'capability', why: 'Carries the invite code, so it enrols whoever opens it.' },
];

/**
 * The one classifier. Order matters: a key can match more than one shape, and the more dangerous
 * reading wins.
 */
export function variableSensitivity(key: string): VariableSensitivity {
  // An array of {key, sensitivity, why} rather than a keyed object, so the reason is written down
  // next to each entry — and so this file never contains the literal `action_url: '…'`, which the
  // deep-link guard reads as a notification target being given a non-path value.
  const override = SENSITIVITY_OVERRIDES.find((o) => o.key === key);
  if (override) return override.sensitivity;
  if (/(^|_)(token|secret|code|password|signature)$/.test(key)) return 'capability';
  if (/_html$/.test(key)) return 'markup';
  if (/(^|_)(url|link)$/.test(key)) return 'link';
  if (/(^|_)(email|phone|mobile|address|iban)$/.test(key)) return 'personal';
  if (/_id$/.test(key) || key === 'id') return 'internal';
  return 'plain';
}

/** How each class is named and explained wherever variables are offered. Formatting only. */
export const SENSITIVITY_PRESENTATION: Record<
  VariableSensitivity,
  { label: string; note: string; tone: 'error' | 'warning' | 'info' | 'neutral' }
> = {
  capability: {
    label: 'Acts on click',
    note: 'Anyone holding this can use it without signing in. Only send it to the person it was made for.',
    tone: 'error',
  },
  link: { label: 'Link', note: 'A link into the app — the recipient still has to sign in.', tone: 'info' },
  personal: { label: 'Personal', note: "Somebody's own contact detail. Do not forward it to a third party.", tone: 'warning' },
  internal: { label: 'Internal id', note: 'Means nothing to a customer, and tells a stranger how the system is put together.', tone: 'neutral' },
  markup: { label: 'HTML', note: 'A pre-built HTML body. Put it in an HTML field on its own, not inside a sentence.', tone: 'neutral' },
  plain: { label: '', note: '', tone: 'neutral' },
};

/** The classes worth stopping an author over when they appear in an outbound body or subject. */
export const RISKY_SENSITIVITIES: VariableSensitivity[] = ['capability', 'personal'];

/**
 * Which risky variables a piece of composed text actually references.
 *
 * Reads the tokens out of the text rather than tracking what was clicked: a config can be typed,
 * pasted, or restored from a saved flow, and only the text itself says what will be sent.
 */
export function riskyVariablesIn(text: string): Array<{ key: string; sensitivity: VariableSensitivity }> {
  const found = new Map<string, VariableSensitivity>();
  for (const m of String(text || '').matchAll(/\{\{\s*trigger\.data\.([a-zA-Z0-9_]+)\s*\}\}/g)) {
    const key = m[1];
    const sensitivity = variableSensitivity(key);
    if (RISKY_SENSITIVITIES.includes(sensitivity)) found.set(key, sensitivity);
  }
  return [...found.entries()].map(([key, sensitivity]) => ({ key, sensitivity }));
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
  { key: 'action_url', label: 'Action URL', note: 'Where the notification deep-links to.', example: '/inbox?thread=…' },
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
  workspace_invitation_sent: [
    { key: 'to', label: 'Recipient email', note: 'Invitee email address.' },
    { key: 'subject', label: 'Subject', note: 'Pre-built email subject.' },
    { key: 'body', label: 'Body (HTML)', note: 'Pre-rendered invite email HTML.' },
    { key: 'workspace_id', label: 'Workspace ID', note: 'The workspace they are joining.' },
    { key: 'workspace_name', label: 'Workspace name', note: 'The team name.' },
    { key: 'role', label: 'Role', note: 'Workspace role granted on acceptance (e.g. sales_manager).' },
    { key: 'role_label', label: 'Role label', note: 'Human label for the role, e.g. "Sales Manager".' },
    { key: 'portal', label: 'Portal', note: 'Which portal the invitee lands on.' },
    { key: 'invite_url', label: 'Invite URL', note: 'Sign-up link carrying the invite code.' },
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
  // Upstream line-level RFQ. The delivering payload (with admin_ids + the
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
  // Reseller quote acceptance mirrored an order into the supplier/operator workspace.
  // The delivering payload (admin_ids + envelope) is enriched by the finance_orders DB bridge.
  upstream_order_created: withStandard([
    { key: 'admin_ids', label: 'Admin IDs', note: 'Array of SUPPLIER-workspace admins to notify — iterate with a Loop ({{item}} = each admin id).' },
    { key: 'quote_id', label: 'Quote ID', note: 'The reseller quote that was accepted.' },
    { key: 'supplier_workspace_id', label: 'Supplier workspace ID', note: 'The recipient (operator/supplier) workspace.' },
    { key: 'sales_order_id', label: 'Sales order ID', note: 'The mirrored sales order created in the supplier workspace.' },
    { key: 'purchase_order_id', label: 'Purchase order ID', note: 'The reseller-side purchase order paired to the sales order.' },
  ]),
  // A buyer handed a purchase order off in-app to this workspace's claimed supplier identity;
  // a draft sales order was created here for review.
  supplier_po_received: withStandard([
    { key: 'admin_ids', label: 'Admin IDs', note: 'Array of SUPPLIER-workspace admins to notify — iterate with a Loop ({{item}} = each admin id).' },
    { key: 'buyer_name', label: 'Buyer name', note: 'The buying workspace’s registered business name.' },
    { key: 'sales_order_id', label: 'Sales order ID', note: 'The draft sales order created in this (supplier) workspace.' },
    { key: 'purchase_order_id', label: 'Purchase order ID', note: 'The buyer-side purchase order paired to the sales order.' },
  ]),
  // #324 — a verified manufacturer published to the shared master catalog.
  catalog_master_updated: withStandard([
    { key: 'admin_ids', label: 'Admin IDs', note: 'Operator (root workspace) admins to notify — iterate with a Loop ({{item}} = each admin id).' },
    { key: 'supplier_name', label: 'Supplier name', note: 'The manufacturer that published.' },
    { key: 'product_name', label: 'Product name', note: 'The product the manufacturer updated.' },
    { key: 'sku', label: 'SKU', note: 'Normalized SKU of the master catalog row.' },
    { key: 'master_product_id', label: 'Master product ID', note: 'The shared master catalog row.' },
    { key: 'changed_fields', label: 'Changed fields', note: 'Object of the fields the manufacturer overwrote.' },
  ]),
  // #324 — published PRICE. An offer to the operator; nobody's cost moved yet.
  supplier_price_changed: withStandard([
    { key: 'admin_ids', label: 'Admin IDs', note: 'Operator (root workspace) admins to notify — iterate with a Loop ({{item}} = each admin id).' },
    { key: 'supplier_name', label: 'Supplier name', note: 'The manufacturer that published the price.' },
    { key: 'product_name', label: 'Product name', note: 'The product whose price changed.' },
    { key: 'sku', label: 'SKU', note: 'Normalized SKU of the master catalog row.' },
    { key: 'master_product_id', label: 'Master product ID', note: 'The shared master catalog row.' },
    { key: 'list_price', label: 'New list price', note: 'What the factory now ASKS. Not a cost until the operator accepts it.' },
    { key: 'currency', label: 'Currency', note: 'Currency of the published ask.', example: 'EUR' },
  ]),
  // #210 — HR labour lifecycle. The Ergani document code is carried on the payload so a flow
  // can branch on it (e.g. route an Ε6 termination to Finance but not an Ε5 resignation).
  'hr.departure_recorded': withStandard([
    { key: 'employee_id', label: 'Employee ID', note: 'The hr_employees row that is leaving.' },
    { key: 'employee_name', label: 'Employee name', note: 'Display name of the departing employee.' },
    { key: 'separation_id', label: 'Departure ID', note: 'The hr_separations row.' },
    { key: 'separation_type', label: 'Departure type', note: 'voluntary | termination | expiry.', example: 'termination' },
    { key: 'ergani_code', label: 'Ergani document', note: 'The document this files as — derived from the type.', example: 'E6' },
    { key: 'effective_date', label: 'Effective date', note: 'Last day of employment.', example: '2026-09-30' },
    { key: 'reason', label: 'Reason', note: 'Reason recorded for the departure (may be empty).' },
  ]),
  'hr.overtime_recorded': withStandard([
    { key: 'employee_id', label: 'Employee ID', note: 'The employee who worked the overtime.' },
    { key: 'employee_name', label: 'Employee name', note: 'Display name of the employee.' },
    { key: 'overtime_id', label: 'Overtime ID', note: 'The hr_overtime row.' },
    { key: 'work_date', label: 'Work date', note: 'The date the overtime was worked.', example: '2026-09-14' },
    { key: 'hours', label: 'Hours', note: 'Duration, derived in SQL from the start/end times.', example: '2.5' },
    { key: 'overtime_reason', label: 'Justification', note: 'Why the overtime was worked — Ergani requires one.' },
  ]),
  // A REJECTED statutory filing. Before this existed the failure only ever landed as a row in
  // hr_ergani_submissions, so nobody was told an Ε3/Ε4/Ε8 never reached the ministry.
  'hr.ergani_filing_failed': withStandard([
    { key: 'submission_type', label: 'Ergani document', note: 'The document code that was rejected.', example: 'E3' },
    { key: 'entity_type', label: 'Entity type', note: 'What was being filed.', example: 'separation' },
    { key: 'entity_id', label: 'Entity ID', note: 'The record the filing was for (may be empty for a batch).' },
    { key: 'employee_id', label: 'Employee ID', note: 'The employee concerned (empty when the filing covered several).' },
    { key: 'employee_name', label: 'Employee name', note: 'Display name of the employee concerned, when there is exactly one.' },
    { key: 'environment', label: 'Environment', note: 'trial or production — a production failure is the urgent one.', example: 'production' },
    { key: 'error', label: 'Ergani error', note: 'The rejection message returned by the ministry, verbatim.' },
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
  'seo.report_ready': withStandard([
    { key: 'website_id', label: 'Website ID', note: 'The connected website the report covers.' },
    { key: 'domain', label: 'Domain', note: 'The website domain.', example: 'flobali.gr' },
    { key: 'report_name', label: 'Report name', note: 'What the operator called it.', example: 'Monthly SEO' },
    { key: 'run_id', label: 'Run ID', note: 'The stored snapshot — open it to read the report.' },
    { key: 'period_start', label: 'Period start', note: 'First day the report covers.' },
    { key: 'period_end', label: 'Period end', note: 'Last day the report covers.' },
    { key: 'headline', label: 'Headline', note: 'One line summarising the period.' },
  ]),
  'seo.site_health_changed': withStandard([
    { key: 'website_id', label: 'Website ID', note: 'The connected website audited.' },
    { key: 'domain', label: 'Domain', note: 'The website domain.', example: 'flobali.gr' },
    { key: 'direction', label: 'Direction', note: 'regressed or recovered.', example: 'regressed' },
    { key: 'previous_score', label: 'Previous score', note: 'On-page score at the prior audit.' },
    { key: 'current_score', label: 'Current score', note: 'On-page score at this audit.' },
  ]),
  'seo.article_refresh_due': withStandard([
    { key: 'article_id', label: 'Article ID', note: 'The generated article that is due.' },
    { key: 'article_title', label: 'Article title', note: 'Title of the article.' },
    { key: 'target_keyword', label: 'Target keyword', note: 'The keyword the article targets.' },
    { key: 'website_id', label: 'Website ID', note: 'The connected website it belongs to, when set.' },
    { key: 'published_at', label: 'Published', note: 'When the article was first completed.' },
    { key: 'last_reviewed_at', label: 'Last reviewed', note: 'When the content was last materially refreshed. Empty = never.' },
    { key: 'refresh_due_at', label: 'Due date', note: 'Derived: last review (or publication) + the cadence.' },
    { key: 'refresh_interval_days', label: 'Cadence (days)', note: 'This article\u2019s own refresh interval.', example: '90' },
    { key: 'age_days', label: 'Age (days)', note: 'Days since the content was last reviewed.' },
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
export function getTriggerVariables(
  trigger: string | undefined,
): Array<TriggerVariable & { token: string; sensitivity: VariableSensitivity }> {
  const vars = (trigger && TRIGGER_VARIABLES[trigger]) || STANDARD;
  // Classified here rather than at each call site, so every surface that offers a variable also
  // says what kind of thing it is — the helper, the template builder's tag reference, and
  // anything added later.
  return vars.map((v) => ({
    ...v,
    token: `{{trigger.data.${v.key}}}`,
    sensitivity: variableSensitivity(v.key),
  }));
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
  deal_stage_changed: 'Deal moved stage',
  deal_won: 'Deal won',
  deal_lost: 'Deal lost',
  quote_rejected: 'Quote declined',
  quote_pdf_generated: 'Quote PDF ready',
  stripe_payment_succeeded: 'Payment succeeded',
  stripe_payment_failed: 'Payment failed',
  project_invitation_sent: 'Project invite sent',
  project_invitation_resent: 'Project invite resent',
  workspace_invitation_sent: 'Team invite sent',
  webhook: 'Webhook (external)',
  scheduled: 'Scheduled (cron)',
  'seo.ranking_movement': 'SEO Rankings Moved',
  'seo.backlink_movement': 'SEO Backlinks Moved',
  'seo.site_health_changed': 'SEO Site Health Changed',
  'seo.report_ready': 'SEO Report Ready',
  'seo.article_refresh_due': 'SEO Article Due for Refresh',
};

/**
 * All documented event sources as { title, trigger, variables } groups, ordered
 * by TRIGGER_TITLES. Used by the email template builder's tag reference so an
 * author can see every event whose data a flow can map into a template.
 */
export function getAllTriggerGroups(): Array<{
  trigger: string;
  title: string;
  variables: Array<TriggerVariable & { token: string; sensitivity: VariableSensitivity }>;
}> {
  return Object.keys(TRIGGER_TITLES)
    .filter((t) => TRIGGER_VARIABLES[t]) // only triggers with a documented payload
    .map((trigger) => ({
      trigger,
      title: TRIGGER_TITLES[trigger],
      variables: getTriggerVariables(trigger),
    }));
}
