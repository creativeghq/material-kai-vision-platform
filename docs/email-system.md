# Email System

Complete documentation for the Amazon SES email system with domain verification, template management, and delivery analytics.

> **📚 Related Documentation:**
> - [Deployment Guide](./deployment-guide.md) - Supabase Secrets configuration
> - [API Endpoints](./api-endpoints.md) - Complete API reference
> - [System Architecture](./system-architecture.md) - Platform overview

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [API Reference](#api-reference)
5. [Database Schema](#database-schema)
6. [Setup Guide](#setup-guide)
7. [Usage Examples](#usage-examples)
8. [Admin Dashboard](#admin-dashboard)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Email System provides enterprise-grade email capabilities using **Amazon SES** (Simple Email Service) with comprehensive tracking, analytics, and template management. All email operations are handled through Supabase Edge Functions with AWS credentials stored securely as Supabase Secrets.

### Key Features

- **Domain Verification** - DNS-based domain verification with SES
- **Template Management** - React Email components with variable substitution
- **Delivery Tracking** - Real-time tracking of sent, delivered, bounced, complained emails
- **Analytics Dashboard** - Delivery rates, bounce rates, complaint rates with charts
- **Webhook Integration** - SNS webhooks for automatic event processing
- **Admin Interface** - Complete management UI at `/admin/emails`
- **Security** - AWS credentials stored as Supabase Secrets (never in frontend)
- **Audit Trail** - Complete email logs with metadata and tags

### Use Cases

1. **Transactional Emails** - Order confirmations, password resets, notifications
2. **Marketing Campaigns** - Newsletters, product announcements, promotions
3. **System Notifications** - Alerts, reports, status updates
4. **User Communications** - Welcome emails, onboarding sequences

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (React)                                            │
│ ├─ Email Service (src/services/email/emailService.ts)      │
│ ├─ Admin Dashboard (/admin/emails)                         │
│ └─ React Email Templates (src/services/email/templates/)   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ SUPABASE EDGE FUNCTIONS (Deno)                             │
│ ├─ email-api (Send, Verify, Analytics)                     │
│ └─ email-webhooks (SNS Event Processing)                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ AMAZON SES (Email Service)                                  │
│ ├─ Domain Verification                                      │
│ ├─ Email Sending                                            │
│ ├─ Bounce/Complaint Tracking                               │
│ └─ SNS Notifications                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ DATABASE (PostgreSQL/Supabase)                              │
│ ├─ email_domains (Domain verification)                     │
│ ├─ email_templates (React Email templates)                 │
│ ├─ email_logs (Sent emails audit trail)                    │
│ ├─ email_events (Delivery events)                          │
│ └─ email_analytics (Daily statistics)                      │
└─────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Frontend Service Layer
**Location:** `src/services/email/emailService.ts`

- Calls Supabase Edge Functions (NO direct AWS SDK)
- Type-safe interfaces for all operations
- No AWS credentials in frontend code
- Handles domain verification, email sending, analytics

#### 2. Edge Functions
**Location:** `supabase/functions/`

**email-api** - Main email API with actions:
- `send` - Send emails with/without templates
- `verify-domain` - Initiate domain verification
- `check-domain` - Check verification status
- `analytics` - Get email statistics
- `sending-stats` - Get SES quota information

**email-webhooks** - SNS webhook handler:
- Process SES events (bounces, complaints, deliveries)
- Auto-update email_logs table
- Track email lifecycle

#### 3. React Email Templates
**Location:** `src/services/email/templates/`

- `BaseEmailTemplate.tsx` - Base layout with branding
- `WelcomeEmail.tsx` - Welcome email template
- `TransactionalEmail.tsx` - Generic transactional template
- Template registry in `index.ts`

#### 4. Admin Dashboard
**Location:** `src/components/Admin/EmailManagement/`

- **Analytics Tab** - Delivery rates, charts, recommendations
- **Email Logs Tab** - View all sent emails with filtering
- **Domains Tab** - Add/verify domains, monitor reputation
- **Templates Tab** - Manage React Email templates
- **Test Email Dialog** - Send test emails

---

## Features

### Detailed Feature List

| Feature | Description | Status |
|---------|-------------|--------|
| **Domain Verification** | DNS-based verification with SES | ✅ Active |
| **Email Sending** | Send via SES with templates or raw HTML | ✅ Active |
| **Template Management** | React Email components with variables | ✅ Active |
| **Delivery Tracking** | Track sent, delivered, bounced, complained | ✅ Active |
| **Event Processing** | SNS webhooks for real-time updates | ✅ Active |
| **Analytics Dashboard** | Delivery rates, charts, recommendations | ✅ Active |
| **Email Logs** | Complete audit trail with filtering | ✅ Active |
| **Bounce Handling** | Automatic bounce detection and logging | ✅ Active |
| **Complaint Monitoring** | Track spam complaints | ✅ Active |
| **Quota Monitoring** | Track SES sending limits | ✅ Active |
| **Test Email** | Send test emails to verify configuration | ✅ Active |
| **Multi-type Support** | Transactional, marketing, notification | ✅ Active |


---

## API Reference

### Edge Function: email-api

**Endpoint:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-api`

**Authentication:** Requires Supabase `anon` or `service_role` key in `Authorization` header

**Base Request Format:**
```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: string,  // Required: 'send', 'verify-domain', 'check-domain', 'analytics', 'sending-stats'
    ...actionSpecificParams
  }
});
```

---

### Action: send

Send an email with or without a template.

**Request:**
```typescript
{
  action: 'send',
  to: string | string[],           // Recipient email(s)
  subject: string,                  // Email subject
  html?: string,                    // HTML body (if not using template)
  text?: string,                    // Plain text body
  templateSlug?: string,            // Template slug from email_templates
  variables?: Record<string, any>,  // Variables for template
  from?: string,                    // Sender email (default: from email_settings table)
  fromName?: string,                // Sender name (default: from email_settings table)
  cc?: string[],                    // CC recipients
  bcc?: string[],                   // BCC recipients
  emailType?: 'transactional' | 'marketing' | 'notification',
  tags?: Record<string, string>,    // Custom tags for tracking
  metadata?: Record<string, any>    // Custom metadata
}
```

**Response:**
```typescript
{
  success: true,
  messageId: string,  // SES message ID
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

---

### Action: verify-domain

Initiate domain verification with Amazon SES.

**Request:**
```typescript
{
  action: 'verify-domain',
  domain: string  // Domain to verify (e.g., 'example.com')
}
```

**Response:**
```typescript
{
  success: true,
  verificationToken: string,  // DNS TXT record value
  domain: string
}
```

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'verify-domain',
    domain: 'materialkai.com'
  }
});

