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
  profile_followed: withStandard([
    { key: 'follower_id', label: 'Follower ID', note: 'The user who started following.' },
    { key: 'following_id', label: 'Followed ID', note: 'The profile being followed.' },
  ]),
  material_reviewed: withStandard([
    { key: 'product_id', label: 'Product ID', note: 'The reviewed material.' },
    { key: 'reviewer_id', label: 'Reviewer ID', note: 'Who left the review.' },
    { key: 'owner_user_id', label: 'Owner ID', note: 'The material owner (recipient).' },
    { key: 'rating', label: 'Rating', note: 'Star rating left.', example: '5' },
  ]),
  preferred_factory_added: withStandard([
    { key: 'factory_user_id', label: 'Factory user ID', note: 'The verified factory user (recipient).' },
    { key: 'factory_name', label: 'Factory name', note: 'The added factory name.' },
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
  profile_followed: 'New follower',
  material_reviewed: 'Material reviewed',
  preferred_factory_added: 'Preferred factory added',
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
  factory_approved: 'Factory approved',
  factory_rejected: 'Factory rejected',
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
