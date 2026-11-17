/**
 * Messaging Service Exports
 * Central export point for all messaging-related services and types
 */

// Services
export { messagingService, MessagingService } from './messagingService';
export { messagingCampaignService } from './messagingCampaignService';

// Types
export type {
  // Channel types
  MessagingChannelType,
  MessageStatus,
  MessageType,
  ApprovalStatus,
  MediaType,
  ConversationStatus,
  // Database models
  MessagingChannel,
  MessagingTemplate,
  MessagingLog,
  MessagingAnalytics,
  MessagingCampaignRecipient,
  MessagingOptout,
  // Message buttons
  MessageButton,
  // Service options
  SendMessageOptions,
  SendBulkOptions,
  ConnectWhatsAppOptions,
  MessageLogFilters,
  // Analytics
  MessagingAnalyticsResponse,
  MessagingCampaignStats,
} from './types';
