/**
 * Messaging Service Types
 * Type definitions for SMS and WhatsApp messaging via Twilio
 * @see https://www.twilio.com/docs/messaging/api
 */

// =====================================================
// Channel Types
// =====================================================

export type MessagingChannelType = 'sms' | 'whatsapp';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'rejected' | 'expired';
export type MessageType = 'transactional' | 'marketing' | 'otp' | 'notification';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'not_required';
export type MediaType = 'image' | 'video' | 'document' | 'audio';

// =====================================================
// Database Models
// =====================================================

export interface MessagingChannel {
  id: string;
  channel_type: MessagingChannelType;
  provider: string;
  sender_id: string;
  display_name?: string;
  is_active: boolean;
  is_default: boolean;
  config: Record<string, any>;
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
  variables: string[];
  category: MessageType;
  // Twilio WhatsApp Content Templates
  whatsapp_content_sid?: string;
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
  channel: MessagingChannelType;
  to: string | string[];
  from?: string;
  content?: string;
  templateSlug?: string;
  variables?: Record<string, string>;
  mediaUrl?: string;
  mediaType?: MediaType;
  buttons?: MessageButton[];
  messageType?: MessageType;
  callbackData?: string;
  tags?: Record<string, string>;
  scheduledAt?: Date;
  // WhatsApp-specific (Twilio Content Templates)
  whatsappContentSid?: string;
  whatsappTemplateName?: string;
  whatsappTemplateNamespace?: string;
  whatsappLanguageCode?: string;
}

export interface SendBulkOptions extends Omit<SendMessageOptions, 'to'> {
  recipients: Array<{
    to: string;
    variables?: Record<string, string>;
  }>;
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
// Twilio API Types
// @see https://www.twilio.com/docs/messaging/api
// =====================================================

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
}

export interface TwilioMessageRequest {
  From: string;
  To: string;
  Body?: string;
  MediaUrl?: string;
  StatusCallback?: string;
  // WhatsApp Content Templates
  ContentSid?: string;
  ContentVariables?: string;
}

export interface TwilioMessageResponse {
  sid: string;
  account_sid: string;
  from: string;
  to: string;
  body: string;
  status: 'accepted' | 'queued' | 'sending' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'read';
  num_segments: string;
  num_media: string;
  direction: 'inbound' | 'outbound-api' | 'outbound-call' | 'outbound-reply';
  price?: string;
  price_unit?: string;
  error_code?: string;
  error_message?: string;
  date_created: string;
  date_updated: string;
  date_sent?: string;
}

export interface TwilioStatusCallback {
  MessageSid: string;
  MessageStatus: 'accepted' | 'queued' | 'sending' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'read';
  To: string;
  From: string;
  ApiVersion?: string;
  AccountSid?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  SmsSid?: string;
  SmsStatus?: string;
  ChannelPrefix?: string;
  Price?: string;
  PriceUnit?: string;
}

export interface TwilioIncomingMessage {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
  MediaContentType0?: string;
  MediaUrl0?: string;
  ProfileName?: string;
  WaId?: string;
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
