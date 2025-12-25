# Email System Documentation

## Overview

The Material Kai Vision Platform includes a comprehensive email system built on **Amazon SES** (Simple Email Service) with **React Email** for template management. The system provides:

- ✅ Domain verification and management
- ✅ Email sending with templates
- ✅ Delivery tracking and analytics
- ✅ Bounce and complaint monitoring
- ✅ Transactional and marketing email support
- ✅ React Email template builder
- ✅ Admin dashboard for monitoring

## Architecture

### Components

1. **Email Service** (`src/services/email/emailService.ts`)
   - Amazon SES integration
   - Domain verification
   - Email sending
   - Analytics retrieval

2. **Email Templates** (`src/services/email/templates/`)
   - React Email components
   - Template rendering
   - Variable substitution

3. **API Endpoints** (`supabase/functions/email-api/`)
   - Send emails
   - Manage domains
   - Retrieve logs and analytics

4. **Webhook Handler** (`supabase/functions/email-webhooks/`)
   - Process SES events (bounces, complaints, deliveries)
   - Update email logs automatically

5. **Admin Dashboard** (`src/components/Admin/EmailManagement.tsx`)
   - Domain management
   - Template management
   - Analytics visualization
   - Email logs viewer
   - Test email functionality

### Database Schema

The system uses 5 main tables:

- `email_domains` - Verified SES domains
- `email_templates` - React Email templates
- `email_logs` - All sent emails
- `email_events` - Delivery events (bounces, complaints, opens, clicks)
- `email_analytics` - Aggregated daily statistics

## Setup Guide

### 1. AWS SES Configuration

#### Create AWS Account and Configure SES

1. **Sign up for AWS** at https://aws.amazon.com
2. **Navigate to SES** in the AWS Console
3. **Request production access** (initially in sandbox mode)
4. **Create IAM user** with SES permissions:
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
           "ses:GetSendStatistics"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

5. **Generate access keys** for the IAM user

#### Configure Supabase Secrets

**IMPORTANT**: AWS credentials are stored as **Supabase Secrets**, NOT in environment variables.

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (KAI - `bgbavxtjlbvgplozizxu`)
3. Navigate to **Edge Functions** → **Settings** → **Secrets**
4. Add the following secrets:

| Secret Name | Value | Description |
|------------|-------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region for SES |
| `AWS_ACCESS_KEY_ID` | Your AWS access key | IAM user access key with SES permissions |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key | IAM user secret access key |
| `DEFAULT_FROM_EMAIL` | `noreply@yourdomain.com` | Default sender email address |
| `DEFAULT_FROM_NAME` | `Material Kai` | Default sender name |

**Why Supabase Secrets?**
- ✅ Secure - Never exposed to frontend code
- ✅ Centralized - Available to all Edge Functions
- ✅ No redeployment needed when updating secrets
- ✅ Follows security best practices

### 2. Database Migration

Run the migration to create email tables:

```bash
# Apply migration
supabase db push
```

Or manually run:
```bash
psql -h your-db-host -U postgres -d postgres -f supabase/migrations/20250101000000_create_email_system.sql
```

### 3. Domain Verification

#### Via Admin Dashboard

1. Navigate to **Admin → Email Management → Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Copy the verification token
5. Add DNS TXT record:
   - **Name**: `_amazonses.yourdomain.com`
   - **Value**: `[verification token]`
6. Click **Check Verification Status** after DNS propagates (can take up to 72 hours)

#### Via AWS Console

Alternatively, verify domains directly in AWS SES Console and sync to database.

### 4. SNS Webhook Setup (Optional but Recommended)

To track bounces and complaints:

1. **Create SNS Topic** in AWS Console
2. **Configure SES** to publish events to SNS
3. **Subscribe webhook endpoint**:
   - Endpoint: `https://your-project.supabase.co/functions/v1/email-webhooks`
   - Protocol: HTTPS
4. **Confirm subscription** (automatic via webhook handler)

## Usage

### Sending Emails

#### Using the Email Service

```typescript
import { emailService } from '@/services/email/emailService';

// Send simple email
await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to Material Kai</h1>',
  text: 'Welcome to Material Kai',
  emailType: 'transactional',
});

// Send with template
await emailService.sendEmail({
  to: 'user@example.com',
  templateSlug: 'welcome',
  variables: {
    userName: 'John Doe',
    loginUrl: 'https://app.materialkai.com/login',
  },
  emailType: 'transactional',
});
```