// Add DNS TXT record:
// Name: _amazonses.materialkai.com
// Value: data.verificationToken
```

---

### Action: check-domain

Check domain verification status.

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
  isVerified: boolean,
  status: 'pending' | 'verified' | 'failed'
}
```

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'check-domain',
    domain: 'materialkai.com'
  }
});
```

---

### Action: analytics

Get email analytics for a date range.

**Request:**
```typescript
{
  action: 'analytics',
  dateRange?: {
    start: string,  // ISO date (e.g., '2025-01-01')
    end: string     // ISO date (e.g., '2025-01-31')
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
  deliveryRate: number,    // Percentage
  bounceRate: number,      // Percentage
  complaintRate: number    // Percentage
}
```

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'analytics',
    dateRange: {
      start: '2025-01-01',
      end: '2025-01-31'
    }
  }
});
```

---

### Action: sending-stats

Get SES account sending statistics and quota.

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
  max24HourSend: number,      // Maximum emails per 24 hours
  maxSendRate: number,        // Maximum emails per second
  sentLast24Hours: number,    // Emails sent in last 24 hours
  remainingQuota: number      // Remaining quota
}
```

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'sending-stats'
  }
});
```


---

### Edge Function: email-webhooks

**Endpoint:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-webhooks`

**Purpose:** Process SNS notifications from Amazon SES

**Authentication:** Public endpoint (SNS signature verification)

**Supported Events:**
- `Bounce` - Email bounced (hard or soft)
- `Complaint` - Recipient marked as spam
- `Delivery` - Email successfully delivered
- `Send` - Email sent from SES
- `Reject` - Email rejected by SES
- `Open` - Email opened (requires tracking)
- `Click` - Link clicked (requires tracking)

**Auto-Processing:**
- Updates `email_logs` table automatically
- Creates `email_events` records
- Triggers update email log status

**Setup:**
1. Create SNS topic in AWS Console
2. Configure SES to publish events to SNS
3. Subscribe this webhook endpoint to SNS topic
4. Webhook auto-confirms subscription

---

## Database Schema

### Table: email_domains

Stores verified domains for sending emails.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `domain` | TEXT | Domain name (e.g., 'materialkai.com') |
| `verification_status` | TEXT | 'pending', 'verified', 'failed' |
| `verification_token` | TEXT | DNS TXT record value from SES |
| `dkim_tokens` | TEXT[] | DKIM token values |
| `is_default` | BOOLEAN | Default domain for sending |
| `reputation_score` | INTEGER | Domain reputation (0-100) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Indexes:** Unique on `domain`, Index on `verification_status`

**RLS:** Admin read/write, Service role full access

---

### Table: email_templates

Stores email templates with React Email components.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `slug` | TEXT | Unique template identifier |
| `name` | TEXT | Display name |
| `description` | TEXT | Template description |
| `subject_template` | TEXT | Subject with {{variables}} |
| `html_template` | TEXT | HTML body with {{variables}} |
| `text_template` | TEXT | Plain text version |
| `variables` | JSONB | Available variables schema |
| `is_active` | BOOLEAN | Template active status |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Indexes:** Unique on `slug`, Index on `is_active`

**RLS:** Admin read/write, Service role full access

---

### Table: email_logs

Complete audit trail of all sent emails.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `template_id` | UUID | Reference to email_templates |
| `domain_id` | UUID | Reference to email_domains |
| `message_id` | TEXT | SES message ID |
| `from_email` | TEXT | Sender email address |
| `from_name` | TEXT | Sender display name |
| `to_email` | TEXT | Recipient email address |
| `cc_emails` | TEXT[] | CC recipients |
| `bcc_emails` | TEXT[] | BCC recipients |
| `reply_to` | TEXT | Reply-to address |
| `subject` | TEXT | Email subject |
| `html_body` | TEXT | HTML email body |
| `text_body` | TEXT | Plain text body |
| `status` | TEXT | 'queued', 'sent', 'delivered', 'bounced', 'complained' |
| `email_type` | TEXT | 'transactional', 'marketing', 'notification' |
| `priority` | INTEGER | Priority (1-10, default 5) |
| `scheduled_at` | TIMESTAMPTZ | Scheduled send time |
| `sent_at` | TIMESTAMPTZ | Actual send time |
| `delivered_at` | TIMESTAMPTZ | Delivery timestamp |
| `bounced_at` | TIMESTAMPTZ | Bounce timestamp |
| `complained_at` | TIMESTAMPTZ | Complaint timestamp |
| `opened_at` | TIMESTAMPTZ | First open timestamp |
| `clicked_at` | TIMESTAMPTZ | First click timestamp |
| `error_message` | TEXT | Error details if failed |
| `tags` | JSONB | Custom tags for filtering |
| `variables` | JSONB | Template variables used |
| `metadata` | JSONB | Additional metadata |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Indexes:** On `message_id`, `to_email`, `status`, `email_type`, `created_at`

**RLS:** Admin read, Service role full access

---

### Table: email_events

Tracks all email delivery events from SES.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `log_id` | UUID | Reference to email_logs |
| `event_type` | TEXT | 'bounce', 'complaint', 'delivery', 'send', 'open', 'click' |
| `event_data` | JSONB | Full event payload from SES |
| `timestamp` | TIMESTAMPTZ | Event timestamp |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |

**Indexes:** On `log_id`, `event_type`, `timestamp`

**Triggers:** Auto-update `email_logs` on event insert

**RLS:** Admin read, Service role full access

---

### Table: email_analytics

Daily aggregated email statistics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `date` | DATE | Analytics date |
| `domain_id` | UUID | Reference to email_domains |
| `total_sent` | INTEGER | Total emails sent |
| `total_delivered` | INTEGER | Total emails delivered |
| `total_bounced` | INTEGER | Total bounces |
| `total_complained` | INTEGER | Total complaints |
| `total_opened` | INTEGER | Total opens |
| `total_clicked` | INTEGER | Total clicks |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Indexes:** Unique on `(date, domain_id)`, Index on `date`

**RLS:** Admin read, Service role full access


---

## Setup Guide

### Prerequisites

- AWS Account with SES access
- Supabase project (KAI - `bgbavxtjlbvgplozizxu`)
- Domain with DNS access
- Admin access to Material Kai platform

### Step 1: AWS SES Configuration

#### 1.1 Create IAM User

1. Go to AWS Console → IAM → Users
2. Click **Create User**
3. Name: `material-kai-ses`
4. Attach policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:VerifyDomainIdentity",
        "ses:GetIdentityVerificationAttributes",
        "ses:GetSendQuota",
        "ses:GetSendStatistics",
        "ses:GetAccount"
      ],
      "Resource": "*"
    }
  ]
}
```

