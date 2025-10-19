# Environment Variables Guide

## 🚀 Overview

The Material Kai Vision Platform uses **NO .env files**. All environment variables are managed through:
- **Vercel Environment Variables** (Frontend deployment)
- **GitHub Secrets** (CI/CD workflows)
- **Supabase Edge Functions Secrets** (Backend functions)

## 📋 Required Environment Variables

### Frontend (Vercel)

These variables are needed for the React frontend to run on Vercel:

#### Core Supabase
```
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

#### Stripe (CRM - Credit System & Subscriptions)
```
STRIPE_PUBLISHABLE_KEY=pk_live_<your-stripe-publishable-key>
```

#### MIVAA Service
```
MIVAA_GATEWAY_URL=https://v1api.materialshub.gr
MIVAA_API_KEY=<your-mivaa-jwt-token>
```

#### External APIs (Optional)
```
VITE_OPENAI_API_KEY=<optional-openai-key>
VITE_HUGGINGFACE_API_KEY=<optional-huggingface-key>
VITE_REPLICATE_API_TOKEN=<optional-replicate-token>
```

#### Monitoring (Optional)
```
VITE_SENTRY_DSN=<optional-sentry-dsn>
VITE_LOGROCKET_APP_ID=<optional-logrocket-id>
```

### GitHub Secrets (CI/CD)

These are used in GitHub Actions workflows:

#### Supabase
```
SUPABASE_PROJECT_ID=bgbavxtjlbvgplozizxu
SUPABASE_ACCESS_TOKEN=<your-supabase-cli-token>
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

#### Stripe (CRM - Credit System & Subscriptions)
```
STRIPE_SECRET_KEY=sk_live_<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=whsec_<your-stripe-webhook-secret>
STRIPE_PUBLISHABLE_KEY=pk_live_<your-stripe-publishable-key>
```

#### Vercel
```
VERCEL_TOKEN=<your-vercel-token>
VERCEL_ORG_ID=<your-vercel-org-id>
VERCEL_PROJECT_ID=<your-vercel-project-id>
```

#### Deployment
```
DEPLOY_HOST=<server-ip-or-hostname>
DEPLOY_USER=<ssh-username>
DEPLOY_SSH_KEY=<ssh-private-key>
```

#### API Keys
```
OPENAI_API_KEY=<openai-key>
ANTHROPIC_API_KEY=<anthropic-key>
HUGGINGFACE_API_KEY=<huggingface-key>
REPLICATE_API_TOKEN=<replicate-token>
TOGETHER_API_KEY=<together-ai-key>
```

#### Security
```
JWT_SECRET_KEY=<jwt-signing-secret>
ENCRYPTION_KEY=<data-encryption-key>
```

### Supabase Edge Functions Secrets

These are used by Supabase Edge Functions (backend):

```
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
OPENAI_API_KEY=<openai-key>
MIVAA_API_KEY=<mivaa-jwt-token>
STRIPE_SECRET_KEY=sk_live_<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=whsec_<your-stripe-webhook-secret>
```

## 🔧 Local Development (Optional)

For local development, you can create a `.env.local` file (NOT committed to git):

```bash
# Frontend
VITE_SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_MIVAA_GATEWAY_URL=https://v1api.materialshub.gr
VITE_MIVAA_API_KEY=<your-mivaa-key>

# Optional APIs
VITE_OPENAI_API_KEY=<optional>
VITE_HUGGINGFACE_API_KEY=<optional>
```

**⚠️ IMPORTANT**: Never commit `.env.local` to git. Add it to `.gitignore`.

## 📝 How Variables Are Used

### In Frontend Code

Variables are accessed via `process.env` (defined in vite.config.ts):

```typescript
// vite.config.ts defines these
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MIVAA_GATEWAY_URL = process.env.MIVAA_GATEWAY_URL;
const MIVAA_API_KEY = process.env.MIVAA_API_KEY;
```

### In Supabase Client

```typescript
// src/integrations/supabase/client.ts
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY;
```

### In Edge Functions

```typescript
// supabase/functions/*/index.ts
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);
```

## 💳 CRM System Secrets (Stripe Integration)

The CRM system requires Stripe integration for subscriptions and credit purchases. Here's what you need:

### Stripe Setup
1. Create Stripe account at https://stripe.com
2. Create products:
   - **Subscription Plans**: Free ($0), Pro ($99/month), Enterprise ($299/month)
   - **Credit Packages**: Starter ($9.99), Standard ($44.99), Premium ($84.99)
