# 🔑 Environment Variables Checklist
## Material Kai Vision Platform - Deployment Keys

**Last Updated:** 2025-10-01  
**Status:** Ready for Deployment

---

## 📋 Required Environment Variables

### 🗄️ **Supabase Configuration** (CRITICAL)
```
NEXT_PUBLIC_SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[Get from Supabase Dashboard > Settings > API]
SUPABASE_SERVICE_ROLE_KEY=[Get from Supabase Dashboard > Settings > API]
```
**Where to Set:**
- ✅ **Vercel:** Project Settings > Environment Variables
- ✅ **GitHub:** Repository Settings > Secrets and Variables > Actions
- ✅ **Supabase:** Already configured (source of these values)

---

### 🤖 **AI/ML Service Keys** (CRITICAL)
```
OPENAI_API_KEY=[Get from OpenAI Dashboard > API Keys]
HUGGINGFACE_API_TOKEN=[Get from Hugging Face > Settings > Access Tokens]
REPLICATE_API_TOKEN=[Get from Replicate > Account > API Tokens]
```
**Where to Set:**
- ✅ **Vercel:** Project Settings > Environment Variables
- ✅ **GitHub:** Repository Settings > Secrets and Variables > Actions
- ✅ **Supabase:** Edge Functions > Environment Variables

---

### 🔗 **MIVAA Integration** (HIGH PRIORITY)
```
MIVAA_GATEWAY_URL=http://localhost:3000
MIVAA_API_KEY=[Generate or get from MIVAA service]
MATERIAL_KAI_API_URL=[Your platform API URL]
MATERIAL_KAI_API_KEY=[Your platform API key]
```
**Where to Set:**
- ✅ **Vercel:** Project Settings > Environment Variables
- ✅ **Supabase:** Edge Functions > Environment Variables

---

### 🌐 **Web Scraping Services** (MEDIUM PRIORITY)
```
FIRECRAWL_API_KEY=[Get from Firecrawl Dashboard]
JINA_API_KEY=[Get from Jina AI Dashboard]
```
**Where to Set:**
- ✅ **Vercel:** Project Settings > Environment Variables
- ✅ **Supabase:** Edge Functions > Environment Variables

---

### ☁️ **Storage & Infrastructure** (OPTIONAL)
```
AWS_REGION=us-east-1
AWS_S3_BUCKET=[Your S3 bucket name]
SENTRY_DSN=[Get from Sentry Dashboard]
```
**Where to Set:**
- ✅ **Vercel:** Project Settings > Environment Variables

---

## 🎯 **Platform-Specific Setup Instructions**

### 🔷 **Vercel Deployment**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `material-kai-vision-platform`
3. Navigate to **Settings > Environment Variables**
4. Add all variables marked with ✅ **Vercel**
5. Set **Environment:** `Production`, `Preview`, `Development` (as needed)

### 🐙 **GitHub Actions**
1. Go to your repository: `creativeghq/material-kai-vision-platform`
2. Navigate to **Settings > Secrets and Variables > Actions**
3. Add **Repository Secrets** for all variables marked with ✅ **GitHub**
4. These are used for CI/CD and automated deployments

### 🗄️ **Supabase Edge Functions**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: `KAI (bgbavxtjlbvgplozizxu)`
3. Navigate to **Edge Functions > Environment Variables**
4. Add all variables marked with ✅ **Supabase**
5. These are available to all 32 deployed edge functions

---

## ✅ **Deployment Readiness Checklist**

### Critical (Must Have)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` - Set in Vercel & GitHub
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Set in Vercel & GitHub  
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Set in Vercel & GitHub
- [ ] `OPENAI_API_KEY` - Set in Vercel, GitHub & Supabase
- [ ] `HUGGINGFACE_API_TOKEN` - Set in Vercel, GitHub & Supabase
- [ ] `REPLICATE_API_TOKEN` - Set in Vercel, GitHub & Supabase

### High Priority (Recommended)
- [ ] `MIVAA_GATEWAY_URL` - Set in Vercel & Supabase
- [ ] `MIVAA_API_KEY` - Set in Vercel & Supabase
- [ ] `MATERIAL_KAI_API_URL` - Set in Vercel & Supabase
- [ ] `MATERIAL_KAI_API_KEY` - Set in Vercel & Supabase

### Medium Priority (Optional)
- [ ] `FIRECRAWL_API_KEY` - Set in Vercel & Supabase
- [ ] `JINA_API_KEY` - Set in Vercel & Supabase
- [ ] `AWS_REGION` - Set in Vercel (if using S3)
- [ ] `AWS_S3_BUCKET` - Set in Vercel (if using S3)
- [ ] `SENTRY_DSN` - Set in Vercel (for error tracking)

---

## 🚨 **Security Notes**

### ✅ **Safe for Client-Side (Public)**
- `NEXT_PUBLIC_SUPABASE_URL` - Public Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key (RLS protected)

### 🔒 **Server-Side Only (Private)**
- `SUPABASE_SERVICE_ROLE_KEY` - Full database access
- `OPENAI_API_KEY` - Billing implications
- `HUGGINGFACE_API_TOKEN` - API usage costs
- `REPLICATE_API_TOKEN` - API usage costs
- All other API keys

### 🛡️ **Best Practices**
1. **Never commit API keys to code**
2. **Use different keys for development/production**
3. **Rotate keys regularly**
4. **Monitor API usage and costs**
5. **Set up billing alerts**

---

## 🔍 **How to Get Each API Key**

### OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Click "Create new secret key"
3. Copy the key (starts with `sk-`)

### Hugging Face Token
1. Go to [Hugging Face Settings](https://huggingface.co/settings/tokens)
2. Click "New token"
3. Select "Read" permissions
4. Copy the token (starts with `hf_`)

### Replicate API Token
1. Go to [Replicate Account](https://replicate.com/account/api-tokens)
2. Copy your default token (starts with `r8_`)

### Supabase Keys
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings > API**
4. Copy `URL` and `anon public` key
5. Copy `service_role secret` key (be careful with this one!)

---

## 🎬 **Next Steps**

1. **Gather all API keys** using the instructions above
2. **Set environment variables** in Vercel, GitHub, and Supabase
3. **Test deployment** with a preview deployment
4. **Verify all services** are working correctly
5. **Deploy to production**

---

*Generated: 2025-10-01*  
*Status: Ready for deployment*  
*All database tables created ✅*  
*All edge functions deployed ✅*  
*Mock data removed ✅*
