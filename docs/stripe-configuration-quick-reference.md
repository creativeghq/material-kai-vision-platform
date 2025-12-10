# Stripe Configuration Quick Reference

## 🔑 What You Need from Stripe

### 1. API Keys (from Stripe Dashboard → Developers → API Keys)
- **Publishable Key**: `pk_test_...` (starts with pk_test_ or pk_live_)
- **Secret Key**: `sk_test_...` (starts with sk_test_ or sk_live_)

### 2. Price IDs (from Stripe Dashboard → Products)
Create these two subscription products first:
- **Pro Subscription** ($29/month) → Copy Price ID: `price_...`
- **Enterprise Subscription** ($99/month) → Copy Price ID: `price_...`

### 3. Webhook Secret (from Stripe Dashboard → Developers → Webhooks)
- Create webhook endpoint: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/stripe-webhooks`
- Copy Signing Secret: `whsec_...`

---

## 📍 Where to Add Each Configuration

### SUPABASE (4 Secrets)
**Location:** Supabase Dashboard → Settings → Vault (Secrets)
**OR:** Supabase Dashboard → Project Settings → Edge Functions → Manage Secrets

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...
```

**Steps:**
1. Go to https://supabase.com/dashboard/project/bgbavxtjlbvgplozizxu/settings/vault
2. Click "Add new secret"
3. Enter name and value
4. Click "Save"
5. Repeat for all 4 secrets

---

### VERCEL (3 Environment Variables)
**Location:** Vercel Dashboard → material-kai-vision-platform → Settings → Environment Variables

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
VITE_STRIPE_PRO_PRICE_ID=price_...
VITE_STRIPE_ENTERPRISE_PRICE_ID=price_...
```

**Steps:**
1. Go to https://vercel.com/creativeghq/material-kai-vision-platform/settings/environment-variables
2. Click "Add New"
3. Enter variable name and value
4. Select ALL environments (Production, Preview, Development)
5. Click "Save"
6. Repeat for all 3 variables
7. Click "Redeploy" after adding all variables

---

## ✅ Configuration Checklist

- [ ] **Stripe Account Created**
- [ ] **Pro Subscription Product Created** ($29/month)
- [ ] **Enterprise Subscription Product Created** ($99/month)
- [ ] **Copied Publishable Key** (pk_test_...)
- [ ] **Copied Secret Key** (sk_test_...)
- [ ] **Copied Pro Price ID** (price_...)
- [ ] **Copied Enterprise Price ID** (price_...)
- [ ] **Created Webhook Endpoint** (https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/stripe-webhooks)
- [ ] **Copied Webhook Signing Secret** (whsec_...)
- [ ] **Added 4 Secrets to Supabase**
  - [ ] STRIPE_SECRET_KEY
  - [ ] STRIPE_WEBHOOK_SECRET
  - [ ] STRIPE_PRO_PRICE_ID
  - [ ] STRIPE_ENTERPRISE_PRICE_ID
- [ ] **Added 3 Environment Variables to Vercel**
  - [ ] VITE_STRIPE_PUBLISHABLE_KEY
  - [ ] VITE_STRIPE_PRO_PRICE_ID
  - [ ] VITE_STRIPE_ENTERPRISE_PRICE_ID
- [ ] **Redeployed Vercel** (to apply new environment variables)

---

## 🧪 Test After Configuration

1. Go to your app: `/profile?tab=subscription`
2. Click "Upgrade to Pro"
3. Use test card: `4242 4242 4242 4242`
4. Complete checkout
5. Verify subscription updated
6. Verify credits granted

---

## 🆘 Quick Links

- **Supabase Secrets:** https://supabase.com/dashboard/project/bgbavxtjlbvgplozizxu/settings/vault
- **Vercel Env Vars:** https://vercel.com/creativeghq/material-kai-vision-platform/settings/environment-variables
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Stripe API Keys:** https://dashboard.stripe.com/test/apikeys
- **Stripe Products:** https://dashboard.stripe.com/test/products
- **Stripe Webhooks:** https://dashboard.stripe.com/test/webhooks

---

## 📝 Notes

- Use **test mode** keys (pk_test_, sk_test_) for development
- Switch to **live mode** keys (pk_live_, sk_live_) for production
- Webhook URL uses your Supabase project ID: `bgbavxtjlbvgplozizxu`
- All Vercel variables must be set for ALL environments (Production, Preview, Development)
- Redeploy Vercel after adding environment variables