#### Using the API

```bash
curl -X POST https://your-project.supabase.co/functions/v1/email-api/send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "Test Email",
    "html": "<p>Hello World</p>",
    "emailType": "transactional"
  }'
```

### Creating Email Templates

Templates are built with React Email components:

```tsx
// src/services/email/templates/MyTemplate.tsx
import React from 'react';
import { Text, Button } from '@react-email/components';
import { BaseEmailTemplate } from './BaseEmailTemplate';

export interface MyTemplateProps {
  userName: string;
  actionUrl: string;
}

export const MyTemplate: React.FC<MyTemplateProps> = ({ userName, actionUrl }) => {
  return (
    <BaseEmailTemplate>
      <Text>Hello {userName}!</Text>
      <Button href={actionUrl}>Click Here</Button>
    </BaseEmailTemplate>
  );
};
```

Register in `src/services/email/templates/index.ts`:

```typescript
export const emailTemplates = {
  welcome: WelcomeEmail,
  myTemplate: MyTemplate, // Add your template
} as const;
```

## Admin Dashboard

Access at `/admin/emails`

### Features

1. **Analytics Tab**
   - Total sent, delivered, bounced, complained
   - Delivery, bounce, and complaint rates
   - Performance charts
   - Recommendations

2. **Email Logs Tab**
   - View all sent emails
   - Filter by status and type
   - Export to CSV
   - Track delivery status

3. **Domains Tab**
   - Add and verify domains
   - View verification status
   - Monitor domain reputation
   - Check bounce/complaint rates

4. **Templates Tab**
   - View all templates
   - Preview templates
   - Manage template variables

5. **Test Email**
   - Send test emails
   - Verify configuration

## Best Practices

### Email Deliverability

1. **Warm up your domain** - Start with low volume and gradually increase
2. **Monitor bounce rate** - Keep below 5%
3. **Monitor complaint rate** - Keep below 0.1%
4. **Use double opt-in** for marketing emails
5. **Provide unsubscribe links** in all marketing emails
6. **Authenticate your domain** with SPF, DKIM, and DMARC

### Template Design

1. **Keep it simple** - Avoid complex layouts
2. **Mobile-first** - Most emails are read on mobile
3. **Test across clients** - Gmail, Outlook, Apple Mail
4. **Include plain text** version
5. **Use inline CSS** - Better compatibility

### Monitoring

1. **Check analytics daily**
2. **Investigate high bounce rates** immediately
3. **Review complaint feedback**
4. **Monitor sending quota** usage
5. **Set up alerts** for critical metrics

## Troubleshooting

### Common Issues

**Domain verification fails**
- Check DNS propagation (use `dig` or online tools)
- Ensure TXT record is correct
- Wait up to 72 hours for DNS changes

**Emails not sending**
- Verify AWS credentials
- Check SES sandbox mode (verify recipient emails)
- Review CloudWatch logs
- Check sending quota

**High bounce rate**
- Clean email list
- Remove invalid addresses
- Check email format validation

**Emails in spam**
- Configure SPF, DKIM, DMARC
- Improve email content
- Reduce sending frequency
- Monitor sender reputation

## API Reference

See `supabase/functions/email-api/index.ts` for full API documentation.

### Endpoints

- `POST /email-api/send` - Send email
- `POST /email-api/verify-domain` - Verify domain
- `POST /email-api/check-domain` - Check verification status
- `GET /email-api/domains` - List domains
- `GET /email-api/logs` - Get email logs
- `GET /email-api/analytics` - Get analytics
- `GET /email-api/sending-stats` - Get SES quota stats

## Support

For issues or questions:
1. Check CloudWatch logs in AWS Console
2. Review Supabase function logs
3. Check email_logs table for error messages
4. Consult AWS SES documentation

## Resources

- [Amazon SES Documentation](https://docs.aws.amazon.com/ses/)
- [React Email Documentation](https://react.email)
- [Email Best Practices](https://docs.aws.amazon.com/ses/latest/dg/best-practices.html)

