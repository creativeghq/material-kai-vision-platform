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

```
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
```

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

```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  
  -- Campaign status
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  
  -- Audience targeting
  audience_filter JSONB DEFAULT '{}'::jsonb,
  recipient_count INTEGER DEFAULT 0,
  
  -- Campaign settings
  subject_line TEXT,
  preview_text TEXT,
  from_name TEXT,
  from_email TEXT,
  reply_to TEXT,
  
  -- Tracking settings
  track_opens BOOLEAN DEFAULT true,
  track_clicks BOOLEAN DEFAULT true,
  
  -- Campaign metadata
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Audit fields
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_scheduled_at ON campaigns(scheduled_at);
CREATE INDEX idx_campaigns_created_by ON campaigns(created_by);
CREATE INDEX idx_campaigns_template_id ON campaigns(template_id);
CREATE INDEX idx_campaigns_tags ON campaigns USING GIN(tags);

-- RLS Policies (Admin-only access)
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage campaigns"
ON campaigns FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.user_id = auth.uid() AND r.name = 'admin'
  )
);
```

**Key Fields:**
- `status` - Campaign lifecycle state
- `audience_filter` - JSONB filter for recipient selection
- `recipient_count` - Auto-updated via trigger
- `track_opens/track_clicks` - Enable/disable tracking
- `tags` - Array for campaign organization
- `metadata` - Additional custom data

### campaign_recipients Table

```sql
CREATE TABLE campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Recipient information
  email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id UUID, -- Future: REFERENCES contacts(id)

  -- Personalization data
  variables JSONB DEFAULT '{}'::jsonb,

  -- Sending status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'bounced', 'complained')),

  -- Tracking timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  complained_at TIMESTAMPTZ,

  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Link to email_logs
  email_log_id UUID REFERENCES email_logs(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one recipient per email per campaign
  UNIQUE(campaign_id, email)
);

-- Indexes
CREATE INDEX idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_email ON campaign_recipients(email);
CREATE INDEX idx_campaign_recipients_status ON campaign_recipients(status);
CREATE INDEX idx_campaign_recipients_sent_at ON campaign_recipients(sent_at);

-- RLS Policies (Admin-only access)
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage recipients"
ON campaign_recipients FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.user_id = auth.uid() AND r.name = 'admin'
  )
);
```

**Key Fields:**
- `status` - Recipient-specific delivery status
- `variables` - Personalization data for template
- Tracking timestamps - Individual tracking per recipient
- `email_log_id` - Links to email_logs for detailed tracking

**Triggers:**
- Auto-update `campaigns.recipient_count` on INSERT/DELETE
- Auto-update `updated_at` on UPDATE

### email_actions Table

```sql
CREATE TABLE email_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_key TEXT UNIQUE NOT NULL,
  action_name TEXT NOT NULL,
  description TEXT,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  trigger_conditions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default actions
INSERT INTO email_actions (action_key, action_name, description) VALUES
  ('welcome_email', 'Welcome Email', 'Sent when a new user signs up'),
  ('password_reset', 'Password Reset', 'Sent when user requests password reset'),
  ('email_verification', 'Email Verification', 'Sent to verify email address'),
  ('quote_request', 'Quote Request Confirmation', 'Sent when user submits a quote request'),
  ('quote_response', 'Quote Response', 'Sent when admin responds to a quote request'),
  ('order_confirmation', 'Order Confirmation', 'Sent when an order is placed');
```

**Purpose:** Maps system events to email templates for automatic sending.

---

## Campaign Service API

### Location
`src/services/email/campaignService.ts`

### Methods

#### Campaign Management

**getCampaigns(filters?)**
```typescript
async getCampaigns(filters?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Campaign[]>
```
Get all campaigns with optional filtering.

**getCampaign(id)**
```typescript
async getCampaign(id: string): Promise<Campaign>
```
Get campaign details with template information.

**createCampaign(data)**
```typescript
async createCampaign(data: {
  name: string;
  description?: string;
  template_id: string;
  subject_line: string;
  preview_text?: string;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  audience_filter?: object;
  tags?: string[];
}): Promise<Campaign>
```
Create a new campaign.

**updateCampaign(id, data)**
```typescript
async updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign>
```
Update campaign details (only for draft campaigns).

**deleteCampaign(id)**
```typescript
async deleteCampaign(id: string): Promise<void>
```
Delete a campaign (only draft campaigns).

#### Campaign Actions

**scheduleCampaign(id, scheduledAt)**
```typescript
async scheduleCampaign(id: string, scheduledAt: Date): Promise<void>
```
Schedule campaign for future delivery.

**sendCampaign(id)**
```typescript
async sendCampaign(id: string): Promise<void>
```
Send campaign immediately. Creates recipients and queues emails.

