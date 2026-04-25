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
  MessageLogFilters,
  // Twilio types
  TwilioConfig,
  TwilioMessageRequest,
  TwilioMessageResponse,
  TwilioStatusCallback,
  TwilioIncomingMessage,
  // Analytics
  MessagingAnalyticsResponse,
  MessagingCampaignStats,
} from './types';
