# Push Notifications Admin Guide

## Overview

The Push Notifications admin tab provides comprehensive management of web push notifications within the Messaging Management interface at `/admin/messaging`.

## Features

### 1. **Subscription Management**
- View all push subscriptions (active and inactive)
- See browser breakdown (Chrome, Firefox, Safari, etc.)
- Track subscription activity and status
- Remove/deactivate specific subscriptions
- Cleanup inactive subscriptions in bulk

### 2. **Test Notifications**
- Send test push notifications to your own devices
- Customize notification title and message
- Instant delivery testing
- Verify VAPID configuration

### 3. **Analytics Dashboard**
- Total subscriptions count
- Active vs inactive subscriptions
- Recent activity (last 7 days)
- Browser distribution statistics

### 4. **VAPID Configuration Status**
- Visual indicator of VAPID key configuration
- Public key display (for verification)
- Configuration alerts if VAPID is not set up

## Setup Requirements

### 1. Generate VAPID Keys

You can generate VAPID keys using the web-push library or use an online generator: https://vapidkeys.com/

### 2. Add VAPID Secrets to Supabase

Go to **Supabase Dashboard → Project Settings → Edge Functions → Secrets** and add:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `VAPID_PUBLIC_KEY` | `BNxxx...` | Your VAPID public key |
| `VAPID_PRIVATE_KEY` | `xxx...` | Your VAPID private key (keep secret!) |
| `VAPID_SUBJECT` | `mailto:admin@yourdomain.com` | Contact email or website URL |

### 3. Redeploy Edge Functions

After adding the secrets, redeploy the notification-dispatcher Edge Function using `supabase functions deploy notification-dispatcher`.

## How Push Notifications Work

User subscribes in browser
       ↓
Browser generates subscription endpoint
       ↓
Frontend calls notificationService.registerPushSubscription()
       ↓
Subscription saved to push_subscriptions table
       ↓
When notification is sent:
       ↓
notificationService.send() → checks user preferences
       ↓
Calls notification-dispatcher Edge Function
       ↓
Edge Function sends push to browser using VAPID keys
       ↓
User receives notification

## User Flow

### For Users (Opt-in)

Users can enable push notifications:

1. Navigate to Settings → Notifications
2. Enable "Push Notifications" for desired notification types
3. Browser will prompt for permission
4. Once granted, device is registered

### For Admins

Admins can:

1. Go to `/admin/messaging` → **Push Notifications** tab
2. View all subscriptions and analytics
3. Send test notifications
4. Monitor subscription health
5. Remove invalid/inactive subscriptions

## Notification Types Supported

Push notifications can be sent for any notification type configured in the `notification_types` table:

- Quote updates
- Order status changes
- System alerts
- Product availability
- Custom notifications

Users control which notification types trigger push notifications via their notification preferences.

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Best support |
| Firefox | ✅ Full | Excellent support |
| Safari | ⚠️ Limited | Requires user action |
| Edge | ✅ Full | Chromium-based |
| Mobile Safari | ⚠️ iOS 16.4+ | Limited |

## Troubleshooting

### VAPID Not Configured

**Symptom**: Alert shows "VAPID Configuration Required"

**Solution**:
1. Generate VAPID keys (see Setup Requirements)
2. Add keys to Supabase Edge Function secrets
3. Redeploy notification-dispatcher function
4. Refresh admin page

### Subscriptions Not Receiving

**Symptom**: Test notifications not delivered

**Check**:
1. Is subscription marked as `is_active: true`?
2. Has user granted browser permission?
3. Is browser still open/online?
4. Check browser console for errors
5. Verify VAPID keys are correct

### Invalid/Expired Subscriptions

**Symptom**: Many failed push deliveries

**Solution**:
- Browser subscriptions can expire or become invalid
- Use **Cleanup Inactive** button to remove failed subscriptions
- Users will need to re-subscribe if needed

## Security Best Practices

1. **Never expose VAPID private key** - Only store in Supabase Edge Function secrets
2. **Use HTTPS** - Push notifications require secure context
3. **Respect user preferences** - Always honor opt-out settings
4. **Rate limiting** - Avoid spamming users with too many notifications
5. **Clean up regularly** - Remove expired subscriptions to save database space

## API Integration

### Register Subscription (Client-side)

Use the browser's `navigator.serviceWorker.ready` to get the service worker registration, then call `registration.pushManager.subscribe()` with `userVisibleOnly: true` and your `applicationServerKey` (VAPID public key). Pass the resulting subscription JSON to `notificationService.registerPushSubscription(userId, subscription.toJSON())`.

### Send Notification (Server-side)

Call `notificationService.send()` with a payload containing `userId`, `notificationType`, `title`, `message`, and optional `data` (such as `action_url`).

## Monitoring

Track push notification performance:

1. **Analytics Tab** - View delivery rates and trends
2. **Message Logs** - Detailed log of all notifications
3. **Notifications Table** - Database records with status and timestamps

## Cost Considerations

- **Web Push is FREE** - No per-message costs
- **VAPID keys are free** - Self-managed authentication
- Only costs: Database storage for subscriptions (~500 bytes each)

## Related Documentation

- [Flows Notification System](./flows-notification-system.md) - how notifications are delivered
- [Messaging API](./inbox-system.md) - WhatsApp / messaging channels
- [Deployment Guide](./deployment-guide.md) - VAPID configuration
- [System Architecture](./system-architecture.md) - edge functions (notification-dispatcher)
