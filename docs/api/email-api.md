# Email API

## Overview

The Email API is a Supabase Edge Function that handles email sending, domain management, and analytics via **Resend**.

**Edge Function:** `email-api`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-api`
**Email Provider:** [Resend](https://resend.com)

> **Migration note (2026-03-11):** Email provider migrated from Amazon SES to Resend. Actions `verify-domain`, `check-domain`, `list-ses-domains`, and `sending-stats` have been removed. Domain verification is now managed directly in the [Resend Dashboard](https://resend.com/domains).

---

## Authentication

All requests require a valid Supabase user JWT:

```http
Authorization: Bearer <supabase_user_jwt_token>
apikey: <SUPABASE_ANON_KEY>
```

### cURL Example

```bash
curl -X POST "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-api" \
  -H "Authorization: Bearer <USER_JWT_TOKEN>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"action": "send", "to": "user@example.com", "subject": "Test", "html": "<p>Hello</p>"}'
```

---

## Actions

All requests use `POST` with an `action` field in the body.

---

### 1. Send Email

Send a transactional, marketing, or notification email. Supports plain HTML/text or a pre-saved template.

**Action:** `send`

**Request:**
```typescript
{
  action: 'send',
  to: string | string[],              // Required. Up to 50 recipients.
  subject: string,                    // Required.
  from?: string,                      // Sender email. Default: platform default from DB.
  fromName?: string,                  // Sender display name.
  html?: string,                      // HTML body (required if no template and no text).
  text?: string,                      // Plain text body (auto-generated from html if omitted).
  templateSlug?: string,              // Slug of a saved template in email_templates table.
  variables?: Record<string, string>, // Template variable substitution values.
  cc?: string[],                      // CC recipients.
  bcc?: string[],                     // BCC recipients.
  replyTo?: string,                   // Reply-to address.
  tags?: Record<string, string>,      // Key-value tags for tracking (max 256 chars each).
  emailType?: 'transactional' | 'marketing' | 'notification'  // Default: 'transactional'
}
```

**Response:**
```typescript
{
  success: true,
  messageId: string,  // Resend email ID (UUID)
  logId: string       // email_logs record ID
}
```

**Supabase SDK Example:**
```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'send',
    to: 'user@example.com',
    subject: 'Welcome to Material Kai',
    templateSlug: 'welcome',
    variables: {
      userName: 'John Doe',
      loginUrl: 'https://app.materialkai.com/login'
    },
    emailType: 'transactional'
  }
});
// Returns: { success: true, messageId: "49a3999c-...", logId: "uuid" }
```

**cURL Example:**
```bash
curl -X POST "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-api" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send",
    "to": "customer@example.com",
    "subject": "Your order is confirmed",
    "html": "<h1>Order Confirmed</h1><p>Thank you for your order!</p>",
    "emailType": "transactional"
  }'
