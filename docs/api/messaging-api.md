# Messaging API

## Overview

The Messaging API is a Supabase Edge Function that handles multi-channel messaging (SMS, WhatsApp) using **Twilio** as the unified provider.

**Edge Function:** `messaging-api`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/messaging-api`
**Twilio Docs:** https://www.twilio.com/docs/messaging/api

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

## Provider: Twilio

The messaging service uses [Twilio](https://www.twilio.com/docs/messaging/api) for all channels:
- **SMS**: Send SMS with sender ID support - [Docs](https://www.twilio.com/docs/messaging/services/api)
- **WhatsApp**: Text, template, and media messages - [Docs](https://www.twilio.com/docs/whatsapp/api)

### Twilio Authentication

Twilio uses Basic authentication with Account SID and Auth Token.

## Actions

The API uses an action-based routing system. All requests are POST with an `action` parameter.

### 1. Send Message

Send a single message via SMS or WhatsApp.

**Action:** `send`

**Request:**
```typescript
{
  action: 'send',
  channel: 'sms' | 'whatsapp',           // Channel type (required)
  to: string,                             // Recipient phone number (E.164 format)
  from?: string,                          // Sender ID (uses default if not provided)
  content?: string,                       // Message content (required if no template)
  templateSlug?: string,                  // Template slug from messaging_templates
  variables?: Record<string, string>,     // Variables for template rendering
  mediaUrl?: string,                      // Media URL for MMS/rich messages
  messageType?: 'transactional' | 'marketing' | 'otp',
  tags?: Record<string, string>,          // Custom tags for tracking
  // WhatsApp template specific
  whatsappContentSid?: string,            // Twilio Content SID for approved templates
}
```

**Response:**
```typescript
{
  success: true,
  messageId: string,    // Twilio message SID
  logId: string         // messaging_logs record ID
}
```

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('messaging-api', {
  body: {
    action: 'send',
    channel: 'sms',
    to: '+306912345678',
    content: 'Your order #12345 has been shipped!',
    messageType: 'transactional'
  }
});
```

### 2. Send Bulk Messages

Send messages to multiple recipients.

**Action:** `send-bulk`

**Request:**
```typescript
{
  action: 'send-bulk',
  channel: 'sms' | 'whatsapp',
  recipients: Array<{
    to: string,
    variables?: Record<string, string>
  }>,
  from?: string,
  content?: string,
  templateSlug?: string,
  variables?: Record<string, string>,       // Applied to all messages
  messageType?: 'transactional' | 'marketing' | 'otp',
  tags?: Record<string, string>
}
```

**Response:**
```typescript
{
  success: true,
  bulkId: string,
  total: number,
  sent: number,
  failed: number,
  optedOut: number,
  results: Array<{
    to: string,
    status: 'sent' | 'failed' | 'opted_out',
    messageId?: string,
    error?: string
  }>
}
```

### 3. Get Channels

Retrieve configured messaging channels.

**Action:** `channels`

**Request:**
```typescript
{
  action: 'channels',
  channelType?: 'sms' | 'whatsapp'  // Filter by type
}
```

**Response:**
```typescript
{
  success: true,
  channels: Array<{
    id: string,
    channel_type: 'sms' | 'whatsapp',
    provider: 'twilio',
    sender_id: string,
    display_name: string,
    is_active: boolean,
    is_default: boolean,
    config: {
      messaging_service_sid?: string    // For WhatsApp
    },
    daily_quota: number,
    max_send_rate: number
  }>
}
```

### 4. Get Templates

Retrieve messaging templates.

**Action:** `templates`

**Request:**
```typescript
{
  action: 'templates',
  channelType?: 'sms' | 'whatsapp'
}
```

**Response:**
```typescript
{
  success: true,
  templates: Array<{
    id: string,
    name: string,
    slug: string,
    channel_type: string,
    content: string,
    variables: string[],
    category: string,
    is_approved: boolean,        // For WhatsApp templates
    is_active: boolean,
    created_at: string,
    updated_at: string
  }>
}
```

### 5. Get Message Logs

