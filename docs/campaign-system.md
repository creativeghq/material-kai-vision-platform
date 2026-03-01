# Campaign System

Complete documentation for the email campaign management system with audience targeting, recipient tracking, and comprehensive analytics.

> **📚 Related Documentation:**
> - [Email System](./email-system.md) - Email sending and template management
> - [SES Webhook Setup](./ses-webhook-setup.md) - Bounce and complaint handling
> - [System Architecture](./system-architecture.md) - Platform overview
> - [API Endpoints](./api-endpoints.md) - Complete API reference

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Database Schema](#database-schema)
5. [Campaign Service API](#campaign-service-api)
6. [Admin Dashboard](#admin-dashboard)
7. [Campaign Workflow](#campaign-workflow)
8. [Usage Examples](#usage-examples)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Campaign System provides enterprise-grade email marketing capabilities with audience targeting, recipient tracking, and real-time analytics. Built on top of the Email System, it enables bulk email sending with personalization, scheduling, and comprehensive delivery tracking.

### Key Features

- **Campaign Management** - Create, schedule, and manage email campaigns
- **Audience Targeting** - Filter recipients by user attributes, roles, or custom criteria
- **Recipient Tracking** - Individual tracking for each recipient (sent, delivered, opened, clicked, bounced)
- **Template Integration** - Use React Email templates with variable substitution
- **Test Emails** - Send test emails before launching campaigns
- **Campaign Scheduling** - Schedule campaigns for future delivery
- **Real-time Analytics** - Track delivery rates, open rates, click rates, bounce rates
- **Bounce Handling** - Automatic bounce and complaint tracking via SES webhooks
- **Campaign Status** - Draft, scheduled, sending, sent, paused, cancelled
- **Admin Interface** - Complete management UI at `/admin/emails` → Campaigns tab

### Use Cases

1. **Marketing Campaigns** - Product announcements, newsletters, promotions
2. **User Onboarding** - Welcome series, feature announcements
3. **System Notifications** - Platform updates, maintenance alerts
4. **Re-engagement** - Win-back campaigns, inactive user outreach
5. **Event Invitations** - Webinars, product launches, community events

---

## Architecture

### System Overview

┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (React)                                            │
│ ├─ Campaign Service (src/services/email/campaignService.ts)│
│ ├─ Admin Dashboard (/admin/emails → Campaigns tab)         │
│ └─ Campaign Components (CampaignsTab, CreateCampaignModal) │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ SUPABASE (Database + Edge Functions)                       │
│ ├─ campaigns table (Campaign metadata)                     │
│ ├─ campaign_recipients table (Individual tracking)         │
│ ├─ email_actions table (Trigger-based emails)              │
│ ├─ email_templates table (React Email templates)           │
│ └─ email-api Edge Function (Email sending)                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ AMAZON SES (Email Delivery)                                 │
│ ├─ Configuration Set (material-kai-emails)                 │
│ ├─ SNS Topic (ses-notifications)                           │
│ └─ Bounce/Complaint Tracking                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ WEBHOOK PROCESSING (Supabase Edge Function)                │
│ └─ ses-webhook (Updates campaign_recipients status)        │
└─────────────────────────────────────────────────────────────┘

### Components

#### 1. Frontend Service Layer
**Location:** `src/services/email/campaignService.ts`

Complete campaign management service with methods:
- Campaign CRUD operations
- Recipient management
- Campaign scheduling and sending
- Test email functionality
- Statistics and analytics

#### 2. Admin Dashboard
**Location:** `src/components/Admin/EmailManagement/`

**CampaignsTab.tsx** - Main campaigns list
- View all campaigns with status
- Create new campaigns
- Quick actions (send, schedule, pause, cancel)
- Campaign statistics overview

**CreateCampaignModal.tsx** - Campaign creation wizard
- Template selection
- Audience targeting
- Email customization
- Preview functionality

**CampaignDetailsModal.tsx** - Detailed campaign view
- Recipient list with status
- Send test emails
- Campaign statistics
- Schedule/send controls

#### 3. Database Tables
**Location:** Supabase PostgreSQL

**campaigns** - Campaign metadata
- Campaign settings and configuration
- Status tracking
- Scheduling information
- Analytics counters

**campaign_recipients** - Individual recipient tracking
- Per-recipient delivery status
- Tracking timestamps (sent, delivered, opened, clicked, bounced)
- Error messages and retry counts
- Personalization variables

**email_actions** - Trigger-based emails
- Maps actions (welcome, password_reset) to templates
- Automatic email sending on events

#### 4. Edge Functions
**Location:** `supabase/functions/`

**email-api** - Email sending with campaign support
- Sends individual emails
- Updates campaign_recipients status
- Links to email_logs for tracking

**ses-webhook** - SES event processing
- Handles bounce notifications
- Handles complaint notifications
- Handles delivery confirmations
- Updates campaign_recipients in real-time

---

## Features

### Detailed Feature List

#### Campaign Creation
- ✅ Name and description
- ✅ Template selection from library
- ✅ Subject line customization
- ✅ Preview text
- ✅ From name and email
- ✅ Reply-to address
- ✅ Audience filtering
- ✅ Tags for organization
- ✅ Metadata storage

#### Audience Targeting
- ✅ All users
- ✅ Filter by role (admin, user, etc.)
- ✅ Filter by subscription tier
- ✅ Filter by user status
- ✅ Custom JSONB filters
- ✅ Manual recipient list
- ✅ Import from contacts (future)

#### Campaign Scheduling
- ✅ Send immediately
- ✅ Schedule for future date/time
- ✅ Pause sending
- ✅ Resume paused campaigns
- ✅ Cancel scheduled campaigns

#### Recipient Management
- ✅ Add recipients from users table
- ✅ Add recipients from contacts table (future)
- ✅ Manual email entry
- ✅ Personalization variables per recipient
- ✅ Unique constraint (one email per campaign)
- ✅ Automatic recipient count updates

#### Tracking & Analytics
- ✅ Total recipients
- ✅ Sent count
- ✅ Delivered count
- ✅ Opened count (requires tracking pixel)
- ✅ Clicked count (requires link tracking)
- ✅ Bounced count
- ✅ Complained count
- ✅ Delivery rate percentage
- ✅ Bounce rate percentage
- ✅ Complaint rate percentage

#### Test Functionality
- ✅ Send test email to any address
- ✅ Preview with actual template
- ✅ Test personalization variables
- ✅ Verify email rendering

---

## Database Schema

### campaigns Table

The `campaigns` table stores the following key fields: id (UUID primary key), name, description, template_id (references email_templates), status (one of: draft, scheduled, sending, sent, paused, cancelled), scheduled_at, sent_at, audience_filter (JSONB), recipient_count (auto-updated via trigger), subject_line, preview_text, from_name, from_email, reply_to, track_opens (boolean, default true), track_clicks (boolean, default true), tags (text array), metadata (JSONB), created_by, updated_by, created_at, and updated_at.

Indexes are created on status, scheduled_at, created_by, template_id, and a GIN index on tags.

RLS is enabled with an admin-only policy that checks membership in the admin role via user_profiles and roles tables.

**Key Fields:**
- `status` - Campaign lifecycle state
- `audience_filter` - JSONB filter for recipient selection
- `recipient_count` - Auto-updated via trigger
- `track_opens/track_clicks` - Enable/disable tracking
- `tags` - Array for campaign organization
- `metadata` - Additional custom data

### campaign_recipients Table

The `campaign_recipients` table stores: id (UUID primary key), campaign_id (references campaigns, cascade delete), email, user_id (references auth.users), contact_id (future use), variables (JSONB for personalization), status (one of: pending, sending, sent, failed, bounced, complained), tracking timestamps (sent_at, delivered_at, opened_at, clicked_at, bounced_at, complained_at), error_message, retry_count, email_log_id (references email_logs), created_at, and updated_at. A unique constraint enforces one email per campaign.

Indexes are created on campaign_id, email, status, and sent_at. RLS is enabled with the same admin-only policy.

**Key Fields:**
- `status` - Recipient-specific delivery status
- `variables` - Personalization data for template
- Tracking timestamps - Individual tracking per recipient
- `email_log_id` - Links to email_logs for detailed tracking

**Triggers:**
- Auto-update `campaigns.recipient_count` on INSERT/DELETE
- Auto-update `updated_at` on UPDATE

### email_actions Table

The `email_actions` table maps system events to email templates for automatic sending. It stores: id, action_key (unique text identifier), action_name, description, template_id (references email_templates), is_active (default true), trigger_conditions (JSONB), created_at, and updated_at.

Default actions are pre-seeded for: welcome_email, password_reset, email_verification, quote_request, quote_response, and order_confirmation.

**Purpose:** Maps system events to email templates for automatic sending.

---

## Campaign Service API

### Location
`src/services/email/campaignService.ts`

### Methods

#### Campaign Management

**getCampaigns(filters?)** — Get all campaigns with optional filtering by status, limit, and offset. Returns a Promise of Campaign array.

**getCampaign(id)** — Get campaign details with template information. Returns a Promise of Campaign.

**createCampaign(data)** — Create a new campaign with name, description, template_id, subject_line, preview_text, from_name, from_email, reply_to, audience_filter, and tags. Returns a Promise of Campaign.

**updateCampaign(id, data)** — Update campaign details (only for draft campaigns). Returns a Promise of Campaign.

**deleteCampaign(id)** — Delete a campaign (only draft campaigns). Returns a Promise of void.

#### Campaign Actions

**scheduleCampaign(id, scheduledAt)** — Schedule campaign for future delivery at the given Date.

**sendCampaign(id)** — Send campaign immediately. Creates recipients and queues emails.

**pauseCampaign(id)** — Pause a sending campaign.

**cancelCampaign(id)** — Cancel a scheduled campaign.

**sendTestEmail(campaignId, email)** — Send test email to specified address.

#### Recipient Management

**getCampaignRecipients(campaignId, filters?)** — Get recipients for a campaign with optional filtering by status, limit, and offset.

**getCampaignStats(campaignId)** — Get comprehensive campaign statistics including totalRecipients, sent, delivered, opened, clicked, bounced, complained counts, and deliveryRate, openRate, clickRate, bounceRate, complaintRate percentages.

---

## Admin Dashboard

### Location
`/admin/emails` → **Campaigns** tab

### Components

#### 1. Campaigns List (CampaignsTab.tsx)

**Features:**
- View all campaigns in table format
- Filter by status (draft, scheduled, sending, sent, paused, cancelled)
- Search by campaign name
- Quick stats (total recipients, delivery rate, open rate)
- Action buttons (view, send, schedule, pause, cancel, delete)
- Create new campaign button

**Columns:**
- Campaign name
- Status badge
- Template name
- Recipients count
- Scheduled/sent date
- Delivery rate
- Actions menu

#### 2. Create Campaign Modal (CreateCampaignModal.tsx)

**Steps:**
1. **Basic Info** - Name, description, tags
2. **Template** - Select from template library
3. **Email Settings** - Subject, preview text, from/reply-to
4. **Audience** - Select recipients (all users, filtered, manual)
5. **Review** - Preview and confirm

**Features:**
- Template preview
- Variable substitution preview
- Audience size estimation
- Save as draft option

#### 3. Campaign Details Modal (CampaignDetailsModal.tsx)

**Tabs:**
- **Overview** - Campaign info and stats
- **Recipients** - List with individual status
- **Analytics** - Charts and metrics
- **Settings** - Edit campaign settings

**Actions:**
- Send test email
- Schedule campaign
- Send now
- Pause/resume
- Cancel
- Delete (draft only)

**Statistics:**
- Total recipients
- Sent/delivered/opened/clicked counts
- Bounce and complaint counts
- Delivery/open/click/bounce/complaint rates
- Timeline chart

---

## Campaign Workflow

### 1. Create Campaign

Call `campaignService.createCampaign()` with the campaign name, description, template_id, subject_line, preview_text, from_name, from_email, reply_to, audience_filter (e.g., `{ role: 'user', subscription_tier: 'pro' }`), and tags.

### 2. Add Recipients

Recipients are automatically added based on `audience_filter` when campaign is sent.

**Audience Filter Examples:**

- All users: `{ type: 'all_users' }`
- Filter by role: `{ role: 'user' }`
- Filter by subscription: `{ subscription_tier: 'pro' }`
- Complex filter: `{ role: 'user', subscription_tier: ['pro', 'enterprise'], status: 'active' }`

### 3. Send Test Email

Call `campaignService.sendTestEmail(campaign.id, 'test@example.com')` to send a test before launching.

### 4. Schedule or Send

Call `campaignService.scheduleCampaign(campaign.id, scheduledDate)` to schedule for a future time, or `campaignService.sendCampaign(campaign.id)` to send immediately.

### 5. Monitor Progress

Call `campaignService.getCampaignStats(campaign.id)` to retrieve delivery rate, open rate, bounce rate, and other metrics. Call `campaignService.getCampaignRecipients(campaign.id, { status: 'bounced' })` to inspect recipients by status.

---

## Usage Examples

### Example 1: Welcome Campaign

Create a welcome campaign targeting users created in the last 24 hours by setting `audience_filter` with a `created_after` timestamp. Then send immediately with `campaignService.sendCampaign()`.

### Example 2: Product Announcement

Create an announcement campaign targeting active pro and enterprise subscribers using `audience_filter: { subscription_tier: ['pro', 'enterprise'], status: 'active' }`. Schedule it for a future date/time using `campaignService.scheduleCampaign()`.

### Example 3: Re-engagement Campaign

Create a re-engagement campaign targeting users who haven't logged in for 30 days using a `last_login_before` filter. Send a test email first with `campaignService.sendTestEmail()`, then launch with `campaignService.sendCampaign()`.

---

## Best Practices

### Campaign Planning

1. **Define Clear Goals**
   - What action do you want recipients to take?
   - How will you measure success?

2. **Segment Your Audience**
   - Use audience filters to target specific user groups
   - Personalize content based on user attributes

3. **Test Before Sending**
   - Always send test emails
   - Check rendering on multiple devices
   - Verify all links work

4. **Optimize Send Times**
   - Schedule campaigns for optimal engagement
   - Consider time zones for global audiences

### Content Best Practices

1. **Subject Lines**
   - Keep under 50 characters
   - Create urgency or curiosity
   - Avoid spam trigger words
   - Personalize when possible

2. **Preview Text**
   - Complement the subject line
   - Provide additional context
   - Keep under 100 characters

3. **Email Body**
   - Clear call-to-action
   - Mobile-responsive design
   - Use templates for consistency
   - Include unsubscribe link

### Deliverability

1. **Maintain List Hygiene**
   - Remove bounced emails
   - Honor unsubscribe requests
   - Segment engaged vs. inactive users

2. **Monitor Metrics**
   - Keep bounce rate < 5%
   - Keep complaint rate < 0.1%
   - Aim for delivery rate > 95%

3. **Warm Up New Domains**
   - Start with small batches
   - Gradually increase volume
   - Monitor reputation scores

### Performance

1. **Batch Sending**
   - Don't send to entire list at once
   - Use scheduling to spread load
   - Monitor SES sending limits

2. **Track and Optimize**
   - A/B test subject lines
   - Test different send times
   - Analyze open and click rates
   - Iterate based on data

---

## Troubleshooting

### Campaign Not Sending

**Symptoms:** Campaign stuck in "sending" status

**Solutions:**
1. Check SES sending limits
2. Verify email domain is verified
3. Check for errors in campaign_recipients table
4. Review email-api Edge Function logs

Query the campaign_recipients table for rows with `status = 'failed'` and the relevant campaign_id to identify failed recipients and their error messages.

### High Bounce Rate

**Symptoms:** Bounce rate > 5%

**Solutions:**
1. Clean email list (remove invalid emails)
2. Use double opt-in for new subscribers
3. Check email content for spam triggers
4. Verify SPF/DKIM records

Query campaign_recipients for rows with `status = 'bounced'` and the relevant campaign_id to see email addresses, error messages, and bounce timestamps.

### Recipients Not Receiving Emails

**Symptoms:** Low delivery rate

**Solutions:**
1. Check spam folders
2. Verify SES configuration set
3. Check SNS webhook is working
4. Review email_logs for errors

Query the email_logs table filtering by recipient email and ordering by created_at descending to see recent send attempts.

### Tracking Not Working

**Symptoms:** No open/click data

**Solutions:**
1. Verify `track_opens` and `track_clicks` are enabled
2. Check tracking pixel is in template
3. Verify links have tracking parameters
4. Check ses-webhook is processing events

Query the campaigns table for the relevant campaign_id to confirm track_opens and track_clicks are set to true.

### Webhook Not Updating Status

**Symptoms:** campaign_recipients status not updating

**Solutions:**
1. Check ses-webhook Edge Function logs using `supabase functions logs ses-webhook --tail`
2. Verify SNS subscription is confirmed
3. Check message_id is being saved in email_logs
4. Test webhook with SES simulator emails (e.g., email to bounce@simulator.amazonses.com)

---

## Performance Metrics

### Target Metrics

- **Delivery Rate:** > 95%
- **Bounce Rate:** < 5%
- **Complaint Rate:** < 0.1%
- **Open Rate:** 15-25% (industry average)
- **Click Rate:** 2-5% (industry average)

### Monitoring

Query the campaigns and campaign_recipients tables with a join to compute per-campaign statistics including recipient_count, sent count, delivered count, opened count, clicked count, bounced count, complained count, delivery_rate, and bounce_rate. Filter to campaigns with status 'sent' and order by sent_at descending.

---

## Security

### Row Level Security (RLS)

All campaign tables have RLS enabled with admin-only access. The policy checks that the authenticated user has the 'admin' role via the user_profiles and roles tables.

### Data Protection

- Email addresses encrypted in transit (HTTPS)
- Sensitive data stored in Supabase (SOC 2 compliant)
- AWS credentials stored as Supabase Secrets
- Audit trail via created_by/updated_by fields

### Compliance

- **GDPR:** Unsubscribe links required
- **CAN-SPAM:** Physical address in footer
- **CASL:** Consent tracking (future)

---

## Related Systems

### Email Actions

Trigger-based emails send automatically on system events (such as user signup triggering a welcome email) by linking an action key to a template in the email_actions table. No campaign is needed for these automated sends.

### Email Templates

React Email templates are managed in `/admin/emails` → Templates tab. Each campaign references a template_id, and variables are substituted per recipient at send time.

### SES Webhooks

SES webhook processing automatically updates campaign_recipients status when bounces, complaints, or deliveries are reported by Amazon SES via SNS. No manual intervention is needed. See docs/ses-webhook-setup.md for configuration details.

---

## API Integration

### REST API (Future)

Campaign management via REST API is planned, with endpoints for listing campaigns, creating campaigns, sending campaigns, and retrieving campaign statistics.

### Webhooks (Future)

Campaign event webhooks are planned and will deliver JSON payloads containing the event type (e.g., "campaign.sent"), campaign_id, timestamp, and statistics including total_recipients, sent, and delivered counts.

---

## Roadmap

### Phase 1 (Complete) ✅
- Campaign creation and management
- Recipient tracking
- Basic analytics
- Admin dashboard
- SES webhook integration

### Phase 2 (Planned)
- A/B testing
- Advanced segmentation
- Drip campaigns
- Email builder
- Suppression list management

### Phase 3 (Future)
- Marketing automation
- Lead scoring
- CRM integration
- SMS campaigns
- Advanced analytics

---

## Support

For questions or issues:
- Check [Email System](./email-system.md) documentation
- Review [SES Webhook Setup](./ses-webhook-setup.md) guide
- Check [Troubleshooting](#troubleshooting) section
- Contact: support@materialkaivision.com

---

**Last Updated:** December 25, 2024
**Version:** 1.0.0
**Status:** Production Ready
**Maintainer:** Development Team
