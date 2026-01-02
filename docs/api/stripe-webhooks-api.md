# Stripe Webhooks API

## Overview

The Stripe Webhooks API handles webhook events from Stripe for subscription and payment processing.

**Edge Function:** `stripe-webhooks`  
**Webhook URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/stripe-webhooks`

## Authentication

Stripe webhooks are authenticated using webhook signatures:

```typescript
Stripe-Signature: <signature>
```

The signature is verified using the `STRIPE_WEBHOOK_SECRET` environment variable.

## Webhook Events

### Customer Events

#### customer.created
Triggered when a new customer is created in Stripe.

**Handles:**
- Create customer record in database
- Link customer to user account

#### customer.updated
Triggered when customer information is updated.

**Handles:**
- Update customer record in database
- Sync customer metadata

### Subscription Events

#### customer.subscription.created
Triggered when a new subscription is created.

**Handles:**
- Create subscription record
- Update user subscription tier
- Grant access to features
- Add initial credits (if applicable)

#### customer.subscription.updated
Triggered when a subscription is modified.

**Handles:**
- Update subscription record
- Adjust user subscription tier
- Update feature access
- Adjust credit allocation

#### customer.subscription.deleted
Triggered when a subscription is cancelled or expires.

**Handles:**
- Mark subscription as cancelled
- Downgrade user to free tier
- Revoke premium features
- Send cancellation notification

### Payment Events

#### payment_intent.succeeded
Triggered when a payment is successfully processed.

**Handles:**
- Record successful payment
- Update payment status
- Send payment confirmation email
- Add credits (for one-time purchases)

#### payment_intent.payment_failed
Triggered when a payment fails.

**Handles:**
- Record failed payment
- Send payment failure notification
- Update subscription status (if applicable)

#### invoice.paid
Triggered when an invoice is successfully paid.

**Handles:**
- Record invoice payment
- Update subscription billing
- Send invoice receipt
- Add subscription credits

#### invoice.payment_failed
Triggered when invoice payment fails.

**Handles:**
- Record failed invoice
- Send payment failure notification
- Update subscription status
- Trigger retry logic

## Response Format

All webhook handlers return:

```typescript
{
  received: true
}
```

## Database Updates

### Subscriptions Table

```typescript
{
  id: string,
  user_id: string,
  stripe_customer_id: string,
  stripe_subscription_id: string,
  status: 'active' | 'cancelled' | 'past_due' | 'unpaid',
  plan_id: string,
  current_period_start: string,
  current_period_end: string,
  cancel_at_period_end: boolean,
  created_at: string,
  updated_at: string
}
```

### Payments Table

```typescript
{
  id: string,
  user_id: string,
  stripe_payment_intent_id: string,
  amount: number,
  currency: string,
  status: 'succeeded' | 'failed' | 'pending',
  payment_method: string,
  created_at: string
}
```

### User Profile Updates

When subscription changes occur, the user profile is updated:

```typescript
{
  subscription_tier: 'free' | 'pro' | 'enterprise',
  subscription_status: 'active' | 'cancelled' | 'past_due',
  stripe_customer_id: string
}
```

## Subscription Tiers

| Tier | Features | Credits/Month |
|------|----------|---------------|
| **Free** | Basic features | 100 |
| **Pro** | Advanced features | 1,000 |
| **Enterprise** | All features | 10,000 |

## Error Handling

```typescript
{
  error: string
}
```

**Common Errors:**
- `400` - Invalid signature or webhook payload
- `500` - Database update failed

## Webhook Security

1. **Signature Verification**: All webhooks are verified using Stripe's signature
2. **Idempotency**: Webhook events are processed idempotently to prevent duplicates
3. **Error Logging**: All errors are logged for debugging

## Testing Webhooks

Use Stripe CLI to test webhooks locally:

```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhooks
stripe trigger customer.subscription.created
```

## Monitoring

Monitor webhook processing:
- Check Stripe Dashboard for webhook delivery status
- Review Edge Function logs for processing errors
- Monitor database for subscription updates

## Related Documentation

- [Subscription Management](../subscription-management.md)
- [Payment Processing](../payment-processing.md)
- [Credits System](../internal-pricing-credit-system.md)

