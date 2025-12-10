# Stripe Setup Guide

This guide walks you through setting up Stripe integration for the subscription and credits system.

## Prerequisites

- Stripe account (create at https://stripe.com)
- Access to Supabase project settings
- Access to Vercel environment variables (for frontend)

## Step 1: Create Stripe Products and Prices

### 1.1 Subscription Products

Log in to Stripe Dashboard → Products → Create Product

**Pro Subscription**
- Name: `Pro Subscription`
- Description: `1,000 monthly credits + advanced features`
- Pricing: `$29.00 USD / month`
- Recurring: Monthly
- Copy the **Price ID** (starts with `price_...`)

**Enterprise Subscription**
- Name: `Enterprise Subscription`
- Description: `5,000 monthly credits + all features`
- Pricing: `$99.00 USD / month`
- Recurring: Monthly
- Copy the **Price ID** (starts with `price_...`)

### 1.2 Credit Packages (One-time Payments)

These are handled dynamically in the checkout session, so no products needed in Stripe.

## Step 2: Get Stripe API Keys

Go to Stripe Dashboard → Developers → API Keys

**Copy these keys:**
- **Publishable key** (starts with `pk_test_...` or `pk_live_...`)
- **Secret key** (starts with `sk_test_...` or `sk_live_...`)

## Step 3: Set Up Webhook Endpoint

### 3.1 Get Webhook URL

Your webhook URL will be:
```
https://[YOUR_SUPABASE_PROJECT_ID].supabase.co/functions/v1/stripe-webhooks
```

### 3.2 Create Webhook in Stripe

Go to Stripe Dashboard → Developers → Webhooks → Add Endpoint

**Endpoint URL:** Your webhook URL from above

**Events to listen to:**
- `customer.created`
- `customer.updated`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `invoice.paid`
- `invoice.payment_failed`

**Copy the Webhook Signing Secret** (starts with `whsec_...`)

## Step 4: Configure Supabase Edge Function Secrets

**WHERE:** Supabase Dashboard → Project Settings → Edge Functions → Manage Secrets

**OR:** Supabase Dashboard → Settings → Vault (Secrets)

**Add these 4 secrets:**

| Secret Name | Value | Example |
|-------------|-------|---------|
| `STRIPE_SECRET_KEY` | Your Stripe Secret Key from Step 2 | `sk_test_51Abc...` |
| `STRIPE_WEBHOOK_SECRET` | Your Webhook Signing Secret from Step 3 | `whsec_123...` |
| `STRIPE_PRO_PRICE_ID` | Pro Subscription Price ID from Step 1 | `price_1Abc...` |
| `STRIPE_ENTERPRISE_PRICE_ID` | Enterprise Subscription Price ID from Step 1 | `price_1Def...` |

**How to add:**
1. Click "Add new secret"
2. Enter the secret name (exactly as shown above)
3. Paste the value
4. Click "Save"
5. Repeat for all 4 secrets

## Step 5: Configure Vercel Environment Variables

**WHERE:** Vercel Dashboard → Your Project → Settings → Environment Variables

**Add these 3 required variables:**

| Variable Name | Value | Example | Environment |
|---------------|-------|---------|-------------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Your Stripe Publishable Key from Step 2 | `pk_test_51Abc...` | Production, Preview, Development |
| `VITE_STRIPE_PRO_PRICE_ID` | Pro Subscription Price ID from Step 1 | `price_1Abc...` | Production, Preview, Development |
| `VITE_STRIPE_ENTERPRISE_PRICE_ID` | Enterprise Subscription Price ID from Step 1 | `price_1Def...` | Production, Preview, Development |

**How to add:**
1. Click "Add New"
2. Enter the variable name (exactly as shown above)
3. Paste the value
4. Select all environments: Production, Preview, Development
5. Click "Save"
6. Repeat for all 3 variables

**After adding all variables:**
- Click "Redeploy" to apply the new environment variables
- Or wait for next automatic deployment

## Step 6: Test the Integration

### 6.1 Test Credit Purchase

1. Go to `/profile?tab=credits`
2. Click "Purchase Credits"
3. Select a credit package
4. Use Stripe test card: `4242 4242 4242 4242`
5. Expiry: Any future date
6. CVC: Any 3 digits
7. Complete checkout
8. Verify credits appear in your account

### 6.2 Test Subscription

1. Go to `/profile?tab=subscription`
2. Click "Upgrade to Pro" or "Upgrade to Enterprise"
3. Use Stripe test card: `4242 4242 4242 4242`
4. Complete checkout
5. Verify subscription tier updated
6. Verify monthly credits granted

### 6.3 Test Customer Portal

1. Go to `/profile?tab=subscription`
2. Click "Manage Subscription"
3. Verify you can:
   - Update payment method
   - View invoices
   - Cancel subscription
   - Update billing information

## Step 7: Verify Webhook Events

Go to Stripe Dashboard → Developers → Webhooks → Your Endpoint

Check the "Events" tab to see webhook deliveries and responses.

**Expected events after subscription:**
- `customer.created` → Creates Stripe customer ID in user_profiles
- `customer.subscription.created` → Updates subscription tier
- `invoice.paid` → Grants monthly credits

## Step 8: Go Live

When ready for production:

1. **Switch to Live Mode** in Stripe Dashboard
2. **Get Live API Keys** (pk_live_... and sk_live_...)
3. **Create Live Products** with same pricing
4. **Create Live Webhook** with same events
5. **Update Environment Variables** with live keys
6. **Test thoroughly** with real payment methods

## Troubleshooting

### Credits not granted after payment

Check:
1. Webhook is receiving events (Stripe Dashboard → Webhooks)
2. Edge Function logs (Supabase Dashboard → Edge Functions → Logs)
3. Database `credit_transactions` table for transaction records

### Subscription not updating

Check:
1. `user_profiles.stripe_customer_id` is set
2. Webhook received `customer.subscription.updated` event
3. Price ID matches environment variable

### Customer Portal not working

Check:
1. User has `stripe_customer_id` in `user_profiles`
2. Customer has at least one subscription or payment method

## Support

For issues:
1. Check Stripe Dashboard → Developers → Logs
2. Check Supabase Edge Function logs
3. Check browser console for errors
4. Review webhook event details in Stripe