**pauseCampaign(id)**
```typescript
async pauseCampaign(id: string): Promise<void>
```
Pause a sending campaign.

**cancelCampaign(id)**
```typescript
async cancelCampaign(id: string): Promise<void>
```
Cancel a scheduled campaign.

**sendTestEmail(campaignId, email)**
```typescript
async sendTestEmail(campaignId: string, email: string): Promise<void>
```
Send test email to specified address.

#### Recipient Management

**getCampaignRecipients(campaignId, filters?)**
```typescript
async getCampaignRecipients(
  campaignId: string,
  filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<CampaignRecipient[]>
```
Get recipients for a campaign with optional filtering.

**getCampaignStats(campaignId)**
```typescript
async getCampaignStats(campaignId: string): Promise<{
  totalRecipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
}>
```
Get comprehensive campaign statistics.

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

```typescript
// Create campaign
const campaign = await campaignService.createCampaign({
  name: 'Product Launch Announcement',
  description: 'Announce new material collection',
  template_id: 'template-uuid',
  subject_line: 'Introducing Our New Collection',
  preview_text: 'Discover innovative materials for your next project',
  from_name: 'Material Kai',
  from_email: 'hello@materialkai.com',
  reply_to: 'support@materialkai.com',
  audience_filter: { role: 'user', subscription_tier: 'pro' },
  tags: ['product-launch', 'marketing'],
});
```

### 2. Add Recipients

Recipients are automatically added based on `audience_filter` when campaign is sent.

**Audience Filter Examples:**

```typescript
// All users
{ type: 'all_users' }

// Filter by role
{ role: 'user' }

// Filter by subscription
{ subscription_tier: 'pro' }

// Complex filter
{
  role: 'user',
  subscription_tier: ['pro', 'enterprise'],
  status: 'active'
}
```

### 3. Send Test Email

```typescript
await campaignService.sendTestEmail(campaign.id, 'test@example.com');
```

### 4. Schedule or Send

```typescript
// Schedule for later
await campaignService.scheduleCampaign(
  campaign.id,
  new Date('2025-01-15T10:00:00Z')
);

// Or send immediately
await campaignService.sendCampaign(campaign.id);
```

### 5. Monitor Progress

```typescript
// Get campaign stats
const stats = await campaignService.getCampaignStats(campaign.id);

console.log(`Delivery Rate: ${stats.deliveryRate}%`);
console.log(`Open Rate: ${stats.openRate}%`);
console.log(`Bounce Rate: ${stats.bounceRate}%`);

// Get recipients with status
const recipients = await campaignService.getCampaignRecipients(campaign.id, {
  status: 'bounced'
});
```

---

## Usage Examples

### Example 1: Welcome Campaign

```typescript
// Create welcome campaign for new users
const welcomeCampaign = await campaignService.createCampaign({
  name: 'Welcome Series - Day 1',
  template_id: welcomeTemplateId,
  subject_line: 'Welcome to Material Kai! 🎉',
  from_name: 'Material Kai Team',
  from_email: 'hello@materialkai.com',
  audience_filter: {
    created_after: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
  },
});

// Send immediately
await campaignService.sendCampaign(welcomeCampaign.id);
```

### Example 2: Product Announcement

```typescript
// Create product announcement for pro users
const announcement = await campaignService.createCampaign({
  name: 'New Material Collection Launch',
  template_id: announcementTemplateId,
  subject_line: 'Exclusive First Look: New Materials',
  preview_text: 'Be the first to explore our latest collection',
  from_name: 'Material Kai',
  from_email: 'announcements@materialkai.com',
  audience_filter: {
    subscription_tier: ['pro', 'enterprise'],
    status: 'active'
  },
  tags: ['product-launch', 'pro-users'],
});

// Schedule for next week
const launchDate = new Date();
launchDate.setDate(launchDate.getDate() + 7);
launchDate.setHours(10, 0, 0, 0);

await campaignService.scheduleCampaign(announcement.id, launchDate);
```

### Example 3: Re-engagement Campaign

```typescript
// Re-engage inactive users
const reengagement = await campaignService.createCampaign({
  name: 'We Miss You - Special Offer',
  template_id: reengagementTemplateId,
  subject_line: 'Come back and get 20% off',
  from_name: 'Material Kai',
  from_email: 'hello@materialkai.com',
  audience_filter: {
    last_login_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    status: 'active'
  },
  tags: ['re-engagement', 'special-offer'],
});

// Send test first
await campaignService.sendTestEmail(reengagement.id, 'marketing@materialkai.com');

// Then send to all
await campaignService.sendCampaign(reengagement.id);
```

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

```sql
-- Check for failed recipients
SELECT * FROM campaign_recipients
WHERE campaign_id = 'your-campaign-id'
AND status = 'failed';
```