```

---

### 2. Add Domain

Register a domain in the platform database. **Requires admin role.**

> Domain DNS verification must be completed in the [Resend Dashboard](https://resend.com/domains) before marking as verified.

**Action:** `add-domain`

**Request:**
```typescript
{
  action: 'add-domain',
  domain: string  // e.g. 'materialshub.gr'
}
```

**Response:**
```typescript
{
  success: true,
  domain: {
    id: string,
    domain: string,
    verification_status: 'pending',
    created_at: string
  },
  message: string  // Instructions for Resend dashboard verification
}
```

---

### 3. Mark Domain Verified

Mark a domain as verified after confirming DNS records in the Resend dashboard. **Requires admin role.**

**Action:** `mark-domain-verified`

**Request:**
```typescript
{
  action: 'mark-domain-verified',
  domain: string  // e.g. 'materialshub.gr'
}
```

**Response:**
```typescript
{
  success: true
}
```

---

### 4. List Domains

Get all email domains from the database.

**Action:** `domains`

**Request:**
```typescript
{
  action: 'domains'
}
```

**Response:**
```typescript
{
  success: true,
  domains: Array<{
    id: string,
    domain: string,
    verification_status: 'pending' | 'verified' | 'failed',
    is_default: boolean,
    bounce_rate: number,
    complaint_rate: number,
    reputation_status: 'healthy' | 'warning' | 'critical',
    created_at: string,
    created_by: string
  }>
}
```

**Example:**
```typescript
const { data } = await supabase.functions.invoke('email-api', {
  body: { action: 'domains' }
});
// Returns: { success: true, domains: [...] }
```

---

### 5. Get Email Logs

Retrieve email sending logs with optional filters.

**Action:** `logs`

**Request:**
```typescript
{
  action: 'logs',
  status?: 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed',
  emailType?: 'transactional' | 'marketing' | 'notification',
  limit?: number  // Default: 50
}
```

**Response:**
```typescript
{
  success: true,
  logs: Array<{
    id: string,
    template_id?: string,
    domain_id?: string,
    from_email: string,
    from_name?: string,
    to_email: string,
    cc_emails?: string[],
    bcc_emails?: string[],
    reply_to?: string,
    subject: string,
    html_body?: string,
    text_body?: string,
    status: string,
    message_id?: string,     // Resend email ID
    email_type: string,
    tags?: Record<string, string>,
    variables?: Record<string, string>,
    sent_at?: string,
    delivered_at?: string,
    opened_at?: string,
    clicked_at?: string,
    bounced_at?: string,
    bounce_reason?: string,
    created_at: string,
    created_by: string
  }>
}
```

**Example:**
```typescript
const { data } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'logs',
    status: 'delivered',
    emailType: 'transactional',
    limit: 100
  }
});
```

---

### 6. Get Analytics

Retrieve aggregated email analytics. Data is sourced from the `email_analytics` table, populated by Resend webhook events.

**Action:** `analytics`

**Request:**
```typescript
{
  action: 'analytics',
  dateRange?: {
    start: string,  // ISO date string, e.g. '2024-01-01'
    end: string     // ISO date string, e.g. '2024-01-31'
  }
}
```

**Response:**
```typescript
{
  success: true,
  totalSent: number,
  totalDelivered: number,
  totalBounced: number,
  totalComplained: number,
  totalOpened: number,
  totalClicked: number,
  deliveryRate: number,    // Percentage (0–100)
  bounceRate: number,      // Percentage (0–100)
  complaintRate: number,   // Percentage (0–100)
  openRate: number,        // Percentage (0–100)
  clickRate: number,       // Percentage (0–100)
  dailyData: Array<{
    date: string,
    total_sent: number,
    total_delivered: number,
    total_bounced: number,
    total_complained: number,
    total_opened: number,
    total_clicked: number
  }>
}
```

**Example:**
```typescript
const { data } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'analytics',
    dateRange: { start: '2024-01-01', end: '2024-01-31' }
  }
});
```

---

## Actions Summary

| Action | Description | Auth Required |
|--------|-------------|---------------|
| `send` | Send an email (HTML, text, or template) | User |
| `add-domain` | Add a domain to the database | Admin |
| `mark-domain-verified` | Mark a domain verified after Resend confirmation | Admin |
| `domains` | List all domains from database | User |
| `logs` | Get email sending logs | User |
| `analytics` | Get aggregated email analytics | User |

---

## Webhook Events

Resend sends delivery events to:

```
https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-webhooks
```

Configure this endpoint in the [Resend Dashboard → Webhooks](https://resend.com/webhooks).

**Events tracked:**

| Resend Event | Internal Status | Description |
|---|---|---|
| `email.sent` | `send` | Email accepted by Resend |
| `email.delivered` | `delivery` | Successfully delivered to recipient |
| `email.delivery_delayed` | `delivery_delayed` | Temporary delivery delay |
| `email.bounced` | `bounce` | Permanent bounce |
| `email.complained` | `complaint` | Spam complaint |
| `email.opened` | `open` | Recipient opened the email |
| `email.clicked` | `click` | Recipient clicked a link |

Webhook signatures are verified using `RESEND_WEBHOOK_SECRET` (Svix HMAC-SHA256).

---

## Error Handling

All errors return:

```typescript
{
  success: false,
  error: string  // Human-readable error message
}
```

Common errors:

| Error | Cause |
|---|---|
| `RESEND_API_KEY is not configured` | Secret not set in Supabase Edge Function secrets |
| `Template not found: <slug>` | Template slug doesn't exist or is inactive |
| `Either html or text body must be provided` | No content in send request |
| `Unauthorized: Admin access required` | Domain actions called by non-admin user |

---

## Related Documentation

- [Email System Documentation](../email-system.md)
- [Deployment Guide — Secrets](../deployment-guide.md)
- [Resend API Reference](https://resend.com/docs/api-reference/emails/send-email)
