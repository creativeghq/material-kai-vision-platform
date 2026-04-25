/**
 * Notification Service
 * Unified notification system supporting email, push, webhook, SMS, and WhatsApp via Twilio
 */

import { supabase } from '@/integrations/supabase/client';
import { emailService } from '@/modules/email/services/emailService';
import { messagingService } from '@/services/messaging';

// =====================================================
// TYPES
// =====================================================
export type NotificationChannel = 'email' | 'push' | 'webhook' | 'sms' | 'whatsapp';
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'cancelled';

export interface NotificationPayload {
  userId: string;
  notificationType: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels?: NotificationChannel[]; // If not specified, use user preferences
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  notification_type: string;
  channel_type: NotificationChannel;
  is_enabled: boolean;
  config: Record<string, any>;
}

export interface WebhookEndpoint {
  id: string;
  user_id: string;
  name: string;
  url: string;
  secret?: string;
  is_active: boolean;
  events: string[];
  headers: Record<string, string>;
  retry_config: {
    max_retries: number;
    retry_delay_seconds: number;
  };
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  is_active: boolean;
}

// =====================================================
// NOTIFICATION SERVICE
// =====================================================
export class NotificationService {
  /**
   * Send a notification through all enabled channels
   */
  async send(payload: NotificationPayload): Promise<{ success: boolean; results: any[] }> {
    try {
      // Get user's enabled channels for this notification type
      const channels = payload.channels || await this.getUserEnabledChannels(
        payload.userId,
        payload.notificationType,
      );

      if (channels.length === 0) {
        console.log(`No enabled channels for user ${payload.userId}, notification type ${payload.notificationType}`);
        return { success: true, results: [] };
      }

      // Send through each channel
      const results = await Promise.allSettled(
        channels.map(channel => this.sendToChannel(channel, payload)),
      );

      return {
        success: results.some(r => r.status === 'fulfilled'),
        results: results.map((r, i) => ({
          channel: channels[i],
          status: r.status,
          result: r.status === 'fulfilled' ? r.value : r.reason,
        })),
      };
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Get user's enabled notification channels for a specific type
   */
  private async getUserEnabledChannels(
    userId: string,
    notificationType: string,
  ): Promise<NotificationChannel[]> {
    const { data, error } = await supabase
      .from('user_notification_preferences')
      .select('channel_type')
      .eq('user_id', userId)
      .eq('notification_type', notificationType)
      .eq('is_enabled', true);

    if (error) {
      console.error('Error fetching user preferences:', error);
      // Fallback to default channels
      return await this.getDefaultChannels(notificationType);
    }

    if (!data || data.length === 0) {
      // No preferences set, use defaults
      return await this.getDefaultChannels(notificationType);
    }

    return data.map(p => p.channel_type as NotificationChannel);
  }

  /**
   * Get default channels for a notification type
   */
  private async getDefaultChannels(notificationType: string): Promise<NotificationChannel[]> {
    const { data } = await supabase
      .from('notification_types')
      .select('default_channels')
      .eq('type_key', notificationType)
      .single();

    return data?.default_channels || ['email'];
  }

  /**
   * Send notification to a specific channel
   */
  private async sendToChannel(
    channel: NotificationChannel,
    payload: NotificationPayload,
  ): Promise<any> {
    // Create notification log entry
    const { data: notification, error: logError } = await supabase
      .from('notifications')
      .insert({
        user_id: payload.userId,
        notification_type: payload.notificationType,
        channel_type: channel,
        status: 'pending',
        title: payload.title,
        message: payload.message,
        data: payload.data || {},
      })
      .select()
      .single();

    if (logError) {
      console.error('Error creating notification log:', logError);
      throw logError;
    }

    try {
      let result;
      switch (channel) {
        case 'email':
          result = await this.sendEmail(payload);
          break;
        case 'push':
          result = await this.sendPush(payload);
          break;
        case 'webhook':
          result = await this.sendWebhook(payload);
          break;
        case 'sms':
          result = await this.sendSms(payload);
          break;
        case 'whatsapp':
          result = await this.sendWhatsApp(payload);
          break;
        default:
          throw new Error(`Unknown channel: ${channel}`);
      }

      // Update notification status to sent
      await supabase
        .from('notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          metadata: result,
        })
        .eq('id', notification.id);

      return result;
    } catch (error) {
      // Update notification status to failed
      await supabase
        .from('notifications')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
        .eq('id', notification.id);

      throw error;
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(payload: NotificationPayload): Promise<any> {
    // Get user's email
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user?.email) {
      throw new Error('User email not found');
    }

    // Send email using existing email service
    const result = await emailService.sendEmail({
      to: user.user.email,
      subject: payload.title,
      html: this.formatEmailHtml(payload),
      text: payload.message,
      emailType: 'notification',
      tags: {
        notification_type: payload.notificationType,
        user_id: payload.userId,
      },
    });

    return {
      message_id: result.messageId,
      log_id: result.logId,
    };
  }

  /**
   * Send push notification
   */
  private async sendPush(payload: NotificationPayload): Promise<any> {
    // Get user's active push subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('is_active', true);

    if (error || !subscriptions || subscriptions.length === 0) {
      throw new Error('No active push subscriptions found');
    }

    // Send to notification dispatcher Edge Function
    const { data, error: dispatchError } = await supabase.functions.invoke('notification-dispatcher', {
      body: {
        action: 'send-push',
        subscriptions,
        notification: {
          title: payload.title,
          body: payload.message,
          data: payload.data,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
        },
      },
    });

    if (dispatchError) throw dispatchError;
    return data;
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(payload: NotificationPayload): Promise<any> {
    // Get user's active webhooks for this event type
    const { data: webhooks, error } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('is_active', true)
      .contains('events', [payload.notificationType]);

    if (error || !webhooks || webhooks.length === 0) {
      throw new Error('No active webhooks found for this event type');
    }

    // Send to notification dispatcher Edge Function
    const { data, error: dispatchError } = await supabase.functions.invoke('notification-dispatcher', {
      body: {
        action: 'send-webhook',
        webhooks,
        payload: {
          event: payload.notificationType,
          timestamp: new Date().toISOString(),
          data: {
            title: payload.title,
            message: payload.message,
            ...payload.data,
          },
        },
      },
    });

    if (dispatchError) throw dispatchError;
    return data;
  }

  /**
   * Send SMS notification via Twilio
   */
  private async sendSms(payload: NotificationPayload): Promise<any> {
    // Get user's phone number from preferences or profile
    const phoneNumber = await this.getUserPhoneNumber(payload.userId);
    if (!phoneNumber) {
      throw new Error('User phone number not found');
    }

    // Check if user has opted out
    const hasOptedOut = await messagingService.checkOptOut(phoneNumber, 'sms');
    if (hasOptedOut) {
      throw new Error('User has opted out of SMS notifications');
    }

    // Send SMS using messaging service
    const result = await messagingService.sendMessage({
      channel: 'sms',
      to: phoneNumber,
      content: `${payload.title}\n\n${payload.message}`,
      messageType: 'notification',
      tags: {
        notification_type: payload.notificationType,
        user_id: payload.userId,
      },
    });

    return {
      message_id: result.messageId,
      log_id: result.logId,
    };
  }

  /**
   * Send WhatsApp notification via Twilio
   */
  private async sendWhatsApp(payload: NotificationPayload): Promise<any> {
    // Get user's phone number
    const phoneNumber = await this.getUserPhoneNumber(payload.userId);
    if (!phoneNumber) {
      throw new Error('User phone number not found');
    }

    // Check if user has opted out
    const hasOptedOut = await messagingService.checkOptOut(phoneNumber, 'whatsapp');
    if (hasOptedOut) {
      throw new Error('User has opted out of WhatsApp notifications');
    }

    // Send WhatsApp using messaging service
    const result = await messagingService.sendMessage({
      channel: 'whatsapp',
      to: phoneNumber,
      content: `*${payload.title}*\n\n${payload.message}`,
      messageType: 'notification',
      tags: {
        notification_type: payload.notificationType,
        user_id: payload.userId,
      },
    });

    return {
      message_id: result.messageId,
      log_id: result.logId,
    };
  }

  /**
   * Get user's phone number from profile or preferences
   */
  private async getUserPhoneNumber(userId: string): Promise<string | null> {
    // Try to get from user metadata
    const { data: userData } = await supabase
      .from('profiles')
      .select('phone_number')
      .eq('id', userId)
      .single();

    if (userData?.phone_number) {
      return userData.phone_number;
    }

    // Try to get from notification preferences config
    const { data: prefData } = await supabase
      .from('user_notification_preferences')
      .select('config')
      .eq('user_id', userId)
      .in('channel_type', ['sms', 'whatsapp'])
      .not('config->phone_number', 'is', null)
      .limit(1)
      .single();

    if (prefData?.config?.phone_number) {
      return prefData.config.phone_number;
    }

    return null;
  }

  /**
   * Format email HTML
   */
  private formatEmailHtml(payload: NotificationPayload): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Open Sans', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${payload.title}</h1>
            </div>
            <div class="content">
              <p>${payload.message}</p>
              ${payload.data?.action_url ? `<a href="${payload.data.action_url}" class="button">View Details</a>` : ''}
            </div>
            <div class="footer">
              <p>Materials Hub</p>
              <p>You received this email because you have notifications enabled for this event type.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // =====================================================
  // USER PREFERENCE MANAGEMENT
  // =====================================================
  /**
   * Get user's notification preferences
   */
  async getUserPreferences(userId: string): Promise<NotificationPreference[]> {
    const { data, error } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data || [];
  }

  /**
   * Update user's notification preference
   */
  async updatePreference(
    userId: string,
    notificationType: string,
    channelType: NotificationChannel,
    isEnabled: boolean,
    config?: Record<string, any>,
  ): Promise<void> {
    const { error } = await supabase
      .from('user_notification_preferences')
      .upsert({
        user_id: userId,
        notification_type: notificationType,
        channel_type: channelType,
        is_enabled: isEnabled,
        config: config || {},
      });

    if (error) throw error;
  }

  // =====================================================
  // WEBHOOK MANAGEMENT
  // =====================================================
  /**
   * Create webhook endpoint
   */
  async createWebhook(webhook: Omit<WebhookEndpoint, 'id'>): Promise<WebhookEndpoint> {
    const { data, error } = await supabase
      .from('webhook_endpoints')
      .insert(webhook)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get user's webhooks
   */
  async getUserWebhooks(userId: string): Promise<WebhookEndpoint[]> {
    const { data, error } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data || [];
  }

  // =====================================================
  // PUSH SUBSCRIPTION MANAGEMENT
  // =====================================================
  /**
   * Register push subscription
   */
  async registerPushSubscription(
    userId: string,
    subscription: PushSubscriptionJSON,
  ): Promise<void> {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh_key: subscription.keys?.p256dh || '',
        auth_key: subscription.keys?.auth || '',
        is_active: true,
      });

    if (error) throw error;
  }

  /**
   * Unregister push subscription
   */
  async unregisterPushSubscription(endpoint: string): Promise<void> {
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('endpoint', endpoint);

    if (error) throw error;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