5. Create access key → Save credentials

#### 1.2 Request Production Access

1. Go to AWS Console → SES
2. Click **Request production access**
3. Fill out form (use case, sending volume)
4. Wait for approval (usually 24-48 hours)

### Step 2: Configure Supabase Secrets

**CRITICAL:** AWS credentials MUST be stored as Supabase Secrets, NOT environment variables.

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: **KAI** (`bgbavxtjlbvgplozizxu`)
3. Navigate to **Edge Functions** → **Settings** → **Secrets**
4. Add these secrets:

| Secret Name | Example Value | Description |
|------------|---------------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region for SES |
| `AWS_ACCESS_KEY_ID` | `AKIAIOSFODNN7EXAMPLE` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` | IAM secret key |

**Why Supabase Secrets?**
- ✅ Never exposed to frontend code
- ✅ Available to all Edge Functions
- ✅ No redeployment needed when updating
- ✅ Follows security best practices

> **Note:** Default sender email and name are now configured through the Admin Panel at `/admin/email` → **Email Settings** button, not as environment variables. This allows for easy updates without redeploying Edge Functions.

### Step 3: Deploy Edge Functions

```bash
# Navigate to project root
cd material-kai-vision-platform

# Deploy email API
supabase functions deploy email-api

# Deploy webhook handler
supabase functions deploy email-webhooks
```

**Verify deployment:**
```bash
# Test email-api
curl -X POST https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-api \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "sending-stats"}'
```

### Step 4: Configure SNS Webhooks

#### 4.1 Create SNS Topic

1. Go to AWS Console → SNS
2. Click **Create topic**
3. Type: **Standard**
4. Name: `material-kai-ses-events`
5. Click **Create topic**

#### 4.2 Configure SES to Publish Events

1. Go to AWS Console → SES → Configuration Sets
2. Click **Create configuration set**
3. Name: `material-kai-default`
4. Add event destination:
   - Event types: Bounce, Complaint, Delivery, Send
   - Destination: SNS
   - Topic: `material-kai-ses-events`

#### 4.3 Subscribe Webhook

1. Go to SNS topic → **Create subscription**
2. Protocol: **HTTPS**
3. Endpoint: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-webhooks`
4. Click **Create subscription**
5. Webhook auto-confirms subscription

