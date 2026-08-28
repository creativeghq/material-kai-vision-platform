/**
 * Messaging Service
 * Handles WhatsApp messaging via Zernio (Meta Cloud API) through Supabase Edge Functions.
 * SMS / Twilio removed.
 * @see https://docs.zernio.com
 *
 * IMPORTANT: the Zernio API key is resolved server-side (env-first / platform_secrets
 * fallback). All messaging operations go through the messaging-api Edge Function.
 */

import { supabase } from '@/integrations/supabase/client';
import { normalizeToE164 } from '../phoneNumber';
import { edgeErrorMessage } from '@/utils/edgeError';
import type {
  MessagingChannel,
  MessagingTemplate,
  MessagingLog,
  MessagingOptout,
  MessagingChannelType,
  SendMessageOptions,
  SendBulkOptions,
  ConnectWhatsAppOptions,
  WhatsAppOAuthStart,
  WhatsAppOnboardingMode,
  ZernioWebhookStatus,
  ZernioPlanStatus,
  PhoneNumberSearchResult,
  OwnedPhoneNumber,
  PurchaseOutcome,
  ChannelHealthResponse,
  InboxAnalyticsResponse,
  MessageLogFilters,
  MessagingAnalyticsResponse,
} from './types';

export class MessagingService {
  /**
   * Send a message via the messaging-api Edge Function
   */
  async sendMessage(options: SendMessageOptions): Promise<{ messageId: string; logId: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'send',
          ...options,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(await edgeErrorMessage(error, 'Failed to send message'));
      }

      if (!data || !data.messageId) {
        throw new Error('Invalid response from messaging service');
      }

