/**
 * Messaging Service Types — WhatsApp via Zernio (Meta Cloud API).
 *
 * SMS / Twilio removed. A channel is a connected Zernio WhatsApp account (WABA
 * number); a template references a Meta-approved WhatsApp template.
 * @see https://docs.zernio.com
 */

// =====================================================
// Channel Types
// =====================================================

export type MessagingChannelType = 'whatsapp';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'rejected' | 'expired';
export type MessageType = 'transactional' | 'marketing' | 'otp' | 'notification';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'not_required';
export type MediaType = 'image' | 'video' | 'document' | 'audio';
export type ConversationStatus = 'open' | 'snoozed' | 'closed';

// =====================================================
// Database Models
// =====================================================

export interface MessagingChannel {
  id: string;
  channel_type: MessagingChannelType;
  provider: string;               // 'zernio'
  sender_id: string;              // display phone number
  zernio_account_id?: string;     // Zernio WhatsApp account id
  display_name?: string;
  is_active: boolean;
  is_default: boolean;
  config: Record<string, any>;    // { waba_id, phone_number_id, display_phone_number, profile_id, ... }
  daily_quota: number;
  max_send_rate: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface MessagingTemplate {
  id: string;
  name: string;
  slug: string;
  description?: string;
  channel_type: MessagingChannelType;
  content: string;
  media_url?: string;
  media_type?: MediaType;
  buttons: MessageButton[];
  variables: string[];            // ordered variable names → WhatsApp body params
  category: MessageType;
  // Meta WhatsApp template binding
  whatsapp_template_name?: string;
  whatsapp_template_namespace?: string;
  whatsapp_language_code?: string;
  is_approved: boolean;
  approval_status: ApprovalStatus;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface MessagingLog {
  id: string;
  channel_type: MessagingChannelType;
  template_id?: string;
  channel_id?: string;
  provider_message_id?: string;
  bulk_id?: string;
  from_number: string;
  to_number: string;
  content?: string;
  media_url?: string;
  status: MessageStatus;
  message_type: MessageType;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  failed_at?: string;
  error_code?: string;
  error_message?: string;
  cost?: number;
  currency?: string;
  segment_count?: number;
  variables: Record<string, any>;
  tags: Record<string, any>;
  callback_data?: string;
  campaign_id?: string;
  created_by?: string;
  created_at: string;
}

export interface MessagingAnalytics {
  id: string;
  date: string;
  channel_type: MessagingChannelType;
  total_sent: number;
  total_delivered: number;
  total_read: number;
  total_failed: number;
  total_cost: number;
  segment_count: number;
  created_at: string;
  updated_at: string;
}

export interface MessagingCampaignRecipient {
  id: string;
  campaign_id: string;
  phone_number: string;
  contact_id?: string;
  contact_name?: string;
  status: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced' | 'opted_out';
  message_log_id?: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  failed_at?: string;
  error_message?: string;
  retry_count: number;
  variables: Record<string, any>;
  created_at: string;
}

export interface MessagingOptout {
  id: string;
  phone_number: string;
  channel_type: MessagingChannelType | 'all';
  opted_out_at: string;
  reason?: string;
  source: 'keyword' | 'manual' | 'api' | 'complaint';
  created_at: string;
}

// Inbound WhatsApp replies live in the unified inbox — inbox_threads /
// inbox_participants / inbox_messages, read via src/services/inboxApi.ts.

// =====================================================
// Message Buttons (for interactive messages)
// =====================================================

export interface MessageButton {
  type: 'url' | 'call' | 'quick_reply';
  text: string;
  url?: string;
  phone_number?: string;
  payload?: string;
}

// =====================================================
// Service Options
// =====================================================

export interface SendMessageOptions {
  to: string | string[];
  from?: string;                  // channel sender_id
  content?: string;               // freeform (24h window only)
  templateId?: string;
  templateVariables?: Record<string, string>;
  messageType?: MessageType;
}

export interface SendBulkOptions extends Omit<SendMessageOptions, 'to'> {
  recipients: Array<{
    to: string;
    variables?: Record<string, string>;
  }>;
}

/**
 * Headless connect — for a caller that ALREADY holds Meta credentials.
 * The default path for a human is the Embedded Signup redirect below, which never
 * asks for a token at all.
 */
export interface ConnectWhatsAppOptions {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  displayName?: string;
  workspaceId?: string;
}

/** Meta Embedded Signup, brokered by Zernio — same shape as the social OAuth flow. */
export interface WhatsAppOAuthStart {
  oauth_url: string;
  state: string | null;
  profile_id: string;
}

/**
 * Which Embedded Signup screen Meta shows.
 *  - `api`          standard WABA/number picker, for a number already on Cloud API
 *  - `business_app` coexistence: a number shared with the consumer WhatsApp Business app
 * Omitting it inherits Zernio's default, which is coexistence.
 */
export type WhatsAppOnboardingMode = 'api' | 'business_app';

/**
 * Whether the token behind each number still works.
 *
 * Orthogonal to `account-info`, which reports what META thinks of a number (quality, tier).
 * A revoked token keeps LISTING as a connected account, so nothing local distinguishes
 * "connected and idle" from "connected and unable to send".
 */
export interface ChannelHealthAccount {
  accountId: string;
  platform: string;
  username?: string;
  displayName?: string;
  status: 'healthy' | 'warning' | 'error';
  canPost?: boolean;
  tokenValid?: boolean;
  tokenExpiresAt?: string | null;
  needsReconnect?: boolean;
  issues?: string[];
}

export interface ChannelHealthResponse {
  summary: { total: number; healthy: number; warning: number; error: number; needsReconnect: number };
  accounts: ChannelHealthAccount[];
}

/** Both sides of the conversation — our own logs can only see what we sent. */
export interface InboxAnalyticsResponse {
  from: string;
  to: string | null;
  volume: {
    summary?: { received: number; sent: number; read: number; failed: number; uniqueConversations: number };
    timeseries?: Array<{ date: string; sent: number; received: number; read: number; failed: number }>;
    byPlatform?: Array<{ platform: string; sent: number; received: number; read: number; failed: number }>;
  } | null;
  responseTime: {
    summary?: {
      sampleSize: number; medianSeconds: number; p90Seconds: number; p99Seconds: number;
      meanSeconds: number; fastestSeconds: number; slowestSeconds: number;
    };
    histogram?: Array<{ bucket: string; lowerSeconds: number; upperSeconds: number; count: number }>;
  } | null;
  /** Per-endpoint failures — one endpoint 429ing must not blank the whole panel. */
  errors?: string[];
}

/**
 * Zernio plan headroom.
 *
 * `profileCeilingReached` is the one that matters: resolveWorkspaceProfile falls back to the
 * SHARED default profile when Zernio refuses a new one, so at the ceiling every further
 * workspace's accounts land together and tenant separation is gone — while the connect still
 * reports success.
 */
export interface ZernioPlanStatus {
  plan: string | null;
  status: string | null;
  profiles: { used: number; limit: number | null };
  accounts: { used: number; limit: number | null };
  profileCeilingReached: boolean;
  workspacesMapped: number;
  warning: string | null;
}

/** Zernio-side delivery registration for our webhook handler. */
export interface ZernioWebhookStatus {
  registered: boolean;
  webhookId?: string;
  url: string;
  isActive?: boolean;
  failureCount?: number;
  lastFiredAt?: string | null;
  missingEvents?: string[];
  secretConfigured: boolean;
  outcome?: 'created' | 'updated' | 'unchanged';
}

export interface MessageLogFilters {
  status?: MessageStatus;
  channelType?: MessagingChannelType;
  messageType?: MessageType;
  fromDate?: Date;
  toDate?: Date;
  phoneNumber?: string;
  limit?: number;
  offset?: number;
}

// =====================================================
// Analytics Response Types
// =====================================================

export interface MessagingAnalyticsResponse {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  totalCost: number;
  deliveryRate: number;
  readRate: number;
  failureRate: number;
  dailyData: MessagingAnalytics[];
}

// =====================================================
// Campaign Stats
// =====================================================

export interface MessagingCampaignStats {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  optedOut: number;
  deliveryRate: number;
  readRate: number;
  totalCost: number;
}

/** One number Zernio has on offer in a country. */
export interface AvailablePhoneNumber {
  phoneNumber: string;
  features: string[];
}

export interface PhoneNumberSearchResult {
  country: string;
  numberType: string | null;
  requireSms: boolean;
  numbers: AvailablePhoneNumber[];
}

/** A number this workspace holds — bought through us, or brought and connected by the tenant. */
export interface OwnedPhoneNumber {
  id: string;
  phoneNumber: string;
  country: string | null;
  status: string | null;
  profileId: string | null;
  /** NULL for a brought-your-own number: Zernio does not bill it and we must not imply a price. */
  monthlyCents: number | null;
  callingEnabled: boolean;
  broughtYourOwn: boolean;
  displayName: string | null;
}

/**
 * The three ways a purchase can end without failing. They are deliberately NOT collapsed into a
 * boolean: `checkout` means nothing is bought yet (Stripe still has to be paid) and `kyc_required`
 * means the country wants identity documents first. Reporting either as "purchased" would be a lie
 * the operator only discovers when the number never appears.
 */
export type PurchaseOutcome =
  | { kind: 'checkout'; message: string | null; checkoutUrl: string; workspace_id: string; profile_id: string }
  | { kind: 'kyc_required'; country: string | null; numberType: string | null; kycUrl: string; workspace_id: string; profile_id: string }
  | { kind: 'done'; message: string | null; workspace_id: string; profile_id: string };
