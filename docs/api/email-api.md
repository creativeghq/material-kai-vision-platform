# Email API

## Overview

The Email API is a Supabase Edge Function that handles email sending, domain verification, and email analytics using AWS SES (Simple Email Service).

**Edge Function:** `email-api`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-api`

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

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

### 4. Get Email Analytics

Retrieve email analytics for sent emails.

**Action:** `analytics`

**Request:**
```typescript
{
  action: 'analytics',
  startDate?: string,  // ISO date string
  endDate?: string,    // ISO date string
  emailType?: 'transactional' | 'marketing' | 'notification'
}
```

**Response:**
```typescript
{
  success: true,
  analytics: {
    totalSent: number,
    delivered: number,
    bounced: number,
    complained: number,
    opened: number,
    clicked: number,
    deliveryRate: number,
    openRate: number,
    clickRate: number
  }
}
```

### 5. Get Sending Stats

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

