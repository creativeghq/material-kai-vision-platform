/**
 * Messaging Service Types
 * Type definitions for SMS, WhatsApp, and Viber messaging via Infobip
 */

// =====================================================
// Channel Types
// =====================================================

export type MessagingChannelType = 'sms' | 'whatsapp' | 'viber';
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
  // WhatsApp-specific
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
// Infobip API Types
// =====================================================

export interface InfobipConfig {
  apiKey: string;
  baseUrl: string;
}

export interface InfobipSmsRequest {
  messages: Array<{
    from: string;
    destinations: Array<{ to: string; messageId?: string }>;
    text: string;
    notifyUrl?: string;
    notifyContentType?: string;
    callbackData?: string;
  }>;
}

export interface InfobipWhatsAppTextRequest {
  from: string;
  to: string;
  messageId?: string;
  content: {
    text: string;
  };
  callbackData?: string;
  notifyUrl?: string;
}

export interface InfobipWhatsAppTemplateRequest {
  from: string;
  to: string;
  messageId?: string;
  content: {
    templateName: string;
    templateData: {
      body: {
        placeholders: string[];
      };
    };
    language: string;
  };
  callbackData?: string;
  notifyUrl?: string;
}

export interface InfobipWhatsAppMediaRequest {
  from: string;
  to: string;
  messageId?: string;
  content: {
    mediaUrl: string;
    caption?: string;
  };
  callbackData?: string;
  notifyUrl?: string;
}

export interface InfobipViberRequest {
  messages: Array<{
    from: string;
    to: string;
    content: {
      text?: string;
      media?: {
        url: string;
        type?: string;
      };
      button?: {
        text: string;
        url: string;
      };
    };
    callbackData?: string;
    notifyUrl?: string;
  }>;
}

export interface InfobipResponse {
  bulkId?: string;
  messages: Array<{
    to: string;
    status: {
      groupId: number;
      groupName: string;
      id: number;
      name: string;
      description: string;
    };
    messageId: string;
  }>;
}

export interface InfobipDeliveryReport {
  results: Array<{
    bulkId?: string;
    messageId: string;
    to: string;
    sender?: string;
    sentAt?: string;
    doneAt?: string;
    messageCount?: number;
    price?: {
      pricePerMessage: number;
      currency: string;
    };
    status: {
      groupId: number;
      groupName: 'PENDING' | 'UNDELIVERABLE' | 'DELIVERED' | 'EXPIRED' | 'REJECTED' | 'ACCEPTED';
      id: number;
      name: string;
      description: string;
    };
    error?: {
      groupId: number;
      groupName: string;
      id: number;
      name: string;
      description: string;
      permanent: boolean;
    };
    callbackData?: string;
  }>;
}

export interface InfobipSeenReport {
  results: Array<{
    messageId: string;
    to: string;
    seenAt: string;
    callbackData?: string;
  }>;
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