### Step 5: Verify Domain

1. Navigate to `/admin/emails` in Material Kai
2. Click **Domains** tab
3. Click **Add Domain**
4. Enter domain: `materialkai.com`
5. Copy DNS records shown
6. Add to your DNS provider:

**TXT Record:**
```
Name: _amazonses.materialkai.com
Value: [verification token from step 4]
TTL: 1800
```

7. Wait for DNS propagation (5-30 minutes)
8. Click **Check Verification**
9. Status should change to **Verified**

### Step 6: Test Email Sending

1. Go to `/admin/emails`
2. Click **Test Email** button
3. Fill in:
   - To: your-email@example.com
   - Subject: Test Email
   - Template: welcome (or leave blank)
4. Click **Send Test Email**
5. Check your inbox


---

## Usage Examples

### Example 1: Send Welcome Email

```typescript
import { supabase } from '@/lib/supabase';

const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'send',
    to: 'newuser@example.com',
    subject: 'Welcome to Material Kai!',
    templateSlug: 'welcome',
    variables: {
      userName: 'John Doe',
      loginUrl: 'https://app.materialkai.com/login',
      supportEmail: 'support@materialkai.com'
    },
    emailType: 'transactional'
  }
});

if (error) {
  console.error('Failed to send email:', error);
} else {
  console.log('Email sent:', data.messageId);
}
```

### Example 2: Send Order Confirmation

```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'send',
    to: 'customer@example.com',
    subject: 'Order Confirmation #12345',
    html: `
      <h1>Thank you for your order!</h1>
      <p>Order #12345 has been confirmed.</p>
      <ul>
        <li>Product A x 2</li>
        <li>Product B x 1</li>
      </ul>
      <p>Total: $150.00</p>
    `,
    emailType: 'transactional',
    tags: {
      orderId: '12345',
      customerId: '67890'
    }
  }
});
```

### Example 3: Send Marketing Campaign