Retrieve message delivery logs.

**Action:** `logs`

**Request:**
```typescript
{
  action: 'logs',
  channelType?: 'sms' | 'whatsapp',
  status?: 'queued' | 'sent' | 'delivered' | 'read' | 'failed',
  messageType?: 'transactional' | 'marketing' | 'otp',
  limit?: number               // Default: 50
}
```

**Response:**
```typescript
{
  success: true,
  logs: Array<{
    id: string,
    channel_type: string,
    from_number: string,
    to_number: string,
    content: string,
    status: string,
    sent_at: string | null,
    delivered_at: string | null,
    read_at: string | null,
    failed_at: string | null,
    error_code: string | null,
    error_message: string | null,
    cost: number | null,
    currency: string,
    segment_count: number | null,
    created_at: string
  }>
}
```

### 6. Get Analytics

Retrieve messaging analytics and statistics.

**Action:** `analytics`

**Request:**
```typescript
{
  action: 'analytics',
  channelType?: 'sms' | 'whatsapp',
  dateRange?: {
    start: string,    // ISO date string
    end: string       // ISO date string
  }
}
```

**Response:**
```typescript
{
  success: true,
  totalSent: number,
  totalDelivered: number,
  totalRead: number,
  totalFailed: number,
  totalCost: number,
  deliveryRate: number,      // Percentage
  readRate: number,          // Percentage
  failureRate: number,       // Percentage
  dailyData: Array<{
    date: string,
    channel_type: string,
    total_sent: number,
    total_delivered: number,
    total_read: number,
    total_failed: number,
    total_cost: number
  }>
}
```

### 7. Get Account Balance

Check Twilio account balance.

**Action:** `balance`

**Request:**
```typescript
{
  action: 'balance'
}
```

**Response:**
```typescript
{
  success: true,
  balance: number,
  currency: string,
  raw: object           // Full Twilio response
}
```

### 8. Send Test Message

Send a test message for campaign preview.

**Action:** `send-test`

**Request:**
```typescript
{
  action: 'send-test',
  campaignId: string,     // Campaign ID
  testNumber: string      // Test phone number
}
```

**Response:**
```typescript
{
  success: true,
  messageId: string
}
```

## Webhook Endpoint

The `messaging-webhook` edge function handles delivery reports and status callbacks from Twilio.