### High Bounce Rate

**Symptoms:** Bounce rate > 5%

**Solutions:**
1. Clean email list (remove invalid emails)
2. Use double opt-in for new subscribers
3. Check email content for spam triggers
4. Verify SPF/DKIM records

```sql
-- Find bounced emails
SELECT email, error_message, bounced_at
FROM campaign_recipients
WHERE status = 'bounced'
AND campaign_id = 'your-campaign-id';
```

### Recipients Not Receiving Emails

**Symptoms:** Low delivery rate

**Solutions:**
1. Check spam folders
2. Verify SES configuration set
3. Check SNS webhook is working
4. Review email_logs for errors

```sql
-- Check email logs
SELECT * FROM email_logs
WHERE to_email = 'recipient@example.com'
ORDER BY created_at DESC
LIMIT 10;
```

### Tracking Not Working

**Symptoms:** No open/click data

**Solutions:**
1. Verify `track_opens` and `track_clicks` are enabled
2. Check tracking pixel is in template
3. Verify links have tracking parameters
4. Check ses-webhook is processing events

```sql
-- Check if tracking is enabled
SELECT track_opens, track_clicks
FROM campaigns
WHERE id = 'your-campaign-id';
```

### Webhook Not Updating Status

**Symptoms:** campaign_recipients status not updating

**Solutions:**
1. Check ses-webhook Edge Function logs
2. Verify SNS subscription is confirmed
3. Check message_id is being saved in email_logs
4. Test webhook with SES simulator emails

```bash
# View webhook logs
supabase functions logs ses-webhook --tail

# Send test bounce
# Email to: bounce@simulator.amazonses.com
```

---

## Performance Metrics

### Target Metrics

- **Delivery Rate:** > 95%
- **Bounce Rate:** < 5%
- **Complaint Rate:** < 0.1%
- **Open Rate:** 15-25% (industry average)
- **Click Rate:** 2-5% (industry average)

### Monitoring

```sql
-- Campaign performance summary
SELECT
  c.name,
  c.status,
  c.recipient_count,
  COUNT(CASE WHEN cr.status = 'sent' THEN 1 END) as sent,
  COUNT(CASE WHEN cr.delivered_at IS NOT NULL THEN 1 END) as delivered,
  COUNT(CASE WHEN cr.opened_at IS NOT NULL THEN 1 END) as opened,
  COUNT(CASE WHEN cr.clicked_at IS NOT NULL THEN 1 END) as clicked,
  COUNT(CASE WHEN cr.status = 'bounced' THEN 1 END) as bounced,
  COUNT(CASE WHEN cr.status = 'complained' THEN 1 END) as complained,
  ROUND(100.0 * COUNT(CASE WHEN cr.delivered_at IS NOT NULL THEN 1 END) / NULLIF(c.recipient_count, 0), 2) as delivery_rate,
  ROUND(100.0 * COUNT(CASE WHEN cr.status = 'bounced' THEN 1 END) / NULLIF(c.recipient_count, 0), 2) as bounce_rate
FROM campaigns c
LEFT JOIN campaign_recipients cr ON c.id = cr.campaign_id
WHERE c.status = 'sent'
GROUP BY c.id, c.name, c.status, c.recipient_count
ORDER BY c.sent_at DESC;
```

---

## Security

### Row Level Security (RLS)

All campaign tables have RLS enabled with admin-only access:

```sql
-- Only admins can access campaigns
CREATE POLICY "Admins can manage campaigns"
ON campaigns FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.user_id = auth.uid() AND r.name = 'admin'
  )
);
```

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

Trigger-based emails that send automatically on events:

```typescript
// Example: Send welcome email on user signup
// This is handled automatically by email_actions table
// No campaign needed - just link action to template
```

### Email Templates

React Email templates used by campaigns:

```typescript
// Templates are managed in /admin/emails → Templates tab
// Each campaign references a template_id
// Variables are substituted per recipient
```

### SES Webhooks

Automatic bounce/complaint handling:

```typescript
// Webhooks update campaign_recipients automatically
// No manual intervention needed
// See docs/ses-webhook-setup.md for configuration
```

---

## API Integration

### REST API (Future)

Campaign management via REST API:

```bash
# Get campaigns
GET /api/campaigns

# Create campaign
POST /api/campaigns

# Send campaign
POST /api/campaigns/{id}/send

# Get campaign stats
GET /api/campaigns/{id}/stats
```

### Webhooks (Future)

Campaign event webhooks:

```json
{
  "event": "campaign.sent",
  "campaign_id": "uuid",
  "timestamp": "2025-01-15T10:00:00Z",
  "stats": {
    "total_recipients": 1000,
    "sent": 1000,
    "delivered": 950
  }
}
```

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

