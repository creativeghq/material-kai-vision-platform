# Email System

Complete documentation for the Resend email system with domain management, template management, and delivery analytics.

> **Migration note (2026-03-11):** Email provider migrated from Amazon SES to **Resend**. AWS SES secrets (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_CONFIGURATION_SET_NAME`) have been removed. Replace with `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`.

> **📚 Related Documentation:**
> - [Campaign System](./campaign-system.md) - Email campaign management
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

The Email System provides enterprise-grade email capabilities using **Resend** with comprehensive tracking, analytics, and template management. All email operations are handled through Supabase Edge Functions with the Resend API key stored securely as a Supabase Secret.

### Key Features

- **Domain Management** - DNS-based domain verification via Resend Dashboard
- **Template Management** - React Email components with variable substitution
- **Delivery Tracking** - Real-time tracking of sent, delivered, bounced, complained emails
- **Analytics Dashboard** - Delivery rates, bounce rates, complaint rates with charts
- **Webhook Integration** - Resend webhooks (Svix-signed) for automatic event processing
- **Admin Interface** - Complete management UI at `/admin/emails`
- **Security** - Resend API key stored as Supabase Secret (never in frontend)
- **Audit Trail** - Complete email logs with metadata and tags

### Use Cases

1. **Transactional Emails** - Order confirmations, password resets, notifications
2. **Marketing Campaigns** - Newsletters, product announcements, promotions
3. **System Notifications** - Alerts, reports, status updates
4. **User Communications** - Welcome emails, onboarding sequences

---

## Architecture

### System Overview

┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (React)                                            │
│ ├─ Email Service (src/modules/email/services/emailService.ts) │
│ ├─ Admin Dashboard (/admin/emails)                         │
│ └─ React Email Templates (src/modules/email/services/templates/) │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ SUPABASE EDGE FUNCTIONS (Deno)                             │
│ ├─ email-api (Send, Domain Mgmt, Analytics)                │
│ └─ email-webhooks (Resend Event Processing)                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ RESEND (Email Service)                                      │
│ ├─ Domain Verification (via Resend Dashboard)               │
│ ├─ Email Sending (REST API)                                 │
│ ├─ Bounce/Complaint Tracking                               │
│ └─ Webhook Events (Svix-signed)                             │
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

### Components

#### 1. Frontend Service Layer
**Location:** `src/modules/email/services/emailService.ts`

- Calls Supabase Edge Functions (NO direct AWS SDK)
- Type-safe interfaces for all operations
- No AWS credentials in frontend code
- Handles domain verification, email sending, analytics

#### 2. Edge Functions
**Location:** `supabase/functions/`

**email-api** - Main email API with actions:
- `send` - Send emails with/without templates via Resend
- `add-domain` - Register a domain in the database
- `mark-domain-verified` - Mark domain verified after Resend dashboard confirmation
- `domains` - List domains from database
- `logs` - Get email logs
- `analytics` - Get email statistics

**email-webhooks** - Resend webhook handler:
- Process Resend events (bounces, complaints, deliveries, opens, clicks)
- Svix HMAC-SHA256 signature verification
- Auto-update email_logs table
- Track email lifecycle

#### 3. React Email Templates
**Location:** `src/modules/email/services/templates/`

- `BaseEmailTemplate.tsx` - Base layout with branding
- `WelcomeEmail.tsx` - Welcome email template
- `TransactionalEmail.tsx` - Generic transactional template
- Template registry in `index.ts`

#### 4. Admin Dashboard
**Location:** `src/modules/email/components/`

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
| **Domain Management** | DNS verification via Resend Dashboard | ✅ Active |
| **Email Sending** | Send via Resend REST API with templates or raw HTML | ✅ Active |
| **Template Management** | React Email components with variables | ✅ Active |
| **Delivery Tracking** | Track sent, delivered, bounced, complained | ✅ Active |
| **Event Processing** | Resend webhooks (Svix-signed) for real-time updates | ✅ Active |
| **Analytics Dashboard** | Delivery rates, charts, recommendations | ✅ Active |
| **Email Logs** | Complete audit trail with filtering | ✅ Active |
| **Bounce Handling** | Automatic bounce detection and logging | ✅ Active |
| **Complaint Monitoring** | Track spam complaints | ✅ Active |
| **Test Email** | Send test emails to verify configuration | ✅ Active |
| **Multi-type Support** | Transactional, marketing, notification | ✅ Active |


---

## API Reference

### Edge Function: email-api

**Endpoint:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-api`

**Authentication:** Requires Supabase `anon` or `service_role` key in `Authorization` header

All requests are made by invoking the `email-api` edge function with a body containing an `action` string. Available actions: `send`, `add-domain`, `mark-domain-verified`, `domains`, `logs`, `analytics`.

---

### Action: send

Send an email with or without a template.

**Request parameters:** `to` (string or array of recipient emails), `subject`, optional `html` body, optional `text` body, optional `templateSlug`, optional `variables` for template substitution, optional `from` email, optional `fromName`, optional `cc` and `bcc` arrays, optional `emailType` ('transactional', 'marketing', or 'notification'), optional `tags`, and optional `metadata`.

**Response:** `success: true`, `messageId` (Resend email UUID), `logId` (email_logs record ID).

---

### Action: add-domain

Register a domain in the platform database (admin only). Verify the domain in the [Resend Dashboard](https://resend.com/domains) first, then mark it verified here.

**Request parameters:** `action: 'add-domain'`, `domain` (e.g., 'example.com').

**Response:** `success: true`, `domain` object, `message` with instructions.

---

### Action: mark-domain-verified

Mark a domain as verified after confirming DNS records in Resend Dashboard (admin only).

**Request parameters:** `action: 'mark-domain-verified'`, `domain`.

**Response:** `success: true`.

---

### Action: analytics

Get email analytics for a date range.

**Request parameters:** `action: 'analytics'`, optional `dateRange` object with `start` and `end` ISO date strings.

**Response:** `success: true`, `totalSent`, `totalDelivered`, `totalBounced`, `totalComplained`, `totalOpened`, `totalClicked`, `deliveryRate` (percentage), `bounceRate` (percentage), `complaintRate` (percentage), `openRate` (percentage), `clickRate` (percentage).


---

### Edge Function: email-webhooks

**Endpoint:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-webhooks`

**Purpose:** Process Resend webhook events (delivery, bounce, complaint, open, click)

**Authentication:** Svix HMAC-SHA256 signature verification using `RESEND_WEBHOOK_SECRET`

**Supported Events:**

| Resend Event | Internal Type | Description |
|---|---|---|
| `email.sent` | `send` | Accepted by Resend |
| `email.delivered` | `delivery` | Delivered to recipient |
| `email.delivery_delayed` | `delivery_delayed` | Temporary delay |
| `email.bounced` | `bounce` | Permanent bounce |
| `email.complained` | `complaint` | Spam complaint |
| `email.opened` | `open` | Recipient opened |
| `email.clicked` | `click` | Recipient clicked a link |

**Auto-Processing:**
- Verifies Svix webhook signature before processing
- Updates `email_logs` status and timestamps
- Creates `email_events` records
- DB trigger propagates status changes

**Setup:**
1. Deploy `email-webhooks` edge function
2. In [Resend Dashboard → Webhooks](https://resend.com/webhooks), add endpoint: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-webhooks`
3. Select all event types
4. Copy signing secret → set as `RESEND_WEBHOOK_SECRET` in Supabase Edge Function secrets

---

## Database Schema

### Table: email_domains

Stores verified domains for sending emails.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `domain` | TEXT | Domain name (e.g., 'materialkai.com') |
| `verification_status` | TEXT | 'pending', 'verified', 'failed' |
| `verification_token` | TEXT | DNS TXT record reference (verification done via Resend Dashboard) |
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
| `message_id` | TEXT | Resend email ID (UUID) |
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
| `event_type` | TEXT | 'bounce', 'complaint', 'delivery', 'delivery_delayed', 'send', 'open', 'click' |
| `event_data` | JSONB | Full event payload from Resend |
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

- [Resend account](https://resend.com) with a verified domain
- Supabase project (KAI - `bgbavxtjlbvgplozizxu`)
- Admin access to Material Kai platform

### Step 1: Create Resend API Key

1. Log in to [resend.com](https://resend.com)
2. Go to **API Keys** → **Create API Key**
3. Name: `material-kai-production`
4. Permission: **Full Access** (or Sending Access for sending only)
5. Copy the key — it starts with `re_`

### Step 2: Configure Supabase Secrets

**CRITICAL:** The Resend API key MUST be stored as a Supabase Secret, NOT an environment variable.

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: **KAI** (`bgbavxtjlbvgplozizxu`)
3. Navigate to **Edge Functions** → **Manage Secrets**
4. Add these secrets:

| Secret Name | Value | Description |
|------------|-------|-------------|
| `RESEND_API_KEY` | `re_xxxxxxxxxxxxxxxxxxxx` | Resend API key for email sending |
| `RESEND_WEBHOOK_SECRET` | `whsec_xxxxxxxxxxxxxxxxxxxx` | Resend webhook signing secret (add after Step 4) |

**Why Supabase Secrets?**
- ✅ Never exposed to frontend code
- ✅ Available to all Edge Functions
- ✅ No redeployment needed when updating
- ✅ Follows security best practices

> **Note:** Default sender email and name are configured through the Admin Panel at `/admin/email` → **Email Settings**, not as environment variables.

### Step 3: Configure Supabase Auth SMTP

Route Supabase Auth emails (magic links, confirmations, password resets) through Resend:

1. Go to Supabase Dashboard → **Authentication** → **Email** → **SMTP Settings**
2. Enable custom SMTP
3. Enter:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Your `RESEND_API_KEY` |
| Sender email | `noreply@yourdomain.com` |
| Sender name | `Material KAI` |

### Step 4: Deploy Edge Functions

```bash
supabase functions deploy email-api
supabase functions deploy email-webhooks
supabase functions deploy email-webhook
```

### Step 5: Register Resend Webhook

1. Go to [Resend Dashboard → Webhooks](https://resend.com/webhooks)
2. Click **Add Endpoint**
3. URL: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-webhooks`
4. Select events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`
5. Save → Copy the **Signing Secret** (starts with `whsec_`)
6. Add `RESEND_WEBHOOK_SECRET` to Supabase Edge Function secrets (Step 2)

### Step 6: Add & Verify Domain

1. In [Resend Dashboard → Domains](https://resend.com/domains), add your domain and complete DNS verification
2. Navigate to `/admin/emails` in Material Kai → **Domains** tab
3. Click **Add Domain**, enter your domain name
4. Once Resend shows the domain as verified, click **Mark Verified** in the admin panel

### Step 7: Test Email Sending

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

Invoke the `email-api` edge function with `action: 'send'`, the recipient email, subject, `templateSlug: 'welcome'`, the template variables (userName, loginUrl, supportEmail), and `emailType: 'transactional'`.

### Example 2: Send Order Confirmation

Invoke `email-api` with `action: 'send'`, the customer email, an order confirmation subject, raw HTML body content, `emailType: 'transactional'`, and custom tags containing the orderId and customerId.

### Example 3: Send Marketing Campaign

Loop through a list of recipient emails, invoking `email-api` for each with `action: 'send'`, the marketing template slug, per-recipient variables, `emailType: 'marketing'`, and campaign tags. Implement rate limiting between sends (e.g., 100ms wait between each invocation).

### Example 4: Get Analytics

Invoke `email-api` with `action: 'analytics'` and a `dateRange` object specifying start and end dates. The response contains `deliveryRate`, `bounceRate`, and `complaintRate` percentages.

### Example 5: Check Sending Quota

Invoke `email-api` with `action: 'sending-stats'`. Use the returned `sentLast24Hours` and `max24HourSend` values to calculate and monitor your quota utilization percentage.

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
| **Use Supabase Secrets** | Never expose Resend API key in frontend | Critical |
| **Validate inputs** | Sanitize email addresses and content | High |
| **Rate limiting** | Implement sending rate limits | High |
| **Monitor abuse** | Watch for unusual sending patterns | High |
| **Use HTTPS** | Always use HTTPS for webhooks | Critical |
| **Verify webhook signatures** | Validate Resend/Svix webhook signatures via `RESEND_WEBHOOK_SECRET` | High |
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

1. **Check Supabase Secrets:** Verify that `RESEND_API_KEY` is set — run `supabase secrets list` and confirm it appears.

2. **Check Domain Verification:**
   - Go to `/admin/emails` → Domains
   - Verify domain status is "Verified"
   - If pending, check DNS records

3. **Check Resend Dashboard:** Log in to [resend.com](https://resend.com) and confirm the domain is verified and the API key is active.

4. **Check Edge Function Logs:** Run `supabase functions logs email-api` to review function output.

### Issue: High Bounce Rate

**Symptoms:**
- Bounce rate > 5%
- Many emails in "bounced" status

**Solutions:**

1. **Validate Email Addresses:** Use a regex or email validation library to check address format before sending.

2. **Clean Email List:**
   - Remove hard bounces immediately
   - Remove soft bounces after 3 attempts
   - Use email verification service

3. **Check Domain Reputation:**
   - Use tools like MXToolbox
   - Monitor blacklist status
   - Improve email content quality

4. **Review Bounce Types:** Query the email_events table filtering by event_type 'bounce' and group by the bounceType field in the event_data JSON to identify patterns.

### Issue: Webhooks Not Working

**Symptoms:**
- email_events table not updating
- email_logs status not changing
- No delivery confirmations

**Solutions:**

1. **Check Resend Webhook Registration:**
   - [Resend Dashboard → Webhooks](https://resend.com/webhooks)
   - Verify the endpoint URL is correct
   - Check that all required event types are selected

2. **Check `RESEND_WEBHOOK_SECRET`:**
   - Run `supabase secrets list` to confirm the secret is set
   - The value must match the signing secret shown in Resend's webhook settings

3. **Test Webhook:** Send a test event from the Resend dashboard webhook page to verify the endpoint responds with 200.

4. **Check Edge Function Logs:** Run `supabase functions logs email-webhooks` to review function output.

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

3. **Monitor Feedback Loop:** Query the email_events table filtering by event_type 'complaint' and group by event_data to identify patterns.

4. **Implement Unsubscribe:**
   - Add unsubscribe link to all marketing emails
   - Process unsubscribes immediately
   - Maintain suppression list

---

**Last Updated:** 2026-03-11
**Version:** 2.0.0 (Resend migration)
**Maintainer:** Material Kai Development Team