**Edge Function:** `messaging-webhook`
**URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/messaging-webhook`

### Webhook Types

Use query parameter `?type=` to specify webhook type:

| Type | Description |
|------|-------------|
| `status` (default) | Delivery reports (SMS, WhatsApp) |
| `incoming` | Incoming messages (SMS, WhatsApp) |

### Twilio Status Callback Payload

Twilio sends status callbacks as form-urlencoded POST data:

```typescript
{
  MessageSid: string,
  MessageStatus: 'accepted' | 'queued' | 'sending' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'read',
  To: string,
  From: string,
  ErrorCode?: string,
  ErrorMessage?: string,
  Price?: string,
  PriceUnit?: string
}
```

### Supported Events

| Event | Action |
|-------|--------|
| `delivered` | Updates message status to 'delivered' |
| `read` | Updates message status to 'read' |
| `undelivered` / `failed` | Updates message status to 'failed' |
| Incoming STOP keyword | Adds to opt-out list |

## Database Schema

### messaging_channels

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| channel_type | TEXT | 'sms' or 'whatsapp' |
| provider | TEXT | 'twilio' |
| sender_id | TEXT | Phone number in E.164 format |
| display_name | TEXT | Friendly name |
| is_active | BOOLEAN | Whether channel is active |
| is_default | BOOLEAN | Default channel for type |
| config | JSONB | Twilio-specific config (messaging_service_sid for WhatsApp) |
| daily_quota | INTEGER | Daily sending limit |
| max_send_rate | INTEGER | Messages per minute |

### messaging_templates

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Template name |
| slug | TEXT | Unique slug |
| channel_type | TEXT | Channel type |
| content | TEXT | Message body with {{variables}} |
| media_url | TEXT | Media URL for rich messages |
| buttons | JSONB | Interactive buttons |
| variables | TEXT[] | List of variable names |
| category | TEXT | 'transactional', 'marketing', 'otp' |
| whatsapp_content_sid | TEXT | Twilio Content SID for approved templates |
| is_approved | BOOLEAN | WhatsApp approval status |
| is_active | BOOLEAN | Whether template is active |

### messaging_logs

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| channel_type | TEXT | Channel used |
| template_id | UUID | FK to messaging_templates |
| channel_id | UUID | FK to messaging_channels |
| provider_message_id | TEXT | Twilio message SID |
| from_number | TEXT | Sender |
| to_number | TEXT | Recipient |
| content | TEXT | Message content |
| status | TEXT | Delivery status |
| sent_at | TIMESTAMPTZ | When sent |
| delivered_at | TIMESTAMPTZ | When delivered |
| read_at | TIMESTAMPTZ | When read |
| failed_at | TIMESTAMPTZ | When failed |
| error_code | TEXT | Error code |
| error_message | TEXT | Error description |
| cost | DECIMAL | Message cost |
| currency | TEXT | Cost currency (USD) |
| segment_count | INTEGER | SMS segment count |
| variables | JSONB | Variables used |
| tags | JSONB | Custom tags |

### messaging_optouts

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| phone_number | TEXT | Opted-out number |
| channel_type | TEXT | Channel type or 'all' |
| opted_out_at | TIMESTAMPTZ | When opted out |
| reason | TEXT | Opt-out reason |
| source | TEXT | 'keyword', 'manual', 'api', 'complaint' |

## Error Handling

All errors return a standard format:

```typescript
{
  success: false,
  error: string       // Error message
}
```

### Common Error Messages

| Error | Description |
|-------|-------------|
| `Twilio credentials not configured` | Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN |
| `No default {channel} channel configured` | No default channel for the specified type |
| `All recipients have opted out` | All recipients are in the opt-out list |
| `Template not found` | Template slug doesn't exist |
| `Twilio API error` | API error from Twilio |

## Twilio API Reference

The API wraps the following Twilio endpoints:

| Feature | Twilio Endpoint | Docs |
|---------|-----------------|------|
| SMS | `POST /Messages.json` | [Link](https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource) |
| WhatsApp Text | `POST /Messages.json` | [Link](https://www.twilio.com/docs/whatsapp/api#sending-a-freeform-whatsapp-message) |
| WhatsApp Template | `POST /Messages.json` with ContentSid | [Link](https://www.twilio.com/docs/content-api/send-a-content-api-resource) |
| Balance | `GET /Balance.json` | [Link](https://www.twilio.com/docs/usage/api/balance) |

## Channel Configuration

### SMS Channel

```json
{
  "channel_type": "sms",
  "provider": "twilio",
  "sender_id": "+1234567890",
  "config": {}
}
```

### WhatsApp Channel

```json
{
  "channel_type": "whatsapp",
  "provider": "twilio",
  "sender_id": "+1234567890",
  "config": {
    "messaging_service_sid": "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

## Environment Variables

Required secrets in Supabase:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
```

Get your credentials from the [Twilio Console](https://console.twilio.com/).

## Webhook Setup in Twilio

1. Go to Twilio Console > Phone Numbers > Manage > Active Numbers
2. Select your phone number
3. Configure webhooks:
   - **SMS Status Callback**: `https://your-project.supabase.co/functions/v1/messaging-webhook?type=status`
   - **WhatsApp Status Callback**: `https://your-project.supabase.co/functions/v1/messaging-webhook?type=status`
   - **Incoming Messages**: `https://your-project.supabase.co/functions/v1/messaging-webhook?type=incoming`

## Related Documentation

- [Email API](./email-api.md) - Similar pattern for email
- [Campaign System](../campaign-system.md) - Multi-channel campaigns
- [API Endpoints](../api-endpoints.md) - Complete API reference
- [Twilio API Docs](https://www.twilio.com/docs/messaging/api) - Official Twilio documentation
