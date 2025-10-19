# CRM Configuration Required - Complete Checklist

**Status**: ✅ Code & Database Ready | ⏳ Configuration Pending

---

## 🎯 Summary

The CRM system is **fully built and tested**. All code compiles with **0 TypeScript errors**. Database is **fully configured**. Now we need to configure external services and enable features in Supabase.

---

## 📋 Configuration Checklist

### 1. ✅ DONE - Database & Code
- [x] All 10 database tables created
- [x] All API endpoints implemented
- [x] All UI components created
- [x] Build successful (0 TypeScript errors)
- [x] Test script passing

### 2. ⏳ TODO - Supabase OAuth Configuration

**Location**: Supabase Dashboard → Authentication → Providers

#### Google OAuth
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/)
- [ ] Create new project or select existing
- [ ] Enable Google+ API
- [ ] Create OAuth 2.0 credentials (Web application)
- [ ] Add authorized redirect URIs:
  - `https://your-domain.com/auth/callback`
  - `http://localhost:5173/auth/callback` (for local testing)
- [ ] Copy **Client ID** and **Client Secret**
- [ ] In Supabase Auth → Google:
  - [ ] Enable Google provider
  - [ ] Paste Client ID
  - [ ] Paste Client Secret
  - [ ] Save

#### GitHub OAuth
- [ ] Go to GitHub Settings → Developer settings → OAuth Apps
- [ ] Create new OAuth App
- [ ] Set Authorization callback URL:
  - `https://your-domain.com/auth/callback`
  - `http://localhost:5173/auth/callback` (for local testing)
- [ ] Copy **Client ID** and **Client Secret**
- [ ] In Supabase Auth → GitHub:
  - [ ] Enable GitHub provider
  - [ ] Paste Client ID
  - [ ] Paste Client Secret
  - [ ] Save