```typescript
const recipients = ['user1@example.com', 'user2@example.com'];

for (const email of recipients) {
  await supabase.functions.invoke('email-api', {
    body: {
      action: 'send',
      to: email,
      subject: 'New Products Available!',
      templateSlug: 'marketing-campaign',
      variables: {
        firstName: 'Customer',
        productName: 'Premium Materials Collection',
        ctaUrl: 'https://materialkai.com/products/premium'
      },
      emailType: 'marketing',
      tags: {
        campaign: 'spring-2025',
        segment: 'premium-customers'
      }
    }
  });

  // Rate limiting: wait 100ms between sends
  await new Promise(resolve => setTimeout(resolve, 100));
}
```

### Example 4: Get Analytics

```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'analytics',
    dateRange: {
      start: '2025-01-01',
      end: '2025-01-31'
    }
  }
});

console.log(`Delivery Rate: ${data.deliveryRate}%`);
console.log(`Bounce Rate: ${data.bounceRate}%`);
console.log(`Complaint Rate: ${data.complaintRate}%`);
```

### Example 5: Check Sending Quota

```typescript
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'sending-stats'
  }
});

const percentUsed = (data.sentLast24Hours / data.max24HourSend) * 100;
console.log(`Quota used: ${percentUsed.toFixed(2)}%`);

if (percentUsed > 80) {
  console.warn('Approaching sending limit!');
}
```

---

## Admin Dashboard

Access the admin dashboard at `/admin/emails` (requires admin role).

### Analytics Tab

**Features:**
- Delivery rate chart (last 30 days)
- Bounce rate chart
- Complaint rate chart
- Total emails sent counter
- Recommendations based on metrics

**Metrics:**
- **Delivery Rate** - Percentage of emails successfully delivered
- **Bounce Rate** - Percentage of emails that bounced
- **Complaint Rate** - Percentage of spam complaints

**Recommendations:**
- Delivery rate < 95% → "Improve email list quality"
- Bounce rate > 5% → "Clean your email list"
- Complaint rate > 0.1% → "Review email content"

### Email Logs Tab

**Features:**
- View all sent emails
- Filter by status, type, date range
- Search by recipient email
- View email details (subject, body, timestamps)
- Resend failed emails

**Columns:**
- Recipient
- Subject
- Status (queued, sent, delivered, bounced, complained)
- Type (transactional, marketing, notification)
- Sent At
- Actions (View Details)

### Domains Tab

**Features:**
- Add new domains
- Verify domains
- Check verification status
- View DNS records
- Monitor domain reputation
- Set default domain

**Domain Status:**
- 🟡 Pending - Awaiting DNS verification
- 🟢 Verified - Ready to send
- 🔴 Failed - Verification failed

### Templates Tab

**Features:**
- View all templates
- Create new templates
- Edit existing templates
- Preview templates with test data
- Activate/deactivate templates

**Template Fields:**
- Slug (unique identifier)
- Name (display name)
- Subject template (with {{variables}})
- HTML template (with {{variables}})
- Text template (optional)
- Variables schema

### Test Email Dialog

**Features:**
- Send test emails to verify configuration
- Select template or use custom HTML
- Provide test variables
- View send status

**Usage:**
1. Click **Test Email** button
2. Enter recipient email
3. Select template (optional)
4. Fill in variables
5. Click **Send**
6. Check inbox


---

## Best Practices

### Email Deliverability

| Practice | Description | Impact |
|----------|-------------|--------|
| **Warm up domain** | Start with 50 emails/day, double every 3 days | High |
| **Monitor bounce rate** | Keep below 5% | Critical |
| **Monitor complaint rate** | Keep below 0.1% | Critical |
| **Use verified domains** | Always send from verified domains | Critical |
| **Implement DKIM** | Add DKIM DNS records | High |
| **Set up SPF** | Configure SPF records | High |
| **Use DMARC** | Implement DMARC policy | Medium |
| **Clean email lists** | Remove invalid addresses regularly | High |
| **Segment audiences** | Send relevant content to each segment | Medium |
| **Respect unsubscribes** | Honor unsubscribe requests immediately | Critical |

### Template Design

| Practice | Description |
|----------|-------------|
| **Mobile-first** | Design for mobile devices (60%+ opens) |
| **Simple layouts** | Avoid complex CSS and nested tables |
| **Alt text** | Add descriptive alt text to all images |
| **Plain text version** | Always include plain text alternative |
| **Test thoroughly** | Test in Gmail, Outlook, Apple Mail, etc. |
| **Unsubscribe link** | Include for all marketing emails |
| **Preheader text** | Add compelling preheader (50-100 chars) |
| **CTA buttons** | Use clear, action-oriented CTAs |
| **Brand consistency** | Match brand colors and fonts |

