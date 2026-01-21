# Messaging API

## Overview

The Messaging API is a Supabase Edge Function that handles multi-channel messaging (SMS, WhatsApp, Viber) using Infobip as the unified provider.

**Edge Function:** `messaging-api`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/messaging-api`

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

## Actions

The API uses an action-based routing system. All requests are POST with an `action` parameter.

### 1. Send Message

Send a single message via SMS, WhatsApp, or Viber.

**Action:** `send`

**Request:**
```typescript
{
  action: 'send',
  channel: 'sms' | 'whatsapp' | 'viber',  // Channel type (required)
  to: string,                               // Recipient phone number (E.164 format)
  from?: string,                            // Sender ID (uses default if not provided)
  content?: string,                         // Message content (required if no template)
  templateSlug?: string,                    // Template slug from messaging_templates
  variables?: Record<string, string>,       // Variables for template rendering
  mediaUrl?: string,                        // Media URL for MMS/rich messages
  buttons?: Array<{                         // Interactive buttons (WhatsApp/Viber)
    type: 'url' | 'call' | 'reply',
    text: string,
    url?: string
  }>,
  messageType?: 'transactional' | 'marketing' | 'otp',
  callbackData?: string,                    // Custom data for delivery reports
  tags?: Record<string, string>,            // Custom tags for tracking
  scheduledAt?: string                      // ISO date for scheduled sending
}
```

**Response:**
```typescript
{
  success: true,
  messageId: string,    // Infobip message ID
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
  channel: 'sms' | 'whatsapp' | 'viber',
  to: string[],                             // Array of phone numbers
  from?: string,
  content?: string,
  templateSlug?: string,
  variables?: Record<string, string>,       // Applied to all messages
  recipientVariables?: Array<{              // Per-recipient variables
    to: string,
    variables: Record<string, string>
  }>,
  messageType?: 'transactional' | 'marketing' | 'otp',
  tags?: Record<string, string>
}
```

**Response:**
```typescript
{
  success: true,
  bulkId: string,          // Infobip bulk ID
  totalSent: number,
  messages: Array<{
    to: string,
    messageId: string,
    status: 'pending' | 'sent' | 'failed'
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
  channelType?: 'sms' | 'whatsapp' | 'viber'  // Filter by type
}
```

**Response:**
```typescript
{
  success: true,
  channels: Array<{
    id: string,
    channelType: 'sms' | 'whatsapp' | 'viber',
    senderId: string,
    displayName: string,
    isActive: boolean,
    isDefault: boolean,
    dailyQuota: number,
    maxSendRate: number
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
  channelType?: 'sms' | 'whatsapp' | 'viber',  // Filter by channel
  category?: 'transactional' | 'marketing' | 'otp'
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
    channelType: string,
    content: string,
    variables: string[],
    category: string,
    isApproved: boolean,        // For WhatsApp templates
    isActive: boolean,
    createdAt: string,
    updatedAt: string
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
  channelType?: 'sms' | 'whatsapp' | 'viber',
  status?: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'rejected',
  startDate?: string,           // ISO date string
  endDate?: string,             // ISO date string
  toNumber?: string,            // Filter by recipient
  limit?: number,               // Default: 50, max: 200
  offset?: number
}
```

**Response:**
```typescript
{
  success: true,
  logs: Array<{
    id: string,
    channelType: string,
    fromNumber: string,
    toNumber: string,
    content: string,
    status: string,
    sentAt: string | null,
    deliveredAt: string | null,
    readAt: string | null,
    failedAt: string | null,
    errorCode: string | null,
    errorMessage: string | null,
    cost: number | null,
    currency: string,
    createdAt: string
  }>,
  total: number,
  hasMore: boolean
}
```

### 6. Get Analytics

Retrieve messaging analytics and statistics.

**Action:** `analytics`

**Request:**
```typescript
{
  action: 'analytics',
  channelType?: 'sms' | 'whatsapp' | 'viber',
  startDate?: string,           // ISO date string
  endDate?: string,             // ISO date string
  groupBy?: 'day' | 'week' | 'month'
}
```

**Response:**
```typescript
{
  success: true,
  analytics: {
    summary: {
      totalSent: number,
      totalDelivered: number,
      totalRead: number,
      totalFailed: number,
      totalCost: number,
      deliveryRate: number,
      readRate: number
    },
    byChannel: {
      sms: { sent: number, delivered: number, failed: number, cost: number },
      whatsapp: { sent: number, delivered: number, read: number, failed: number, cost: number },
      viber: { sent: number, delivered: number, read: number, failed: number, cost: number }
    },
    timeSeries: Array<{
      date: string,
      sent: number,
      delivered: number,
      read: number,
      failed: number,
      cost: number
    }>
  }
}
```

### 7. Get Account Balance

Check Infobip account balance and quota.

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
  balance: {
    amount: number,
    currency: string,
    creditLimit: number | null
  },
  quota: {
    sms: { daily: number, used: number, remaining: number },
    whatsapp: { daily: number, used: number, remaining: number },
    viber: { daily: number, used: number, remaining: number }
  }
}
```

### 8. Sync Senders

Synchronize sender IDs from Infobip.

**Action:** `sync-senders`

**Request:**
```typescript
{
  action: 'sync-senders'
}
```

**Response:**
```typescript
{
  success: true,
  synced: {
    sms: number,
    whatsapp: number,
    viber: number
  },
  total: number
}
```

### 9. Get WhatsApp Templates

Retrieve WhatsApp Business template status from Infobip/Meta.

**Action:** `whatsapp-templates`

**Request:**
```typescript
{
  action: 'whatsapp-templates',
  status?: 'APPROVED' | 'PENDING' | 'REJECTED'
}
```

**Response:**
```typescript
{
  success: true,
  templates: Array<{
    name: string,
    namespace: string,
    status: 'APPROVED' | 'PENDING' | 'REJECTED',
    category: string,
    language: string,
    components: Array<{
      type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS',
      text?: string,
      format?: string
    }>
  }>
}
```

### 10. Send Test Message

Send a test message for template preview.

**Action:** `send-test`

**Request:**
```typescript
{
  action: 'send-test',
  channel: 'sms' | 'whatsapp' | 'viber',
  to: string,                   // Test phone number
  templateSlug?: string,
  content?: string,
  variables?: Record<string, string>
}
```

**Response:**
```typescript
{
  success: true,
  messageId: string,
  preview: {
    renderedContent: string,
    characterCount: number,
    segmentCount: number      // For SMS only
  }
}
```

## Webhook Endpoint

The `messaging-webhook` edge function handles delivery reports from Infobip.

**Edge Function:** `messaging-webhook`
**URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/messaging-webhook`

### Supported Events

- **DELIVERED** - Message delivered to recipient
- **SEEN** / **READ** - Message read (WhatsApp/Viber)
- **FAILED** - Delivery failed
- **REJECTED** - Message rejected
- **UNDELIVERED** - Could not be delivered

### Webhook Payload

```typescript
{
  results: Array<{
    messageId: string,
    to: string,
    status: {
      groupName: 'DELIVERED' | 'UNDELIVERED' | 'SEEN' | 'REJECTED',
      name: string,
      description: string
    },
    error?: {
      groupName: string,
      name: string,
      description: string
    },
    doneAt: string,
    price?: {
      pricePerMessage: number,
      currency: string
    }
  }]
}
```

## Database Schema

### messaging_channels

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| channel_type | TEXT | 'sms', 'whatsapp', or 'viber' |
| provider | TEXT | Default: 'infobip' |
| sender_id | TEXT | Phone number or sender name |
| display_name | TEXT | Friendly name |
| is_active | BOOLEAN | Whether channel is active |
| is_default | BOOLEAN | Default channel for type |
| config | JSONB | Channel-specific config |
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
| whatsapp_template_name | TEXT | Meta template name |
| is_approved | BOOLEAN | WhatsApp approval status |
| is_active | BOOLEAN | Whether template is active |

### messaging_logs

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| channel_type | TEXT | Channel used |
| template_id | UUID | FK to messaging_templates |
| channel_id | UUID | FK to messaging_channels |
| provider_message_id | TEXT | Infobip message ID |
| bulk_id | TEXT | Infobip bulk ID |
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
| currency | TEXT | Cost currency |
| variables | JSONB | Variables used |
| tags | JSONB | Custom tags |

### messaging_optouts

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| phone_number | TEXT | Opted-out number |
| channel_type | TEXT | Channel type |
| opted_out_at | TIMESTAMPTZ | When opted out |
| reason | TEXT | Opt-out reason |

## Error Handling

All errors return a standard format:

```typescript
{
  success: false,
  error: string,       // Error message
  code?: string,       // Error code (e.g., 'INVALID_PHONE', 'QUOTA_EXCEEDED')
  details?: object     // Additional error details
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| INVALID_PHONE | Invalid phone number format |
| OPTED_OUT | Recipient has opted out |
| QUOTA_EXCEEDED | Daily quota reached |
| TEMPLATE_NOT_FOUND | Template slug not found |
| TEMPLATE_NOT_APPROVED | WhatsApp template not approved |
| CHANNEL_NOT_FOUND | Channel not configured |
| INFOBIP_ERROR | Error from Infobip API |
| INSUFFICIENT_BALANCE | Account balance too low |

## Infobip API Reference

The API wraps the following Infobip endpoints:

| Feature | Infobip Endpoint |
|---------|------------------|
| SMS | `/sms/2/text/advanced` |
| WhatsApp | `/whatsapp/1/message/template` |
| WhatsApp Text | `/whatsapp/1/message/text` |
| Viber | `/viber/1/message/text` |
| Delivery Reports | Webhook callback |
| Balance | `/account/1/balance` |

## Related Documentation

- [Email API](./email-api.md) - Similar pattern for email
- [Campaign System](../campaign-system.md) - Multi-channel campaigns
- [API Endpoints](../api-endpoints.md) - Complete API reference

## Environment Variables

Required secrets in Supabase:

```
INFOBIP_API_KEY=your_api_key
INFOBIP_BASE_URL=https://api.infobip.com
INFOBIP_WEBHOOK_SECRET=webhook_signing_secret
```