#### Microsoft OAuth
- [ ] Go to [Azure Portal](https://portal.azure.com/)
- [ ] Create new App registration
- [ ] Add Redirect URI (Web):
  - `https://your-domain.com/auth/callback`
  - `http://localhost:5173/auth/callback` (for local testing)
- [ ] Create Client Secret
- [ ] Copy **Client ID** and **Client Secret**
- [ ] In Supabase Auth → Microsoft:
  - [ ] Enable Microsoft provider
  - [ ] Paste Client ID
  - [ ] Paste Client Secret
  - [ ] Save

### 3. ⏳ TODO - Stripe Configuration

**Location**: [Stripe Dashboard](https://dashboard.stripe.com/)

#### Create Products & Prices
- [ ] Create Product: "Free Plan"
  - [ ] Price: $0/month (or skip if free)
  - [ ] Copy Product ID → `STRIPE_PRODUCT_ID_FREE`
  - [ ] Copy Price ID → `STRIPE_PRICE_ID_FREE`

- [ ] Create Product: "Pro Plan"
  - [ ] Price: $99/month
  - [ ] Copy Product ID → `STRIPE_PRODUCT_ID_PRO`
  - [ ] Copy Price ID → `STRIPE_PRICE_ID_PRO`

- [ ] Create Product: "Enterprise Plan"
  - [ ] Price: $299/month
  - [ ] Copy Product ID → `STRIPE_PRODUCT_ID_ENTERPRISE`
  - [ ] Copy Price ID → `STRIPE_PRICE_ID_ENTERPRISE`

#### Create Credit Products
- [ ] Create Product: "Starter Credits"
  - [ ] Price: $9.99 (100 credits)
  - [ ] Copy Product ID → `STRIPE_PRODUCT_ID_STARTER_CREDITS`
  - [ ] Copy Price ID → `STRIPE_PRICE_ID_STARTER_CREDITS`

- [ ] Create Product: "Standard Credits"
  - [ ] Price: $44.99 (500 credits)
  - [ ] Copy Product ID → `STRIPE_PRODUCT_ID_STANDARD_CREDITS`
  - [ ] Copy Price ID → `STRIPE_PRICE_ID_STANDARD_CREDITS`

- [ ] Create Product: "Premium Credits"
  - [ ] Price: $84.99 (1000 credits)
  - [ ] Copy Product ID → `STRIPE_PRODUCT_ID_PREMIUM_CREDITS`
  - [ ] Copy Price ID → `STRIPE_PRICE_ID_PREMIUM_CREDITS`

#### Get API Keys
- [ ] Copy **Publishable Key** → `STRIPE_PUBLISHABLE_KEY`
- [ ] Copy **Secret Key** → `STRIPE_SECRET_KEY`
- [ ] Create Webhook Endpoint:
  - [ ] URL: `https://your-domain.com/functions/v1/crm-stripe-api/webhook`
  - [ ] Events: `charge.succeeded`, `charge.failed`, `customer.subscription.updated`, `customer.subscription.deleted`
  - [ ] Copy **Signing Secret** → `STRIPE_WEBHOOK_SECRET`

### 4. ⏳ TODO - GitHub Secrets

**Location**: GitHub Repository → Settings → Secrets and variables → Actions

Add these secrets:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
```

### 5. ⏳ TODO - Supabase Edge Functions Secrets

**Location**: Supabase Dashboard → Edge Functions → Settings

Add these secrets:
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

### 6. ⏳ TODO - Vercel Environment Variables

**Location**: Vercel Dashboard → Project Settings → Environment Variables

Add these variables:
- [ ] `SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co`
- [ ] `SUPABASE_ANON_KEY=...`
- [ ] `STRIPE_PUBLISHABLE_KEY=pk_live_...`

### 7. ⏳ TODO - Update Database with Stripe IDs

Once you have Stripe Product IDs and Price IDs, update the database:

```bash
# Update subscription_plans with Stripe IDs
UPDATE subscription_plans 
SET stripe_product_id = '...', stripe_price_id = '...'
WHERE name = 'free';

UPDATE subscription_plans 
SET stripe_product_id = '...', stripe_price_id = '...'
WHERE name = 'pro';

UPDATE subscription_plans 
SET stripe_product_id = '...', stripe_price_id = '...'
WHERE name = 'enterprise';

# Update credit_packages with Stripe IDs
UPDATE credit_packages 
SET stripe_product_id = '...', stripe_price_id = '...'
WHERE name = 'starter';

UPDATE credit_packages 
SET stripe_product_id = '...', stripe_price_id = '...'
WHERE name = 'standard';

UPDATE credit_packages 
SET stripe_product_id = '...', stripe_price_id = '...'
WHERE name = 'premium';
```

---

## 🔑 Secrets Reference Table

| Secret | Where to Get | Where to Put |
|--------|-------------|-------------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API Keys | GitHub Secrets, Supabase Secrets |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks | GitHub Secrets, Supabase Secrets |
| `STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → API Keys | GitHub Secrets, Vercel Env |
| `GOOGLE_CLIENT_ID` | Google Cloud Console | GitHub Secrets |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console | GitHub Secrets |
| `GITHUB_CLIENT_ID` | GitHub Settings → OAuth Apps | GitHub Secrets |
| `GITHUB_CLIENT_SECRET` | GitHub Settings → OAuth Apps | GitHub Secrets |
| `MICROSOFT_CLIENT_ID` | Azure Portal → App registrations | GitHub Secrets |
| `MICROSOFT_CLIENT_SECRET` | Azure Portal → App registrations | GitHub Secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API | GitHub Secrets, Supabase Secrets |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API | GitHub Secrets, Vercel Env |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API | Vercel Env |

---

## 🧪 Testing After Configuration

### 1. Test OAuth Flow
```bash
# Start local dev server
npm run dev

# Navigate to login page
# Click OAuth button (Google, GitHub, or Microsoft)
# Complete OAuth flow
# Should redirect to /auth/callback
# Should create user profile automatically
# Should redirect to dashboard
```

### 2. Test User Management
```bash
# Login as admin user
# Navigate to /admin/crm
# Should see user list
# Should be able to edit user role
# Should be able to delete user
```

### 3. Test Contact Management
```bash
# Login as manager/factory/admin
# Navigate to /admin/crm
# Click Contacts tab
# Should be able to create contact
# Should be able to edit contact
# Should be able to delete contact
```

### 4. Test Credits System
```bash
# Login as any user
# Check user credits balance
# Should show 0 credits initially
# (Stripe integration needed for purchase)
```

---

## 📝 Notes

- **Local Testing**: Use `http://localhost:5173/auth/callback` for OAuth redirect
- **Production**: Use `https://your-domain.com/auth/callback`
- **Stripe Test Mode**: Use test keys for development
- **Stripe Live Mode**: Use live keys for production
- **All secrets**: Never commit to git, always use GitHub Secrets

---

## ✅ Verification Checklist

After configuration:
- [ ] OAuth providers enabled in Supabase
- [ ] Stripe products created
- [ ] GitHub Secrets added
- [ ] Supabase Edge Functions Secrets added
- [ ] Vercel Environment Variables added
- [ ] Database updated with Stripe IDs
- [ ] OAuth flow tested
- [ ] User management tested
- [ ] Contact management tested
- [ ] Credits system tested

---

## 🚀 Deployment

Once all configuration is complete:

```bash
# 1. Commit all changes
git add .
git commit -m "feat: CRM configuration complete"

# 2. Push to main
git push origin main

# 3. GitHub Actions will deploy automatically
# 4. Monitor deployment logs
# 5. Test on production
```

---

**Status**: Ready for Configuration