### Security

| Practice | Description | Priority |
|----------|-------------|----------|
| **Use Supabase Secrets** | Never expose AWS credentials | Critical |
| **Validate inputs** | Sanitize email addresses and content | High |
| **Rate limiting** | Implement sending rate limits | High |
| **Monitor abuse** | Watch for unusual sending patterns | High |
| **Use HTTPS** | Always use HTTPS for webhooks | Critical |
| **Verify SNS signatures** | Validate SNS webhook signatures | High |
| **RLS policies** | Enable Row Level Security on all tables | Critical |
| **Audit logs** | Track all email operations | Medium |

### Performance

| Practice | Description |
|----------|-------------|
| **Batch processing** | Process emails in batches of 10-50 |
| **Async operations** | Use async/await for all I/O operations |
| **Connection pooling** | Reuse SES client connections |
| **Retry logic** | Implement exponential backoff for retries |
| **Queue management** | Use job queues for high-volume sending |
| **Monitor quotas** | Track SES sending limits |
| **Cache templates** | Cache rendered templates |

---

## Troubleshooting

### Issue: Emails Not Sending

**Symptoms:**
- Emails stuck in "queued" status
- No emails appearing in inbox
- Error in email_logs table

**Solutions:**

1. **Check Supabase Secrets:**
   ```bash
   # Verify secrets are set
   supabase secrets list
   ```
   Ensure `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` are set.

2. **Check Domain Verification:**
   - Go to `/admin/emails` → Domains
   - Verify domain status is "Verified"
   - If pending, check DNS records

3. **Check SES Sandbox Mode:**
   - AWS Console → SES → Account dashboard
   - If in sandbox, request production access
   - In sandbox, can only send to verified addresses

4. **Check Sending Quota:**
   ```typescript
   const { data } = await supabase.functions.invoke('email-api', {
     body: { action: 'sending-stats' }
   });
   console.log(data);
   ```
   If quota exceeded, wait or request increase.

5. **Check Edge Function Logs:**
   ```bash
   supabase functions logs email-api
   ```

### Issue: High Bounce Rate

**Symptoms:**
- Bounce rate > 5%
- Many emails in "bounced" status

**Solutions:**

1. **Validate Email Addresses:**
   ```typescript
   const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
   ```

2. **Clean Email List:**
   - Remove hard bounces immediately
   - Remove soft bounces after 3 attempts
   - Use email verification service

3. **Check Domain Reputation:**
   - Use tools like MXToolbox
   - Monitor blacklist status
   - Improve email content quality

4. **Review Bounce Types:**
   ```sql
   SELECT event_data->>'bounceType', COUNT(*)
   FROM email_events
   WHERE event_type = 'bounce'
   GROUP BY event_data->>'bounceType';
   ```

### Issue: Webhooks Not Working

**Symptoms:**
- email_events table not updating
- email_logs status not changing
- No delivery confirmations

**Solutions:**

1. **Check SNS Subscription:**
   - AWS Console → SNS → Subscriptions
   - Verify subscription is "Confirmed"
   - If pending, check webhook logs for confirmation

2. **Check SES Configuration Set:**
   - AWS Console → SES → Configuration Sets
   - Verify event publishing is enabled
   - Check SNS topic is correct

3. **Test Webhook:**
   ```bash
   curl -X POST https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-webhooks \
     -H "Content-Type: application/json" \
     -d '{"Type": "SubscriptionConfirmation", "Token": "test"}'
   ```

4. **Check Edge Function Logs:**
   ```bash
   supabase functions logs email-webhooks
   ```

### Issue: High Complaint Rate

**Symptoms:**
- Complaint rate > 0.1%
- Emails marked as spam

**Solutions:**

1. **Review Email Content:**
   - Avoid spam trigger words
   - Include clear unsubscribe link
   - Match subject to content
   - Use proper formatting

2. **Segment Audience:**
   - Send relevant content only
   - Respect user preferences
   - Honor unsubscribe requests

3. **Monitor Feedback Loop:**
   ```sql
   SELECT event_data, COUNT(*)
   FROM email_events
   WHERE event_type = 'complaint'
   GROUP BY event_data;
   ```

4. **Implement Unsubscribe:**
   - Add unsubscribe link to all marketing emails
   - Process unsubscribes immediately
   - Maintain suppression list

---

**Last Updated:** 2025-12-25
**Version:** 1.0.0
**Maintainer:** Material Kai Development Team
