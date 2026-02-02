# Email API

## Overview

The Email API is a Supabase Edge Function that handles email sending, domain verification, and email analytics using AWS SES (Simple Email Service).

**Edge Function:** `email-api`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-api`

## Authentication

All requests require authentication via Supabase Auth. You need a valid user JWT token (obtained after login):

```typescript
Authorization: Bearer <supabase_user_jwt_token>
```

### Direct API Access (cURL)

For direct API calls outside the Supabase client, you also need the `apikey` header:

```bash
curl -X POST "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-api" \
  -H "Authorization: Bearer <USER_JWT_TOKEN>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"action": "send", "to": "user@example.com", "subject": "Test", "html": "<p>Hello</p>"}'
```

**Note:** The `Authorization` header requires a valid user JWT token from `supabase.auth.getSession()`, not just the anon key. The function validates the user via `supabase.auth.getUser()`.

## Actions

The API uses an action-based routing system. All requests are POST with an `action` parameter.

### 1. Send Email

Send an email with or without a template.

**Action:** `send`

**Request:**
```typescript
{
  action: 'send',
  to: string | string[],              // Recipient email(s)
  from?: string,                       // Sender email (default: noreply@materialshub.gr)
  fromName?: string,                   // Sender name
  subject: string,                     // Email subject
  html?: string,                       // HTML body
  text?: string,                       // Plain text body
  templateSlug?: string,               // Template slug from email_templates table
  variables?: Record<string, string>,  // Variables for template rendering
  cc?: string[],                       // CC recipients
  bcc?: string[],                      // BCC recipients
  replyTo?: string,                    // Reply-to address
  tags?: Record<string, string>,       // Custom tags for tracking
  emailType?: 'transactional' | 'marketing' | 'notification'
}
```

**Response:**
```typescript
{
  success: true,
  messageId: string,  // AWS SES message ID
  logId: string       // email_logs record ID
}
```

**Example:**
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
```

### 2. Verify Domain

Initiate domain verification for sending emails.

**Action:** `verify-domain`

**Request:**
```typescript
{
  action: 'verify-domain',
  domain: string  // Domain to verify (e.g., 'materialshub.gr')
}
```

**Response:**
```typescript
{
  success: true,
  verificationToken: string  // TXT record value to add to DNS
}
```

### 3. Check Domain Status

Check the verification status of a domain.

**Action:** `check-domain`

**Request:**
```typescript
{
  action: 'check-domain',
  domain: string  // Domain to check
}
```

**Response:**
```typescript
{
  success: true,
  status: 'Pending' | 'Success' | 'Failed' | 'TemporaryFailure' | 'NotStarted',
  verificationToken?: string
}
```

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
    verification_token: string,
    is_default: boolean,
    created_at: string,
    created_by: string
  }>
}
```

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: { action: 'domains' }
});
// Returns: { success: true, domains: [...] }
```

### 5. List SES Domains

Get all domains directly from AWS SES with their verification status. **Requires admin role.**

**Action:** `list-ses-domains`

**Request:**
```typescript
{
  action: 'list-ses-domains'
}
```

**Response:**
```typescript
{
  success: true,
  domains: Array<{
    domain: string,
    verificationStatus: 'Pending' | 'Success' | 'Failed' | 'TemporaryFailure' | 'NotStarted',
    verificationToken?: string
  }>
}
```

### 6. Get Email Logs

Retrieve email sending logs with optional filters.

**Action:** `logs`

**Request:**
```typescript
{
  action: 'logs',
  status?: string,     // Filter by status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed'
  emailType?: string,  // Filter by type: 'transactional' | 'marketing' | 'notification'
  limit?: number       // Number of logs to return (default: 50)
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
    message_id?: string,
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
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'logs',
    status: 'sent',
    emailType: 'transactional',
    limit: 100
  }
});
```

### 7. Get Email Analytics

Retrieve email analytics for sent emails.

**Action:** `analytics`

**Request:**
```typescript
{
  action: 'analytics',
  dateRange?: {
    start: string,  // ISO date string
    end: string     // ISO date string
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
  deliveryRate: number,   // Percentage
  bounceRate: number,     // Percentage
  complaintRate: number,  // Percentage
  openRate: number,       // Percentage
  clickRate: number,      // Percentage
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
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'analytics',
    dateRange: {
      start: '2024-01-01',
      end: '2024-01-31'
    }
  }
});
```

### 8. Get Sending Stats

Get AWS SES quota and sending statistics.

**Action:** `sending-stats`

**Request:**
```typescript
{
  action: 'sending-stats'
}
```

**Response:**
```typescript
{
  success: true,
  stats: {
    max24HourSend: number,      // Maximum emails allowed in 24 hours
    maxSendRate: number,        // Maximum emails per second
    sentLast24Hours: number     // Emails sent in last 24 hours
  }
}
```

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: { action: 'sending-stats' }
});
// Returns: { success: true, stats: { max24HourSend: 50000, maxSendRate: 14, sentLast24Hours: 150 } }
```

## Actions Summary

| Action | Description | Auth Required |
|--------|-------------|---------------|
| `send` | Send an email | User |
| `verify-domain` | Initiate domain verification | Admin |
| `check-domain` | Check domain verification status | User |
| `domains` | List all domains from database | User |
| `list-ses-domains` | List domains from AWS SES | Admin |
| `logs` | Get email sending logs | User |
| `analytics` | Get email analytics | User |
| `sending-stats` | Get AWS SES quota/stats | User |

## Error Handling

All errors return a standard format:

```typescript
{
  success: false,
  error: string  // Error message
}
```

## Related Documentation

- [Email System Documentation](../email-system.md)
- [Email Templates Management](../email-system.md#templates)