      return data;
    } catch (error: any) {
      console.error('Error sending message:', error);

      if (error.message?.includes('FunctionsRelayError')) {
        throw new Error('Messaging service unavailable. Please check edge function deployment.');
      } else if (error.message?.includes('FunctionsHttpError')) {
        throw new Error('Messaging service error. Please check Zernio configuration.');
      }

      throw error;
    }
  }

  /**
   * Send bulk messages to multiple recipients
   */
  async sendBulk(options: SendBulkOptions): Promise<{ bulkId: string; messages: any[] }> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'send-bulk',
          ...options,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(await edgeErrorMessage(error, 'Failed to send bulk messages'));
      }

      return data;
    } catch (error: any) {
      console.error('Error sending bulk messages:', error);
      throw error;
    }
  }

  // =====================================================
  // Channel Management
  // =====================================================

  /**
   * Get all messaging channels
   */
  async getChannels(channelType?: MessagingChannelType): Promise<MessagingChannel[]> {
    let query = supabase
      .from('messaging_channels')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (channelType) {
      query = query.eq('channel_type', channelType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching messaging channels:', error);
      throw new Error('Failed to fetch messaging channels');
    }

    return data || [];
  }

  /**
   * Get default channel for a specific type
   */
  async getDefaultChannel(channelType: MessagingChannelType): Promise<MessagingChannel | null> {
    const { data, error } = await supabase
      .from('messaging_channels')
      .select('*')
      .eq('channel_type', channelType)
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching default channel:', error);
      return null;
    }

    return data;
  }

  /**
   * Create a new messaging channel
   */
  async createChannel(channel: Omit<MessagingChannel, 'id' | 'created_at' | 'updated_at'>): Promise<MessagingChannel> {
    const { data, error } = await supabase
      .from('messaging_channels')
      .insert(channel)
      .select()
      .single();

    if (error) {
      console.error('Error creating channel:', error);
      throw new Error('Failed to create messaging channel');
    }

    return data;
  }

  /**
   * Update a messaging channel
   */
  async updateChannel(id: string, updates: Partial<MessagingChannel>): Promise<MessagingChannel> {
    const { data, error } = await supabase
      .from('messaging_channels')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating channel:', error);
      throw new Error('Failed to update messaging channel');
    }

    return data;
  }

  /**
   * Delete a messaging channel
   */
  async deleteChannel(id: string): Promise<void> {
    const { error } = await supabase
      .from('messaging_channels')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting channel:', error);
      throw new Error('Failed to delete messaging channel');
    }
  }

  // =====================================================
  // Template Management
  // =====================================================

  /**
   * Get all messaging templates
   */
  async getTemplates(channelType?: MessagingChannelType): Promise<MessagingTemplate[]> {
    let query = supabase
      .from('messaging_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (channelType) {
      query = query.eq('channel_type', channelType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching messaging templates:', error);
      throw new Error('Failed to fetch messaging templates');
    }

    return data || [];
  }

  /**
   * Get template by slug
   */
  async getTemplateBySlug(slug: string): Promise<MessagingTemplate | null> {
    const { data, error } = await supabase
      .from('messaging_templates')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching template:', error);
      return null;
    }

    return data;
  }

  /**
   * Create a new messaging template
   */
  async createTemplate(template: Omit<MessagingTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<MessagingTemplate> {
    const { data, error } = await supabase
      .from('messaging_templates')
      .insert(template)
      .select()
      .single();

    if (error) {
      console.error('Error creating template:', error);
      throw new Error('Failed to create messaging template');
    }

    return data;
  }

  /**
   * Update a messaging template
   */
  async updateTemplate(id: string, updates: Partial<MessagingTemplate>): Promise<MessagingTemplate> {
    const { data, error } = await supabase
      .from('messaging_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating template:', error);
      throw new Error('Failed to update messaging template');
    }

    return data;
  }

  /**
   * Delete a messaging template
   */
  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .from('messaging_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting template:', error);
      throw new Error('Failed to delete messaging template');
    }
  }

  // =====================================================
  // Message Logs
  // =====================================================

  /**
   * Get message logs with filtering
   */
  async getMessageLogs(filters?: MessageLogFilters): Promise<MessagingLog[]> {
    let query = supabase
      .from('messaging_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.channelType) {
      query = query.eq('channel_type', filters.channelType);
    }
    if (filters?.messageType) {
      query = query.eq('message_type', filters.messageType);
    }
    if (filters?.phoneNumber) {
      query = query.eq('to_number', filters.phoneNumber);
    }
    if (filters?.fromDate) {
      query = query.gte('created_at', filters.fromDate.toISOString());
    }
    if (filters?.toDate) {
      query = query.lte('created_at', filters.toDate.toISOString());
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching message logs:', error);
      throw new Error('Failed to fetch message logs');
    }

    return data || [];
  }

  // =====================================================
  // Analytics
  // =====================================================

  /**
   * Get messaging analytics
   */
  async getAnalytics(
    channelType?: MessagingChannelType,
    dateRange?: { start: string; end: string },
  ): Promise<MessagingAnalyticsResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'analytics',
          channelType,
          dateRange,
        },
      });

      if (error) throw error;
      return {
        totalSent: data?.totalSent ?? 0,
        totalDelivered: data?.totalDelivered ?? 0,
        totalRead: data?.totalRead ?? 0,
        totalFailed: data?.totalFailed ?? 0,
        totalCost: data?.totalCost ?? 0,
        deliveryRate: data?.deliveryRate ?? 0,
        readRate: data?.readRate ?? 0,
        failureRate: data?.failureRate ?? 0,
        dailyData: data?.dailyData ?? [],
      };
    } catch (error) {
      console.error('Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Get WhatsApp account health (quality rating + messaging tier) from Zernio.
   * Replaces the former Twilio account-balance call.
   */
  async getAccountInfo(from?: string): Promise<Record<string, any>> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: { action: 'account-info', from },
      });
      if (error) throw error;
      return data || {};
    } catch (error) {
      console.error('Error getting account info:', error);
      return {};
    }
  }

  /**
   * Start Meta Embedded Signup, brokered by Zernio. Returns the URL to send the operator to;
   * Zernio redirects back with ?connected=whatsapp&accountId=… which finishWhatsAppOAuth()
   * turns into a channel. This is the DEFAULT connect path — no Meta token is ever typed
   * into this app, exactly like the social accounts flow.
   */
  async startWhatsAppOAuth(options: {
    workspaceId?: string;
    redirectUrl?: string;
    /**
     * Which Embedded Signup screen Meta shows. `api` = standard WABA/number picker (a number
     * already on Cloud API); `business_app` = coexistence, sharing a number with the consumer
     * WhatsApp Business app. Omitted means Zernio's default, which is coexistence.
     */
    onboarding?: WhatsAppOnboardingMode;
  } = {}): Promise<WhatsAppOAuthStart> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'connect-whatsapp-oauth', ...options },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to start WhatsApp connection'));
    if (data?.error) throw new Error(data.error);
    if (!data?.oauth_url) throw new Error('Zernio returned no authorisation URL');
    return data;
  }

  /**
   * Finish Embedded Signup — exchanges the Zernio accountId from the redirect for a channel.
   */
  async finishWhatsAppOAuth(options: {
    zernioAccountId: string;
    workspaceId?: string;
    displayName?: string;
  }): Promise<{ channel: MessagingChannel; account: any }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'connect-whatsapp-callback', ...options },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to finish connecting WhatsApp'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Headless connect for a caller that already holds Meta WABA credentials.
   * Prefer startWhatsAppOAuth() for anything a person drives.
   */
  async connectWhatsApp(options: ConnectWhatsAppOptions): Promise<{ channel: MessagingChannel; account: any }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'connect-whatsapp', ...options },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to connect WhatsApp'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  // ── Phone numbers ────────────────────────────────────────────────────────
  // Zernio sells numbers in 54 countries; until now the only route to a WhatsApp sender was
  // owning one already. All four are workspace-scoped server-side against the workspace's own
  // Zernio profile — the client cannot widen that by passing a different id.

  /** Availability in a country. A read: nothing is reserved and nothing is charged. */
  async searchPhoneNumbers(workspaceId: string, opts: {
    country: string;
    numberType?: string;
    prefix?: string;
    locality?: string;
    contains?: string;
    sms?: boolean;
    limit?: number;
  }): Promise<PhoneNumberSearchResult> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'search-phone-numbers', workspaceId, ...opts },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to search numbers'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Download the profile photos WhatsApp will give us.
   *
   * A photo is not pushed: `conversation.participantPicture` is optional on a webhook and was
   * absent on every real payload we measured, which is why every thread showed initials. It IS a
   * documented field on `GET /v1/inbox/conversations`, so this goes and reads it — the same
   * fetch-the-bytes rule that makes inbound attachments work.
   *
   * The counts come back separated on purpose: a run that finds no photos and a run that finds
   * photos it already had are the same "0 stored" and completely different problems.
   */
  async syncAvatars(workspaceId: string, threadId?: string): Promise<{
    conversations: number;
    with_picture: number;
    stored: number;
    own_avatar: boolean;
    message: string;
    errors?: string[];
  }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'sync-avatars', workspaceId, threadId },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to sync profile photos'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /** What this workspace already holds, bought or brought. */
  async listPhoneNumbers(workspaceId: string, status?: string): Promise<OwnedPhoneNumber[]> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'list-phone-numbers', workspaceId, status },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to list numbers'));
    if (data?.error) throw new Error(data.error);
    return data?.numbers ?? [];
  }

  /**
   * Buy a number into this workspace's Zernio profile, with WhatsApp enabled on it.
   *
   * `purchaseIntentId` is the idempotency key. It is generated by the CALLER and reused across
   * retries of the same intent — a fresh one per click would defeat both it and Zernio's own
   * 10-minute velocity check, which is the difference between one number and four.
   */
  async purchasePhoneNumber(workspaceId: string, opts: {
    country: string;
    numberType?: 'local' | 'mobile' | 'national' | 'toll_free';
    areaCode?: string;
    wantsSms?: boolean;
    purchaseIntentId: string;
  }): Promise<PurchaseOutcome> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'purchase-phone-number', workspaceId, ...opts },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to buy the number'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /** Release a purchased number. Irreversible; also disconnects the WhatsApp account on it. */
  async releasePhoneNumber(workspaceId: string, phoneNumberId: string): Promise<{ phoneNumber: string | null }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'release-phone-number', workspaceId, phoneNumberId },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to release the number'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Settle the failed months on THIS workspace and, if none is left outstanding, lift the hold.
   *
   * The tenant's own way off hold. Topping up credits does nothing on its own — the charge row
   * stays `failed` until something retries it, and before this the only retry was a nightly
   * cron, so paying at 09:00 bought you a day of silence.
   */
  async retryFailedCharges(workspaceId: string): Promise<{ settled: number; stillFailing: number; restored: number }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'retry-failed-charges', workspaceId },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Retry failed'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Turn the customer-visible read tick on or off for ONE number.
   *
   * Per channel, not per workspace: one business can run a sales line that wants blue ticks and a
   * support line that does not, and a single global flag forces the wrong answer on one of them.
   */
  async setChannelReadReceipts(channelId: string, enabled: boolean): Promise<void> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'set-channel-read-receipts', channelId, enabled },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to change read receipts'));
    if (data?.error) throw new Error(data.error);
  }

  /** Zernio plan headroom — see ZernioPlanStatus for why profileCeilingReached matters. */
  async getPlanStatus(): Promise<ZernioPlanStatus> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'plan-status' },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to read the Zernio plan'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Open (or find) the WhatsApp conversation for a phone number, and return its thread id.
   *
   * Sends NOTHING. "Does this number have WhatsApp" cannot be answered in advance — Meta withdrew
   * the contact-validation endpoint and nothing replaces it — so this opens the conversation and
   * lets the composer's own 24-hour-window rules apply, rather than a CRM button re-implementing
   * them or a green tick claiming something we cannot know.
   */
  async openWhatsAppThread(input: { phone: string; name?: string; workspaceId?: string }): Promise<{
    success: boolean; thread_id: string; created: boolean; note?: string;
  }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'open-whatsapp-thread', ...input },
    });
    if (error) throw error;
    return data;
  }

  /**
   * Download media we only hold a provider LINK to.
   *
   * An inbound media message arrives with `https://zernio.com/api/v1/whatsapp/media/{id}` — an
   * authenticated API endpoint, not a file. Until the bytes are pulled server-side the browser
   * renders a broken image, and a webhook fires once, so the row is stuck that way permanently.
   * Narrower than the back-fill: this touches only the rows that are actually broken.
   */
  async repairAttachments(options: { workspaceId?: string; threadId?: string; messageId?: string } = {}): Promise<{
    success: boolean; scanned: number; repaired: number; still_broken: number;
    message?: string; errors?: string[];
  }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'repair-attachments', ...options },
    });
    if (error) throw error;
    return data;
  }

  /**
   * Pull conversation history from Zernio into the inbox.
   *
   * Webhooks are push-only with no history — Zernio does not resend after a 200, and the
   * webhook was never registered at all before this, so everything that happened up to then
   * exists on the platform and nowhere here. There is no local signal for that: an empty inbox
   * and an inbox that missed a month are the same picture. Idempotent; safe to run twice.
   */
  async backfillInbox(options: { workspaceId?: string; limit?: number } = {}): Promise<{
    accounts: number; conversations: number; imported: number; errors?: string[]; truncated?: boolean; message?: string;
  }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'backfill-inbox', ...options },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to back-fill the inbox'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Live token health for every WhatsApp number this caller can see, from Zernio.
   * Also mirrors the verdict onto messaging_channels, so a number whose token died stops
   * showing a green "Active" badge whether or not anyone opens the health panel.
   */
  async getChannelHealth(): Promise<ChannelHealthResponse> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'channel-health' },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to read channel health'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Two-way inbox analytics (volume + time-to-first-response).
   * `getAnalytics()` counts only what WE sent, out of messaging_logs — it cannot see a reply,
   * so it cannot say whether anyone is being answered.
   */
  async getInboxAnalytics(options: { from?: string; fromDate?: string; toDate?: string } = {}): Promise<InboxAnalyticsResponse> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'inbox-analytics', ...options },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to load inbox analytics'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Is our webhook handler actually registered with Zernio?
   *
   * Nothing in this platform ever registered it, so the inbound path (replies, delivery
   * receipts, number health) was unreachable by construction. "No inbound messages" and
   * "Zernio was never told where to deliver" are indistinguishable without asking.
   */
  async getWebhookStatus(): Promise<ZernioWebhookStatus> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'webhook-status' },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to read webhook status'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /** Create or repair the Zernio webhook registration (also re-enables an auto-disabled one). */
  async registerWebhook(): Promise<ZernioWebhookStatus> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'register-webhook' },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to register the webhook'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Submit a WhatsApp template to Meta. Pass `libraryTemplateName` for one of Meta's
   * pre-approved library templates (usable immediately), or `components` for a custom
   * template (review can take up to 24h).
   */
  async createWhatsAppTemplate(options: {
    name: string;
    category: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY';
    language: string;
    components?: unknown[];
    libraryTemplateName?: string;
    from?: string;
  }): Promise<{ template: Record<string, unknown> }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'create-whatsapp-template', ...options },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to create the template'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Sync channels from Zernio — pulls connected WhatsApp accounts into messaging_channels.
   */
  async syncChannels(): Promise<{
    synced: number;
    channels: Array<{ action: string; senderId: string }>;
    message?: string;
    errors?: string[];
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: { action: 'sync-channels' },
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error syncing channels from Zernio:', error);
      throw error;
    }
  }

  /**
   * Get Meta-approved WhatsApp templates for the default (or given) channel's WABA.
   */
  async getWhatsAppTemplates(from?: string): Promise<any[]> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: { action: 'whatsapp-templates', from },
      });

      if (error) throw error;
      return data.templates || [];
    } catch (error) {
      console.error('Error fetching WhatsApp templates from Zernio:', error);
      throw error;
    }
  }

  // Inbound WhatsApp replies are captured into the unified inbox by the
  // zernio-webhook-handler (inbox_threads / inbox_participants / inbox_messages) and read
  // through inboxApi + the /inbox UI. The former messaging_conversations holding pen was
  // dropped — no separate conversation methods live here anymore.

  // =====================================================
  // Opt-out Management (Compliance)
  // =====================================================

  /**
   * Has this number opted out of this channel, for this workspace? (#359 CM-1)
   *
   * The previous version was true for almost everybody. Its filter was
   * `.or('phone_number.eq.X, channel_type.eq.whatsapp, channel_type.eq.all')` — three OR'd
   * conditions, so ANY whatsapp opt-out anywhere on the platform satisfied it regardless of the
   * number asked about. The phone was also interpolated into a PostgREST filter unescaped, so a
   * value containing a comma or a parenthesis rewrote the query.
   *
   * And it returned FALSE on error: a compliance check that answers "go ahead" when it cannot run.
   *
   * All three are gone: one SQL verdict, normalized on both sides, workspace-scoped, and a thrown
   * error rather than a cheerful false.
   */
  async checkOptOut(
    workspaceId: string,
    phoneNumber: string,
    channelType: MessagingChannelType = 'whatsapp',
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('messaging_number_is_opted_out', {
      p_workspace_id: workspaceId,
      p_phone: phoneNumber,
      p_channel_type: channelType,
    });
    if (error) throw new Error(`Could not check the opt-out list: ${error.message}`);
    return data === true;
  }

  /**
   * Add a phone number to opt-out list
   */
  async addOptOut(
    workspaceId: string,
    phoneNumber: string,
    channelType: MessagingChannelType | 'all',
    reason?: string,
    source: 'keyword' | 'manual' | 'api' | 'complaint' = 'manual',
  ): Promise<void> {
    // Through the RPC: uniqueness is a pair of PARTIAL indexes, which PostgREST's `onConflict`
    // cannot target — and this upsert did not name one at all, so a second opt-out for the same
    // number raised a duplicate-key error rather than refreshing the first.
    const { error } = await supabase.rpc('messaging_record_optout', {
      p_workspace_id: workspaceId,
      p_phone: phoneNumber,
      p_channel_type: channelType,
      p_reason: reason ?? null,
      p_source: source,
    });
    if (error) throw new Error(`Failed to add opt-out: ${error.message}`);
  }

  /**
   * Remove a phone number from opt-out list
   */
  async removeOptOut(
    workspaceId: string,
    phoneNumber: string,
    channelType: MessagingChannelType | 'all',
  ): Promise<void> {
    // Scoped: lifting one business's opt-out must not clear another's, and the raw delete matched
    // on `phone_number` as typed — so it missed the same person stored in a different shape.
    const { error } = await supabase.rpc('messaging_clear_optout', {
      p_workspace_id: workspaceId,
      p_phone: phoneNumber,
      p_channel_type: channelType,
    });
    if (error) throw new Error(`Failed to remove opt-out: ${error.message}`);
  }

  /**
   * Get all opt-outs
   */
  async getOptOuts(workspaceId: string, channelType?: MessagingChannelType | 'all'): Promise<MessagingOptout[]> {
    // Explicitly workspace-filtered as well as RLS-scoped. The table had RLS ENABLED with no
    // policies at all, so this screen rendered an empty list to everybody — and the empty result
    // is what hid `checkOptOut`'s always-true filter for as long as it existed.
    let query = supabase
      .from('messaging_optouts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('opted_out_at', { ascending: false });

    if (channelType) {
      query = query.eq('channel_type', channelType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching opt-outs:', error);
      throw new Error('Failed to fetch opt-outs');
    }

    return data || [];
  }

  // =====================================================
  // Utility Methods
  // =====================================================

  /**
   * Render template with variables
   */
  renderTemplate(content: string, variables: Record<string, string>): string {
    let rendered = content;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return rendered;
  }

  /**
   * Validate phone number format (E.164)
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    return normalizeToE164(phoneNumber) !== null;
  }

  /**
   * Normalize phone number to E.164 format
   */
  normalizePhoneNumber(phoneNumber: string): string | null {
    return normalizeToE164(phoneNumber);
  }
}

// Export singleton instance
export const messagingService = new MessagingService();
