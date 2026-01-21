/**
 * Messaging API Edge Function
 * Handles SMS, WhatsApp, and Viber messaging via Infobip
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =====================================================
// Types
// =====================================================

interface SendMessageRequest {
  channel: 'sms' | 'whatsapp' | 'viber';
  to: string | string[];
  from?: string;
  content?: string;
  templateSlug?: string;
  variables?: Record<string, string>;
  mediaUrl?: string;
  mediaType?: string;
  buttons?: Array<{ type: string; text: string; url?: string }>;
  messageType?: 'transactional' | 'marketing' | 'otp' | 'notification';
  callbackData?: string;
  tags?: Record<string, string>;
  // WhatsApp specific
  whatsappTemplateName?: string;
  whatsappTemplateNamespace?: string;
  whatsappLanguageCode?: string;
}

interface SendBulkRequest extends Omit<SendMessageRequest, 'to'> {
  recipients: Array<{
    to: string;
    variables?: Record<string, string>;
  }>;
}

// =====================================================
// Infobip API Client
// =====================================================

class InfobipClient {
  private apiKey: string;
  private baseUrl: string;
  private webhookUrl: string;

  constructor(apiKey: string, baseUrl: string, webhookUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.webhookUrl = webhookUrl;
  }

  private async request(endpoint: string, method: string, body?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `App ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.requestError?.serviceException?.text || error.message || 'Infobip API error');
    }

    return response.json();
  }

  // SMS
  async sendSms(params: {
    from: string;
    to: string | string[];
    text: string;
    callbackData?: string;
  }): Promise<any> {
    const destinations = (Array.isArray(params.to) ? params.to : [params.to]).map(to => ({ to }));

    return this.request('/sms/2/text/advanced', 'POST', {
      messages: [{
        from: params.from,
        destinations,
        text: params.text,
        notifyUrl: this.webhookUrl,
        notifyContentType: 'application/json',
        callbackData: params.callbackData,
      }],
    });
  }

  // WhatsApp Text
  async sendWhatsAppText(params: {
    from: string;
    to: string;
    text: string;
    callbackData?: string;
  }): Promise<any> {
    return this.request('/whatsapp/1/message/text', 'POST', {
      from: params.from,
      to: params.to,
      content: {
        text: params.text,
      },
      notifyUrl: this.webhookUrl,
      callbackData: params.callbackData,
    });
  }

  // WhatsApp Template
  async sendWhatsAppTemplate(params: {
    from: string;
    to: string;
    templateName: string;
    templateNamespace?: string;
    languageCode: string;
    placeholders: string[];
    callbackData?: string;
  }): Promise<any> {
    return this.request('/whatsapp/1/message/template', 'POST', {
      from: params.from,
      to: params.to,
      content: {
        templateName: params.templateName,
        templateData: {
          body: {
            placeholders: params.placeholders,
          },
        },
        language: params.languageCode,
      },
      notifyUrl: this.webhookUrl,
      callbackData: params.callbackData,
    });
  }

  // WhatsApp Media
  async sendWhatsAppMedia(params: {
    from: string;
    to: string;
    mediaUrl: string;
    mediaType: 'image' | 'video' | 'document' | 'audio';
    caption?: string;
    callbackData?: string;
  }): Promise<any> {
    const endpoint = `/whatsapp/1/message/${params.mediaType}`;
    const content: any = {
      mediaUrl: params.mediaUrl,
    };
    if (params.caption) {
      content.caption = params.caption;
    }

    return this.request(endpoint, 'POST', {
      from: params.from,
      to: params.to,
      content,
      notifyUrl: this.webhookUrl,
      callbackData: params.callbackData,
    });
  }

  // Viber
  async sendViber(params: {
    from: string;
    to: string | string[];
    text?: string;
    mediaUrl?: string;
    buttonText?: string;
    buttonUrl?: string;
    callbackData?: string;
  }): Promise<any> {
    const destinations = (Array.isArray(params.to) ? params.to : [params.to]);

    const messages = destinations.map(to => {
      const content: any = {};
      if (params.text) content.text = params.text;
      if (params.mediaUrl) {
        content.media = { url: params.mediaUrl };
      }
      if (params.buttonText && params.buttonUrl) {
        content.button = { text: params.buttonText, url: params.buttonUrl };
      }

      return {
        from: params.from,
        to,
        content,
        notifyUrl: this.webhookUrl,
        callbackData: params.callbackData,
      };
    });

    return this.request('/viber/1/message/promotional', 'POST', { messages });
  }

  // Get account balance
  // Endpoint: GET /account/1/balance
  // Docs: https://www.infobip.com/docs/api/platform/account-management/get-account-balance
  async getAccountBalance(): Promise<any> {
    return this.request('/account/1/balance', 'GET');
  }

  // Get all purchased/owned numbers (for SMS/Voice)
  // Endpoint: GET /numbers/1/numbers
  // Docs: https://www.infobip.com/docs/api/platform/numbers/phone-numbers/list-purchased-numbers
  async getOwnedNumbers(): Promise<any> {
    try {
      return await this.request('/numbers/1/numbers', 'GET');
    } catch (e) {
      // Numbers API might not be available on all accounts
      console.log('Numbers API not available:', e);
      return { numbers: [] };
    }
  }

  // Get WhatsApp senders/business accounts
  // Endpoint: GET /whatsapp/1/senders
  // Docs: https://www.infobip.com/docs/api/channels/whatsapp/whatsapp-service-management
  async getWhatsAppSenders(): Promise<any> {
    try {
      return await this.request('/whatsapp/1/senders', 'GET');
    } catch (e) {
      console.log('WhatsApp senders API error:', e);
      return { senders: [] };
    }
  }

  // Get WhatsApp sender quality
  // Endpoint: GET /whatsapp/1/senders/quality
  // Docs: https://www.infobip.com/docs/api/channels/whatsapp/whatsapp-service-management/get-whatsapp-senders-quality
  async getWhatsAppSendersQuality(): Promise<any> {
    try {
      return await this.request('/whatsapp/1/senders/quality', 'GET');
    } catch (e) {
      console.log('WhatsApp quality API error:', e);
      return { senders: [] };
    }
  }

  // Get Viber senders (service info)
  // Note: Viber sender management is typically done through the Infobip portal
  // This attempts to fetch registered Viber senders if the API supports it
  async getViberSenders(): Promise<any> {
    try {
      // Try to get Viber service info
      return await this.request('/viber/1/senders', 'GET');
    } catch (e) {
      console.log('Viber senders API not available:', e);
      return { senders: [] };
    }
  }

  // Get WhatsApp templates for a sender
  // Endpoint: GET /whatsapp/2/senders/{sender}/templates
  // Docs: https://www.infobip.com/docs/api/channels/whatsapp/whatsapp-service-management
  async getWhatsAppTemplates(sender: string): Promise<any> {
    return this.request(`/whatsapp/2/senders/${encodeURIComponent(sender)}/templates`, 'GET');
  }

  // Get delivery reports for SMS
  // Endpoint: GET /sms/1/reports
  // Docs: https://www.infobip.com/docs/api/channels/sms/sms-messaging/outbound-sms/get-outbound-sms-message-delivery-reports
  async getSmsDeliveryReports(params?: { bulkId?: string; messageId?: string; limit?: number }): Promise<any> {
    let endpoint = '/sms/1/reports';
    const queryParams = new URLSearchParams();
    if (params?.bulkId) queryParams.append('bulkId', params.bulkId);
    if (params?.messageId) queryParams.append('messageId', params.messageId);
    if (params?.limit) queryParams.append('limit', String(params.limit));

    const query = queryParams.toString();
    if (query) endpoint += `?${query}`;

    return this.request(endpoint, 'GET');
  }
}

// =====================================================
// Helper Functions
// =====================================================

function renderTemplate(content: string, variables: Record<string, string>): string {
  let rendered = content;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return rendered;
}

function extractPlaceholders(content: string): string[] {
  const matches = content.match(/{{(\w+)}}/g) || [];
  return matches.map(m => m.replace(/[{}]/g, ''));
}

// =====================================================
// Main Handler
// =====================================================

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get Infobip credentials from environment
    const infobipApiKey = Deno.env.get('INFOBIP_API_KEY');
    const infobipBaseUrl = Deno.env.get('INFOBIP_BASE_URL') || 'https://api.infobip.com';
    const webhookBaseUrl = Deno.env.get('SUPABASE_URL');
    const webhookUrl = `${webhookBaseUrl}/functions/v1/messaging-webhook`;

    if (!infobipApiKey) {
      throw new Error('Infobip API key not configured. Please set INFOBIP_API_KEY secret.');
    }

    const infobip = new InfobipClient(infobipApiKey, infobipBaseUrl, webhookUrl);

    // Parse request body
    const requestBody = req.method === 'POST' ? await req.json() : {};
    const action = requestBody.action;

    // Route handling
    switch (action) {
      // =====================================================
      // Send single message
      // =====================================================
      case 'send': {
        const body: SendMessageRequest = requestBody;

        if (!body.channel) {
          throw new Error('Channel type is required');
        }

        // Get sender from channel or use default
        let fromNumber = body.from;
        if (!fromNumber) {
          const { data: defaultChannel } = await supabaseClient
            .from('messaging_channels')
            .select('sender_id')
            .eq('channel_type', body.channel)
            .eq('is_default', true)
            .eq('is_active', true)
            .single();

          if (!defaultChannel) {
            throw new Error(`No default ${body.channel} channel configured`);
          }
          fromNumber = defaultChannel.sender_id;
        }

        // Get template if specified
        let content = body.content;
        let template: any = null;

        if (body.templateSlug) {
          const { data: templateData, error: templateError } = await supabaseClient
            .from('messaging_templates')
            .select('*')
            .eq('slug', body.templateSlug)
            .eq('is_active', true)
            .single();

          if (templateError || !templateData) {
            throw new Error(`Template not found: ${body.templateSlug}`);
          }

          template = templateData;
          content = renderTemplate(template.content, body.variables || {});
        }

        if (!content && !body.whatsappTemplateName) {
          throw new Error('Message content is required');
        }

        const toNumbers = Array.isArray(body.to) ? body.to : [body.to];

        // Check opt-outs
        const { data: optouts } = await supabaseClient
          .from('messaging_optouts')
          .select('phone_number')
          .in('phone_number', toNumbers)
          .or(`channel_type.eq.${body.channel},channel_type.eq.all`);

        const optedOutNumbers = new Set(optouts?.map(o => o.phone_number) || []);
        const validNumbers = toNumbers.filter(n => !optedOutNumbers.has(n));

        if (validNumbers.length === 0) {
          throw new Error('All recipients have opted out');
        }

        // Create callback data for tracking
        const callbackData = JSON.stringify({
          channel: body.channel,
          userId: user.id,
          tags: body.tags,
        });

        // Send via Infobip
        let response: any;

        switch (body.channel) {
          case 'sms':
            response = await infobip.sendSms({
              from: fromNumber,
              to: validNumbers,
              text: content!,
              callbackData,
            });
            break;

          case 'whatsapp':
            // WhatsApp only supports single recipient per request
            if (body.whatsappTemplateName) {
              // Send pre-approved template
              const placeholders = body.variables
                ? Object.values(body.variables)
                : extractPlaceholders(template?.content || '').map(p => body.variables?.[p] || '');

              response = await infobip.sendWhatsAppTemplate({
                from: fromNumber,
                to: validNumbers[0],
                templateName: body.whatsappTemplateName,
                templateNamespace: body.whatsappTemplateNamespace,
                languageCode: body.whatsappLanguageCode || 'en',
                placeholders,
                callbackData,
              });
            } else if (body.mediaUrl) {
              response = await infobip.sendWhatsAppMedia({
                from: fromNumber,
                to: validNumbers[0],
                mediaUrl: body.mediaUrl,
                mediaType: (body.mediaType as any) || 'image',
                caption: content,
                callbackData,
              });
            } else {
              response = await infobip.sendWhatsAppText({
                from: fromNumber,
                to: validNumbers[0],
                text: content!,
                callbackData,
              });
            }
            break;

          case 'viber':
            const buttonConfig = body.buttons?.[0];
            response = await infobip.sendViber({
              from: fromNumber,
              to: validNumbers,
              text: content,
              mediaUrl: body.mediaUrl,
              buttonText: buttonConfig?.text,
              buttonUrl: buttonConfig?.url,
              callbackData,
            });
            break;
        }

        // Log messages
        const messages = response.messages || [response];
        const logEntries = [];

        for (const msg of messages) {
          const { data: logData } = await supabaseClient
            .from('messaging_logs')
            .insert({
              channel_type: body.channel,
              template_id: template?.id,
              provider_message_id: msg.messageId,
              bulk_id: response.bulkId,
              from_number: fromNumber,
              to_number: msg.to,
              content,
              media_url: body.mediaUrl,
              status: msg.status?.groupName === 'PENDING' ? 'sent' : 'queued',
              message_type: body.messageType || 'marketing',
              sent_at: new Date().toISOString(),
              variables: body.variables || {},
              tags: body.tags || {},
              callback_data: callbackData,
              created_by: user.id,
            })
            .select()
            .single();

          logEntries.push(logData);
        }

        return new Response(
          JSON.stringify({
            success: true,
            messageId: messages[0]?.messageId,
            bulkId: response.bulkId,
            logId: logEntries[0]?.id,
            messages: logEntries,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Send bulk messages
      // =====================================================
      case 'send-bulk': {
        const body: SendBulkRequest = requestBody;

        if (!body.channel || !body.recipients || body.recipients.length === 0) {
          throw new Error('Channel and recipients are required');
        }

        // Get sender
        let fromNumber = body.from;
        if (!fromNumber) {
          const { data: defaultChannel } = await supabaseClient
            .from('messaging_channels')
            .select('sender_id')
            .eq('channel_type', body.channel)
            .eq('is_default', true)
            .eq('is_active', true)
            .single();

          if (!defaultChannel) {
            throw new Error(`No default ${body.channel} channel configured`);
          }
          fromNumber = defaultChannel.sender_id;
        }

        // Get template
        let template: any = null;
        if (body.templateSlug) {
          const { data: templateData } = await supabaseClient
            .from('messaging_templates')
            .select('*')
            .eq('slug', body.templateSlug)
            .eq('is_active', true)
            .single();

          template = templateData;
        }

        // Check opt-outs
        const allNumbers = body.recipients.map(r => r.to);
        const { data: optouts } = await supabaseClient
          .from('messaging_optouts')
          .select('phone_number')
          .in('phone_number', allNumbers)
          .or(`channel_type.eq.${body.channel},channel_type.eq.all`);

        const optedOutNumbers = new Set(optouts?.map(o => o.phone_number) || []);

        // Process recipients
        const results: any[] = [];
        const bulkId = crypto.randomUUID();

        for (const recipient of body.recipients) {
          if (optedOutNumbers.has(recipient.to)) {
            results.push({
              to: recipient.to,
              status: 'opted_out',
              error: 'Recipient has opted out',
            });
            continue;
          }

          const variables = { ...body.variables, ...recipient.variables };
          const content = template
            ? renderTemplate(template.content, variables)
            : renderTemplate(body.content || '', variables);

          try {
            const callbackData = JSON.stringify({
              channel: body.channel,
              userId: user.id,
              bulkId,
              tags: body.tags,
            });

            let response: any;

            switch (body.channel) {
              case 'sms':
                response = await infobip.sendSms({
                  from: fromNumber,
                  to: recipient.to,
                  text: content,
                  callbackData,
                });
                break;

              case 'whatsapp':
                response = await infobip.sendWhatsAppText({
                  from: fromNumber,
                  to: recipient.to,
                  text: content,
                  callbackData,
                });
                break;

              case 'viber':
                response = await infobip.sendViber({
                  from: fromNumber,
                  to: recipient.to,
                  text: content,
                  callbackData,
                });
                break;
            }

            const msg = response.messages?.[0] || response;

            // Log message
            await supabaseClient
              .from('messaging_logs')
              .insert({
                channel_type: body.channel,
                template_id: template?.id,
                provider_message_id: msg.messageId,
                bulk_id: bulkId,
                from_number: fromNumber,
                to_number: recipient.to,
                content,
                status: 'sent',
                message_type: body.messageType || 'marketing',
                sent_at: new Date().toISOString(),
                variables,
                tags: body.tags || {},
                callback_data: callbackData,
                created_by: user.id,
              });

            results.push({
              to: recipient.to,
              status: 'sent',
              messageId: msg.messageId,
            });
          } catch (error) {
            results.push({
              to: recipient.to,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            bulkId,
            total: body.recipients.length,
            sent: results.filter(r => r.status === 'sent').length,
            failed: results.filter(r => r.status === 'failed').length,
            optedOut: results.filter(r => r.status === 'opted_out').length,
            results,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Get channels
      // =====================================================
      case 'channels': {
        const { channelType } = requestBody;

        let query = supabaseClient
          .from('messaging_channels')
          .select('*')
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false });

        if (channelType) {
          query = query.eq('channel_type', channelType);
        }

        const { data, error } = await query;

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, channels: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Get templates
      // =====================================================
      case 'templates': {
        const { channelType } = requestBody;

        let query = supabaseClient
          .from('messaging_templates')
          .select('*')
          .order('created_at', { ascending: false });

        if (channelType) {
          query = query.eq('channel_type', channelType);
        }

        const { data, error } = await query;

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, templates: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Get message logs
      // =====================================================
      case 'logs': {
        const { channelType, status, messageType, limit = 50 } = requestBody;

        let query = supabaseClient
          .from('messaging_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (channelType) query = query.eq('channel_type', channelType);
        if (status) query = query.eq('status', status);
        if (messageType) query = query.eq('message_type', messageType);

        const { data, error } = await query;

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, logs: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Get analytics
      // =====================================================
      case 'analytics': {
        const { channelType, dateRange } = requestBody;

        let query = supabaseClient.from('messaging_analytics').select('*');

        if (channelType) {
          query = query.eq('channel_type', channelType);
        }
        if (dateRange?.start) {
          query = query.gte('date', dateRange.start);
        }
        if (dateRange?.end) {
          query = query.lte('date', dateRange.end);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Aggregate totals
        const totals = (data || []).reduce(
          (acc, row) => ({
            totalSent: acc.totalSent + (row.total_sent || 0),
            totalDelivered: acc.totalDelivered + (row.total_delivered || 0),
            totalRead: acc.totalRead + (row.total_read || 0),
            totalFailed: acc.totalFailed + (row.total_failed || 0),
            totalCost: acc.totalCost + parseFloat(row.total_cost || 0),
          }),
          { totalSent: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0, totalCost: 0 }
        );

        const deliveryRate = totals.totalSent > 0 ? (totals.totalDelivered / totals.totalSent) * 100 : 0;
        const readRate = totals.totalDelivered > 0 ? (totals.totalRead / totals.totalDelivered) * 100 : 0;
        const failureRate = totals.totalSent > 0 ? (totals.totalFailed / totals.totalSent) * 100 : 0;

        return new Response(
          JSON.stringify({
            success: true,
            ...totals,
            deliveryRate: parseFloat(deliveryRate.toFixed(2)),
            readRate: parseFloat(readRate.toFixed(2)),
            failureRate: parseFloat(failureRate.toFixed(2)),
            dailyData: data,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Get account balance
      // =====================================================
      case 'balance': {
        const balance = await infobip.getAccountBalance();

        return new Response(
          JSON.stringify({ success: true, ...balance }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Sync senders from Infobip
      // =====================================================
      case 'sync-senders': {
        const results: any = {
          sms: [],
          whatsapp: [],
          viber: [],
        };

        // Fetch owned numbers (for SMS/Voice)
        // Uses Numbers API: GET /numbers/1/numbers
        try {
          const ownedNumbers = await infobip.getOwnedNumbers();
          if (ownedNumbers?.numbers) {
            results.sms = ownedNumbers.numbers
              .filter((n: any) => n.capabilities?.includes('SMS') || n.type === 'SMS' || !n.capabilities)
              .map((n: any) => ({
                sender_id: n.numberKey || n.number || n.phoneNumber,
                display_name: n.name || n.description || n.number,
                status: n.status?.toLowerCase() || 'active',
                country: n.country,
                capabilities: n.capabilities,
              }));
          }
        } catch (e: any) {
          console.log('Could not fetch owned numbers:', e.message);
        }

        // Fetch WhatsApp senders
        // Uses WhatsApp API: GET /whatsapp/1/senders
        try {
          const whatsappSenders = await infobip.getWhatsAppSenders();
          const senderList = whatsappSenders?.senders || whatsappSenders?.results || whatsappSenders || [];
          if (Array.isArray(senderList)) {
            results.whatsapp = senderList.map((s: any) => ({
              sender_id: s.sender || s.phoneNumber || s.number || s.id,
              display_name: s.name || s.businessName || s.displayName || s.sender,
              status: s.status?.toLowerCase() || 'active',
              quality_rating: s.qualityRating || s.quality,
            }));
          }
        } catch (e: any) {
          console.log('Could not fetch WhatsApp senders:', e.message);
        }

        // Fetch Viber senders
        try {
          const viberSenders = await infobip.getViberSenders();
          const senderList = viberSenders?.senders || viberSenders?.results || viberSenders || [];
          if (Array.isArray(senderList)) {
            results.viber = senderList.map((s: any) => ({
              sender_id: s.sender || s.senderId || s.id || s.name,
              display_name: s.name || s.displayName || s.sender,
              status: s.status?.toLowerCase() || 'active',
            }));
          }
        } catch (e: any) {
          console.log('Could not fetch Viber senders:', e.message);
        }

        // Optionally auto-import to database
        const { autoImport } = requestBody;
        if (autoImport) {
          for (const channelType of ['sms', 'whatsapp', 'viber'] as const) {
            for (const sender of results[channelType]) {
              // Check if already exists
              const { data: existing } = await supabaseClient
                .from('messaging_channels')
                .select('id')
                .eq('channel_type', channelType)
                .eq('sender_id', sender.sender_id)
                .single();

              if (!existing) {
                // Insert new channel
                await supabaseClient
                  .from('messaging_channels')
                  .insert({
                    channel_type: channelType,
                    provider: 'infobip',
                    sender_id: sender.sender_id,
                    display_name: sender.display_name,
                    is_active: sender.status === 'active' || sender.status === 'ACTIVE',
                    is_default: false,
                    config: { imported_from_infobip: true, quality_rating: sender.quality_rating },
                    daily_quota: 10000,
                    max_send_rate: channelType === 'sms' ? 100 : 30,
                  });
              }
            }
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            senders: results,
            total: results.sms.length + results.whatsapp.length + results.viber.length,
            imported: autoImport ? true : false,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Fetch WhatsApp templates from Infobip
      // =====================================================
      case 'whatsapp-templates': {
        const { sender } = requestBody;

        if (!sender) {
          throw new Error('Sender is required to fetch WhatsApp templates');
        }

        const templates = await infobip.getWhatsAppTemplates(sender);

        return new Response(
          JSON.stringify({
            success: true,
            templates: templates?.templates || templates?.results || [],
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Send test message (for campaigns)
      // =====================================================
      case 'send-test': {
        const { campaignId, testNumber } = requestBody;

        // Get campaign
        const { data: campaign, error: campaignError } = await supabaseClient
          .from('campaigns')
          .select('*, template:messaging_templates(*), channel:messaging_channels(*)')
          .eq('id', campaignId)
          .single();

        if (campaignError || !campaign) {
          throw new Error('Campaign not found');
        }

        if (!campaign.template) {
          throw new Error('Campaign has no template assigned');
        }

        const content = renderTemplate(campaign.template.content, {
          name: 'Test User',
        });

        const fromNumber = campaign.channel?.sender_id;
        if (!fromNumber) {
          throw new Error('Campaign has no sender configured');
        }

        const callbackData = JSON.stringify({
          channel: campaign.channel_type,
          userId: user.id,
          campaignId,
          isTest: true,
        });

        let response: any;

        switch (campaign.channel_type) {
          case 'sms':
            response = await infobip.sendSms({
              from: fromNumber,
              to: testNumber,
              text: `[TEST] ${content}`,
              callbackData,
            });
            break;

          case 'whatsapp':
            response = await infobip.sendWhatsAppText({
              from: fromNumber,
              to: testNumber,
              text: `[TEST] ${content}`,
              callbackData,
            });
            break;

          case 'viber':
            response = await infobip.sendViber({
              from: fromNumber,
              to: testNumber,
              text: `[TEST] ${content}`,
              callbackData,
            });
            break;
        }

        return new Response(
          JSON.stringify({ success: true, messageId: response.messages?.[0]?.messageId || response.messageId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Error:', error);

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