3. Get API keys from Stripe Dashboard:
   - Publishable Key (starts with `pk_live_`)
   - Secret Key (starts with `sk_live_`)
   - Webhook Signing Secret (starts with `whsec_`)

### Where to Add Stripe Secrets

**GitHub Secrets** (for CI/CD):
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**Supabase Edge Functions Secrets** (for backend):
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

**Vercel Environment Variables** (for frontend):
```
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Authentication Methods (Already Configured ✅)
- **Google OAuth**: ✅ Configured in Supabase
- **Email/Password Signup**: ✅ Enabled in Supabase
- No additional secrets needed for authentication

---

## 🔐 Security Best Practices

1. **Never commit secrets to git**
   - Use `.gitignore` for `.env.local`
   - Only commit `.env.example` with placeholder values

2. **Use appropriate key types**
   - Frontend: Use `SUPABASE_ANON_KEY` (public, limited permissions)
   - Backend: Use `SUPABASE_SERVICE_ROLE_KEY` (private, full permissions)

3. **Rotate secrets regularly**
   - Update API keys quarterly
   - Regenerate JWT secrets after security incidents

4. **Limit secret scope**
   - Only expose necessary secrets to each environment
   - Use Supabase RLS policies to limit data access

## 📊 Variable Reference Table

| Variable | Type | Required | Location | Purpose |
|----------|------|----------|----------|---------|
| `SUPABASE_URL` | String | ✅ | Vercel, GitHub, Supabase | Database connection |
| `SUPABASE_ANON_KEY` | String | ✅ | Vercel, GitHub | Frontend auth |
| `SUPABASE_SERVICE_ROLE_KEY` | String | ✅ | GitHub, Supabase | Backend operations |
| `STRIPE_SECRET_KEY` | String | ✅ | GitHub, Supabase | Stripe backend API calls |
| `STRIPE_WEBHOOK_SECRET` | String | ✅ | GitHub, Supabase | Stripe webhook verification |
| `STRIPE_PUBLISHABLE_KEY` | String | ✅ | Vercel, GitHub | Stripe frontend checkout |
| `MIVAA_GATEWAY_URL` | String | ✅ | Vercel, GitHub | PDF processing service |
| `MIVAA_API_KEY` | String | ✅ | Vercel, GitHub, Supabase | MIVAA authentication |
| `OPENAI_API_KEY` | String | ❌ | GitHub, Supabase | LLM operations |
| `HUGGINGFACE_API_KEY` | String | ❌ | GitHub | ML models |
| `JWT_SECRET_KEY` | String | ✅ | GitHub | Token signing |
| `ENCRYPTION_KEY` | String | ✅ | GitHub | Data encryption |
| `VERCEL_TOKEN` | String | ✅ | GitHub | Deployment automation |
| `DEPLOY_SSH_KEY` | String | ✅ | GitHub | Server deployment |

## 🚀 Setting Up Variables

### 1. Vercel Environment Variables

```bash
# Go to Vercel Dashboard
# Project → Settings → Environment Variables

# Add these variables:
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_ANON_KEY=<your-key>
MIVAA_GATEWAY_URL=https://v1api.materialshub.gr
MIVAA_API_KEY=<your-key>
```

### 2. GitHub Secrets

```bash
# Go to GitHub Repository
# Settings → Secrets and variables → Actions

# Add all required secrets from the GitHub Secrets section above
```

### 3. Supabase Edge Functions Secrets

```bash
# Using Supabase CLI
supabase secrets set SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-key>
supabase secrets set OPENAI_API_KEY=<your-key>
supabase secrets set MIVAA_API_KEY=<your-key>
```

## ✅ Verification

To verify variables are set correctly:

1. **Frontend**: Check Vercel deployment logs
2. **GitHub**: Check workflow run logs
3. **Supabase**: Run `supabase secrets list`

## 🆘 Troubleshooting

### "Missing SUPABASE_URL environment variable"
- Check Vercel environment variables are set
- Verify variable names match exactly (case-sensitive)
- Redeploy after adding variables

### "MIVAA_API_KEY is undefined"
- Verify key is set in Vercel
- Check key hasn't expired
- Regenerate key if needed

### "Edge Function failed to authenticate"
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Supabase secrets
- Check key has correct permissions
- Verify key hasn't been rotated

---

**Last Updated**: 2025-10-16
**Status**: ✅ All systems configured

