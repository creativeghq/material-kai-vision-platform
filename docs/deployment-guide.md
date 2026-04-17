# Deployment Guide

## 🔐 **Complete Secrets Reference**

**All secrets required for deployment across all platforms.**

### **Supabase Secrets**

| Secret Name | Type | Where Used | Description | Example/Format |
|------------|------|------------|-------------|----------------|
| `SUPABASE_URL` | Public | Frontend, Backend, Edge Functions | Supabase project URL | `https://bgbavxtjlbvgplozizxu.supabase.co` |
| `SUPABASE_ANON_KEY` | Public | Frontend, Backend | Public anonymous key for client-side | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Backend, Edge Functions | Service role key (admin access) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_JWT_SECRET` | **Secret** | Backend | JWT verification secret | `your-super-secret-jwt-secret-with-at-least-32-characters` |
| `SUPABASE_DB_PASSWORD` | **Secret** | Direct DB access (optional) | Database password | `your-secure-db-password` |

### **GitHub Secrets**

Set these in **GitHub repo > Settings > Secrets and variables > Actions**.

| Secret Name | Type | Used By Workflow | Description | Example/Format |
|------------|------|------------------|-------------|----------------|
| `SUPABASE_ACCESS_TOKEN` | **Secret** | `deploy.yml`, `update-supabase-types.yml` | Supabase CLI access token for deploying edge functions and generating types | `sbp_xxxxxxxxxxxxxxxx` |
| `SUPABASE_PROJECT_ID` | **Secret** | `deploy.yml`, `update-supabase-types.yml` | Supabase project reference ID | `bgbavxtjlbvgplozizxu` |
| `VERCEL_TOKEN` | **Secret** | `deploy.yml` | Vercel deployment token | `xxxxxxxxxxxxxxxxxxxxxxxxx` |
| `VERCEL_ORG_ID` | Public | `deploy.yml` | Vercel organization ID | `team_xxxxxxxxxxxxxxxx` |
| `VERCEL_PROJECT_ID` | Public | `deploy.yml` | Vercel project ID | `prj_xxxxxxxxxxxxxxxx` |
| `GH_TOKEN` | **Secret** | `ai-changelog-update.yml`, `deploy-docs.yml` | GitHub personal access token (cross-repo access) | `ghp_xxxxxxxxxxxxxxxxxxxx` |
| `OPENAI_API_KEY` | **Secret** | `ai-changelog-update.yml` | OpenAI API key for AI-powered changelog analysis | `sk-proj-xxxxxxxxxxxxxxxx` |
| `SSH_PRIVATE_KEY` | **Secret** | Backend deployment (manual/orchestrated) | SSH key for MIVAA server deployment | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_HOST` | Public | Backend deployment (manual/orchestrated) | Server hostname | `v1api.materialshub.gr` |
| `SSH_USER` | Public | Backend deployment (manual/orchestrated) | SSH username | `root` or `deploy` |

### **Vercel Environment Variables**

Set these in **Vercel > Project Settings > Environment Variables**. All `VITE_` prefixed vars are exposed to the frontend at build time via `import.meta.env.VITE_*`.

> **Important**: Variable names must match exactly as listed below (with `VITE_` prefix). The frontend code reads them via `import.meta.env.VITE_SUPABASE_URL`, not `import.meta.env.SUPABASE_URL`.

| Variable Name | Type | Environment | Description | Example/Format |
|------------|------|-------------|-------------|----------------|
| `VITE_SUPABASE_URL` | Public | Production, Preview | Supabase project URL | `https://bgbavxtjlbvgplozizxu.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public | Production, Preview | Supabase anonymous/publishable key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `VITE_MIVAA_API_URL` | Public | Production, Preview | MIVAA Python backend URL (PDF processing, AI metrics, images) | `https://v1api.materialshub.gr` |
| `VITE_MIVAA_SERVICE_URL` | Public | Production, Preview | MIVAA service URL (PDF upload progress) | `https://v1api.materialshub.gr` |
| `VITE_MIVAA_GATEWAY_URL` | Public | Production, Preview | MIVAA gateway URL (admin temp file cleanup) | `https://v1api.materialshub.gr` |
| `VITE_WS_URL` | Public | Production, Preview | WebSocket URL for real-time features | `wss://bgbavxtjlbvgplozizxu.supabase.co/realtime/v1` |
| `VITE_STRIPE_PRO_PRICE_ID` | Public | Production, Preview | Stripe price ID for Pro subscription | `price_...` |
| `VITE_STRIPE_ENTERPRISE_PRICE_ID` | Public | Production, Preview | Stripe price ID for Enterprise subscription | `price_...` |
| `VITE_MIVAA_API_KEY` | **Secret** | Production, Preview | MIVAA API authentication key for frontend requests | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `NODE_ENV` | Public | Production | Node environment | `production` |
| `VITE_DEBUG` | Public | Production, Preview | Debug mode | `false` (production), `true` (preview) |

> **Source**: These variables are type-defined in [`src/vite-env.d.ts`](../src/vite-env.d.ts) and consumed throughout `src/services/` and `src/components/`.

### **Backend/MIVAA Service Secrets**

| Secret Name | Type | Where Set | Description | Example/Format |
|------------|------|-----------|-------------|----------------|
| `SUPABASE_URL` | Public | Server ENV | Supabase project URL | `https://bgbavxtjlbvgplozizxu.supabase.co` |
| `SUPABASE_ANON_KEY` | Public | Server ENV | Supabase anonymous key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Server ENV | Service role key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `JWT_SECRET_KEY` | **Secret** | Server ENV | JWT signing secret | `your-super-secret-jwt-secret-with-at-least-32-characters` |
| `OPENAI_API_KEY` | **Secret** | Server ENV | OpenAI API key | `sk-proj-xxxxxxxxxxxxxxxx` |
| `ANTHROPIC_API_KEY` | **Secret** | Server ENV | Anthropic API key | `sk-ant-xxxxxxxxxxxxxxxx` |
| `VOYAGE_API_KEY` | **Secret** | Server ENV | Voyage AI API key for text embeddings | `pa-xxxxxxxxxxxxxxxx` |
| `QWEN_ENDPOINT_URL` | Public | Server ENV | Qwen HuggingFace endpoint URL | `https://gbz6krk3i2is85b0.us-east-1.aws.endpoints.huggingface.cloud` |
| `QWEN_ENDPOINT_TOKEN` | **Secret** | Server ENV | Qwen HuggingFace endpoint token | `hf_xxxxxxxxxxxxxxxx` |
| `QWEN_ENDPOINT_NAME` | Public | Server ENV | Qwen endpoint service name | `mh-qwen332binstruct` |
| `QWEN_NAMESPACE` | Public | Server ENV | Qwen endpoint namespace | `basiliskan` |
| `SLIG_ENDPOINT_URL` | Public | Server ENV | SLIG HuggingFace endpoint URL | `https://xxxxxxxx.us-east-1.aws.endpoints.huggingface.cloud` |
| `SLIG_ENDPOINT_TOKEN` | **Secret** | Server ENV | SLIG HuggingFace endpoint token | `hf_xxxxxxxxxxxxxxxx` |
| `SLIG_ENDPOINT_NAME` | Public | Server ENV | SLIG endpoint service name | `mh-siglip2` |
| `SLIG_NAMESPACE` | Public | Server ENV | SLIG endpoint namespace | `basiliskan` |
| `REPLICATE_API_TOKEN` | **Secret** | Server ENV | Replicate API token | `r8_xxxxxxxxxxxxxxxx` |
| `FIRECRAWL_API_KEY` | **Secret** | Server ENV | Firecrawl API key for price scraping | `fc-xxxxxxxxxxxxxxxx` |
| `GOOGLE_SHOPPING_API_KEY` | **Secret** | Server ENV | Google Shopping API key (optional) | `AIzaSyxxxxxxxxxxxxxxxx` |
| `GOOGLE_SHOPPING_CX` | **Secret** | Server ENV | Google Custom Search Engine ID (optional) | `xxxxxxxxxxxxxxxx` |
| `SENTRY_DSN` | **Secret** | Server ENV | Sentry error tracking DSN | `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx` |
| `CORS_ORIGINS` | Public | Server ENV | Allowed CORS origins | `https://your-domain.com,https://preview.vercel.app` |
| `ENVIRONMENT` | Public | Server ENV | Environment name | `production`, `staging`, `development` |
| `DEBUG` | Public | Server ENV | Debug mode | `false` (production), `true` (development) |
| `LOG_LEVEL` | Public | Server ENV | Logging level | `ERROR`, `WARNING`, `INFO`, `DEBUG` |
| `VISION_GUIDED_ENABLED` | Public | Server ENV | Enable Vision AI Layer 3 for image extraction | `false` (default), `true` |
| `VISION_GUIDED_PROVIDER` | Public | Server ENV | Vision AI provider (uses existing API keys) | `anthropic`, `openai`, `together` |
| `VISION_GUIDED_MODEL` | Public | Server ENV | Vision model for image analysis | `claude-sonnet-4-6-20260217`, `gpt-4o`, `Qwen/Qwen2-VL-72B-Instruct` |
| `VISION_GUIDED_CONFIDENCE_THRESHOLD` | Public | Server ENV | Minimum confidence for vision crops | `0.8` (default, range: 0.0-1.0) |
| `VISION_GUIDED_FALLBACK_TO_PYMUPDF` | Public | Server ENV | Fallback to PyMuPDF if Vision AI fails | `true` (default), `false` |
| `HF_TOKEN` | **Secret** | Server ENV | HuggingFace API token for Chandra OCR Inference Endpoint (with write permissions) | `hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `CHANDRA_ENDPOINT_URL` | Public | Server ENV | Chandra OCR Inference Endpoint URL | `https://kgvlceo5zrww8a6m.us-east-1.aws.endpoints.huggingface.cloud` |
| `CHANDRA_ENDPOINT_NAME` | Public | Server ENV | Chandra OCR Inference Endpoint name for pause/resume | `mh-chandra` (default) |
| `CHANDRA_NAMESPACE` | Public | Server ENV | HuggingFace namespace/username for endpoint management | `basiliskan` (default) |
| `CHANDRA_ENABLED` | Public | Server ENV | Enable Chandra OCR fallback when EasyOCR confidence is low | `true` (default), `false` |
| `CHANDRA_CONFIDENCE_THRESHOLD` | Public | Server ENV | EasyOCR confidence threshold - use Chandra if below this value | `0.7` (default, range: 0.0-1.0) |
| `CHANDRA_AUTO_PAUSE_TIMEOUT` | Public | Server ENV | Seconds of idle time before auto-pausing endpoint (prevents billing) | `60` (default) |
| `CHANDRA_MAX_RESUME_RETRIES` | Public | Server ENV | Maximum retry attempts for resuming endpoint | `3` (default) |
| `CHANDRA_RESUME_TIMEOUT` | Public | Server ENV | Timeout in seconds for endpoint resume operation | `300` (default, 5 minutes) |
| `CHANDRA_INFERENCE_TIMEOUT` | Public | Server ENV | Timeout in seconds for OCR inference calls | `30` (default) |
| `HUGGING_FACE_ACCESS_TOKEN` | **Secret** | Server ENV (GitHub Actions deploy) | HuggingFace token used by the backend deployment workflow — same value as `HF_TOKEN`, set in GitHub repo secrets | `hf_xxxxxxxxxxxxxxxx` |
| `REDIS_URL` | Public | Server ENV | Redis connection URL for embedding cache (optional — disables cache if not set) | `redis://localhost:6379` or `redis://your-redis-host:6379` |
| `ADMIN_RESTART_TOKEN` | **Secret** | Server ENV | Auth token for the `/api/admin/restart` endpoint — required to authenticate server restart requests from the agent | `your-secure-restart-token` |

### **YOLO DocParser Inference Endpoint**

| Secret Name | Type | Where Set | Description | Default |
|------------|------|-----------|-------------|---------|
| `YOLO_ENABLED` | Public | Server ENV | Enable YOLO document layout parser | `false` |
| `YOLO_ENDPOINT_URL` | Public | Server ENV | YOLO HuggingFace Inference Endpoint URL | *(required if YOLO_ENABLED=true)* |
| `YOLO_ENDPOINT_NAME` | Public | Server ENV | YOLO endpoint service name for pause/resume | *(required if YOLO_ENABLED=true)* |
| `YOLO_NAMESPACE` | Public | Server ENV | HuggingFace namespace for YOLO endpoint | `basiliskan` |
| `YOLO_CONFIDENCE_THRESHOLD` | Public | Server ENV | Minimum confidence for layout detection | `0.5` |
| `YOLO_AUTO_PAUSE_TIMEOUT` | Public | Server ENV | Seconds idle before auto-pausing endpoint | `60` |
| `YOLO_MAX_RESUME_RETRIES` | Public | Server ENV | Max retry attempts for resuming endpoint | `3` |
| `YOLO_RESUME_TIMEOUT` | Public | Server ENV | Timeout for resume operation (seconds) | `300` |
| `YOLO_INFERENCE_TIMEOUT` | Public | Server ENV | Timeout for inference calls (seconds) | `30` |
| `YOLO_WARMUP_TIMEOUT` | Public | Server ENV | Timeout for initial endpoint warmup (seconds) | `60` |

### **AI Service API Keys**

| Service | Secret Name | Where Used | How to Get | Pricing |
|---------|------------|------------|------------|---------|
| **OpenAI** | `OPENAI_API_KEY` | Backend, Edge Functions | https://platform.openai.com/api-keys | Pay-per-use |
| **Anthropic** | `ANTHROPIC_API_KEY` | Backend, Edge Functions | https://console.anthropic.com/ | Pay-per-use |
| **Google Gemini (AI SDK)** | `GOOGLE_GENERATIVE_AI_API_KEY` | Edge Functions (SEO, interior design, floor plan) | https://aistudio.google.com/apikey | Pay-per-use |
| **Google Imagen 3 (REST)** | `GEMINI_API_KEY` | Edge Functions (`generate-social-image`) | https://aistudio.google.com/apikey | Pay-per-use — same key, different env var name for REST API calls |
| **Voyage AI** | `VOYAGE_API_KEY` | Backend, Edge Functions | https://dash.voyageai.com/ → API Keys | Pay-per-use ($0.06/1M tokens) |
| **DataForSEO** | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | Edge Functions (SEO pipeline) | https://app.dataforseo.com/ → API Settings | Pay-per-task |
| **Replicate** | `REPLICATE_API_TOKEN` | Edge Functions (`generate-interior-gemini`) | https://replicate.com/account/api-tokens | Pay-per-use |
| **Replicate** | `REPLICATE_API_KEY` | Edge Functions (`generate-interior-video-v2`, `generate-social-image`, `generate-social-video`) | https://replicate.com/account/api-tokens | Same token as `REPLICATE_API_TOKEN` — set both to the same value |
| **xAI / Aurora** | `XAI_API_KEY` | Edge Functions (`generate-social-image`) | https://console.x.ai/ | Pay-per-use — for Aurora image generation |
| **Kling AI** | `KLINGAI_ACCESS_KEY` | Edge Functions (video generation via `_shared/ai-client.ts`) | https://platform.kling.ai/ → API Settings | Pay-per-use |
| **Kling AI** | `KLINGAI_SECRET_KEY` | Edge Functions (video generation via `_shared/ai-client.ts`) | https://platform.kling.ai/ → API Settings | Pay-per-use |
| **Later.com** | `LATE_API_KEY` | Edge Functions (`late-analytics`, `late-oauth`, `late-publish`, social background agents) | https://app.later.com/ → Settings → API | Social media scheduling |
| **Later.com** | `LATE_WEBHOOK_SECRET` | Edge Functions (`late-webhook-handler`) | Later.com webhook settings | HMAC-SHA256 signature verification |
| **HuggingFace** | `HF_TOKEN` | Backend (Chandra, YOLO endpoint management) | https://huggingface.co/settings/tokens — needs **write** permission | Inference Endpoints pause/resume — auto-pause enabled |
| **HuggingFace** | `QWEN_ENDPOINT_TOKEN`, `SLIG_ENDPOINT_TOKEN` | Backend | https://huggingface.co/settings/tokens | Can be same token as `HF_TOKEN` |
| **HuggingFace** | `HUGGING_FACE_ACCESS_TOKEN` | GitHub Actions (deploy workflow) | https://huggingface.co/settings/tokens | Set as GitHub repo secret — same value as `HF_TOKEN` |
| **HuggingFace** | `HUGGINGFACE_API_KEY` | Edge Functions (`health-check`) | https://huggingface.co/settings/tokens | Health status checks — same token, different name |

### **HuggingFace Inference Endpoints Configuration**

The platform uses HuggingFace Inference Endpoints for vision models and visual embeddings:

**Qwen3-VL-32B-Instruct Endpoint:**
- **URL**: `https://gbz6krk3i2is85b0.us-east-1.aws.endpoints.huggingface.cloud`
- **Service Name**: `mh-qwen332binstruct`
- **Namespace**: `basiliskan`
- **Auto-pause**: Enabled (pauses after 15 minutes of inactivity)

**SLIG (SigLIP2) Endpoint:**
- **URL**: `https://xxxxxxxx.us-east-1.aws.endpoints.huggingface.cloud`
- **Service Name**: `mh-siglip2`
- **Namespace**: `basiliskan`
- **Auto-pause**: Enabled (pauses after 15 minutes of inactivity)

**Required Environment Variables:** Set `QWEN_ENDPOINT_URL`, `QWEN_ENDPOINT_TOKEN`, `QWEN_ENDPOINT_NAME`, `QWEN_NAMESPACE`, `SLIG_ENDPOINT_URL`, `SLIG_ENDPOINT_TOKEN`, `SLIG_ENDPOINT_NAME`, and `SLIG_NAMESPACE` in the server environment.

**Benefits:**
- ✅ Auto-pause reduces costs during inactivity
- ✅ Dedicated GPU resources for consistent performance
- ✅ No rate limiting concerns
- ✅ Full control over model versions

---

### **Chandra OCR Inference Endpoint Configuration**

**Chandra OCR** is a high-accuracy OCR model deployed as a serverless HuggingFace Inference Endpoint. It provides GPU-accelerated OCR with automatic pause/resume for cost control.

#### **How It Works:**
1. **EasyOCR Primary**: Fast, local, free OCR (runs first)
2. **Chandra Fallback**: If EasyOCR confidence < 0.7, use Chandra endpoint (GPU, high accuracy)
3. **Auto Pause/Resume**: Endpoint automatically pauses when idle to prevent billing
4. **Cost Control**: ~$0.02 per 30-page document, $0/hour when paused

#### **Required Secrets:**

| Secret Name | Type | Default | Description |
|------------|------|---------|-------------|
| `HF_TOKEN` | **Secret** | *(required)* | HuggingFace API token with **write** permissions |
| `CHANDRA_ENDPOINT_URL` | Public | `https://kgvlceo5zrww8a6m.us-east-1.aws.endpoints.huggingface.cloud` | Chandra OCR Inference Endpoint URL |
| `CHANDRA_ENDPOINT_NAME` | Public | `mh-chandra` | Endpoint name for pause/resume operations |
| `CHANDRA_NAMESPACE` | Public | `basiliskan` | HuggingFace namespace/username |
| `CHANDRA_ENABLED` | Public | `true` | Enable/disable Chandra OCR fallback |
| `CHANDRA_CONFIDENCE_THRESHOLD` | Public | `0.7` | EasyOCR confidence threshold (0.0-1.0) |
| `CHANDRA_AUTO_PAUSE_TIMEOUT` | Public | `60` | Seconds before auto-pause (prevents billing) |
| `CHANDRA_MAX_RESUME_RETRIES` | Public | `3` | Max retry attempts for resuming endpoint |
| `CHANDRA_RESUME_TIMEOUT` | Public | `300` | Timeout for resume operation (seconds) |
| `CHANDRA_INFERENCE_TIMEOUT` | Public | `30` | Timeout for OCR inference calls (seconds) |

#### **Setup Instructions:**

1. **Get HuggingFace Token:**
   - Go to: https://huggingface.co/settings/tokens
   - Click "New token"
   - Name: "Chandra OCR Endpoint"
   - Type: **Write** (required for pause/resume)
   - Copy token (starts with `hf_...`)

2. **Create Inference Endpoint** (if not already created):
   - Go to: https://ui.endpoints.huggingface.co/
   - Click "New endpoint"
   - Model: `datalab-to/chandra`
   - Instance: GPU (e.g., `nvidia-a10g`)
   - Region: `us-east-1`
   - Name: `mh-chandra`
   - Click "Create"
   - Copy endpoint URL

3. **Configure Environment Variables:** Set `HF_TOKEN` (required) plus the optional Chandra variables (`CHANDRA_ENDPOINT_URL`, `CHANDRA_ENDPOINT_NAME`, `CHANDRA_NAMESPACE`, `CHANDRA_ENABLED`, `CHANDRA_CONFIDENCE_THRESHOLD`, `CHANDRA_AUTO_PAUSE_TIMEOUT`) in the server environment.

4. **Verify Endpoint Status:**
   - Endpoint should be **PAUSED** by default (no billing)
   - Will auto-resume when OCR is needed
   - Will auto-pause after 60 seconds of idle time

#### **Cost Estimation:**

| Scenario | Time | Cost |
|----------|------|------|
| **Endpoint paused** | N/A | **$0/hour** ✅ |
| **Endpoint running** | N/A | **~$0.60/hour** |
| **30-page scanned PDF** | ~110s | **~$0.02** |
| **100 documents/month** | N/A | **~$2/month** |

**Key:** Endpoint is paused 99% of the time = **NO BILLING** 🎉

#### **Billing Safety Features:**
- ✅ Auto-pause after 60 seconds idle
- ✅ Force-pause after batch processing
- ✅ Endpoint status monitoring
- ✅ Cost tracking per document
- ✅ Fallback to EasyOCR if endpoint fails

---

### **Messaging Service API Keys (SMS/WhatsApp)**

| Service | Secret Name | Where Used | How to Get | Required? |
|---------|------------|------------|------------|-----------|
| **Twilio** | `TWILIO_ACCOUNT_SID` | Supabase Edge Functions | https://console.twilio.com/ → Account SID | ✅ **Required** for messaging |
| **Twilio** | `TWILIO_AUTH_TOKEN` | Supabase Edge Functions | https://console.twilio.com/ → Auth Token | ✅ **Required** for messaging |

### **Price Monitoring API Keys**

| Service | Secret Name | Where Used | How to Get | Required? |
|---------|------------|------------|------------|-----------|
| **Firecrawl** | `FIRECRAWL_API_KEY` | Backend, Edge Functions | https://firecrawl.dev → Dashboard → API Keys | ✅ **Required** |
| **Google Shopping** | `GOOGLE_SHOPPING_API_KEY` | Backend | https://console.cloud.google.com → Enable Custom Search API | ⭕ Optional |
| **Google Shopping** | `GOOGLE_SHOPPING_CX` | Backend | https://programmablesearchengine.google.com → Create Search Engine | ⭕ Optional |

### **Supabase Edge Functions Secrets**

**Required for PDF Processing Agent and other Edge Functions**

#### **API Authentication Keys (New System)**

| Secret Name | Type | Where Set | Description | Example/Format |
|------------|------|-----------|-------------|----------------|
| `API_SECRET_KEY` | **Secret** | Supabase Dashboard | Secret key for server-to-server admin access | `sb_secret_xxxxxxxxxxxxxxxxxxxx` |
| `API_PUBLISHABLE_KEY` | **Secret** | Supabase Dashboard | Publishable key for client access | `sb_publishable_xxxxxxxxxxxxxxxxxxxx` |

> **Note:** These replace the legacy anon/service_role keys for external API access. Get them from Supabase Dashboard > Project Settings > API > API Keys.

#### **Core Secrets**

| Secret Name | Type | Used By Edge Functions | Description | Example/Format |
|------------|------|----------------------|-------------|----------------|
| `ANTHROPIC_API_KEY` | **Secret** | `agent-chat`, `ai-rerank`, `suggest-fields`, `xml-import-orchestrator` | Claude API key | `sk-ant-xxxxxxxxxxxxxxxx` |
| `FIRECRAWL_API_KEY` | **Secret** | `scrape-single-page`, `scrape-preview`, `suggest-fields`, `price-monitoring`, `agent-chat` | Firecrawl web scraping API | `fc-xxxxxxxxxxxxxxxx` |
| `STRIPE_SECRET_KEY` | **Secret** | `crm-stripe-api`, `stripe-checkout`, `stripe-customer-portal`, `stripe-webhooks` | Stripe secret key for payments | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | **Secret** | `stripe-webhooks` | Stripe webhook signing secret | `whsec_...` |
| `STRIPE_CREDITS_PRODUCT_ID` | **Secret** | `stripe-checkout` | Stripe product ID for credit purchases (single reusable product) | `prod_...` |
| `STRIPE_PRO_PRICE_ID` | Public | `stripe-webhooks` | Stripe price ID for Pro subscription | `price_...` |
| `STRIPE_ENTERPRISE_PRICE_ID` | Public | `stripe-webhooks` | Stripe price ID for Enterprise subscription | `price_...` |
| `MIVAA_GATEWAY_URL` | Public | `agent-chat`, `_shared/embedding-utils.ts` | MIVAA gateway URL (default: `https://v1api.materialshub.gr`) | `https://v1api.materialshub.gr` |
| `MIVAA_SERVICE_URL` | Public | `agent-chat`, `scrape-session-manager` | MIVAA service URL (default: `https://v1api.materialshub.gr`) | `https://v1api.materialshub.gr` |
| `MIVAA_LOCAL_URL` | Public | `mivaa-gateway` | Local MIVAA service URL used by the gateway proxy (default: `http://127.0.0.1:8000`) | `http://127.0.0.1:8000` |
| `MIVAA_API_KEY` | **Secret** | `scrape-session-manager`, `agent-chat`, `_shared/config.ts`, `_shared/embedding-utils.ts` | MIVAA API authentication | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `APP_URL` | Public | `crm-stripe-api` | Frontend app URL used for Stripe checkout redirect URLs | `https://app.materialkai.com` |
| `OPENAI_API_KEY` | **Secret** | `ai-rerank` and other edge functions | OpenAI API key (also needed in some edge functions, not just backend) | `sk-proj-xxxxxxxxxxxxxxxx` |
| `SENTRY_AUTH_TOKEN` | **Secret** | `_shared/sentry.ts` | Sentry API token for error queries | `sntrys_xxxxxxxxxxxxxxxx` |

#### **Email & Messaging Secrets**

| Secret Name | Type | Used By Edge Functions | Description | Example/Format |
|------------|------|----------------------|-------------|----------------|
| `RESEND_API_KEY` | **Secret** | `email-api` | Resend API key for email sending | `re_xxxxxxxxxxxxxxxxxxxxxxxx` |
| `RESEND_WEBHOOK_SECRET` | **Secret** | `email-webhooks` | Resend webhook signing secret (Svix, prefix `whsec_`) | `whsec_xxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_ACCOUNT_SID` | **Secret** | `messaging-processor`, `messaging-api` | Twilio Account SID for SMS/WhatsApp | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | **Secret** | `messaging-processor`, `messaging-api` | Twilio Auth Token for authentication | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

> **Migration note (2026-03-11):** Email provider migrated from Amazon SES to Resend. The following secrets have been removed: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_CONFIGURATION_SET_NAME`. Delete these from Supabase Edge Function secrets if they still exist.

> **Supabase Auth SMTP:** Configure in Dashboard → Authentication → Email → SMTP Settings: Host `smtp.resend.com`, Port `465`, Username `resend`, Password = `RESEND_API_KEY`.

#### **Agent Chat & AI Research Secrets**

| Secret Name | Type | Used By Edge Functions | Description | Example/Format |
|------------|------|----------------------|-------------|----------------|
| `APOLLO_API_KEY` | **Secret** | `agent-chat` | Apollo.io for company/contact enrichment + email finder fallback | `xxxxxxxxxxxxxxxxxxxxxxxx` |
| `HUNTER_API_KEY` | **Secret** | `agent-chat` | Hunter.io for domain search + person email finder | `xxxxxxxxxxxxxxxxxxxxxxxx` |
| `ZEROBOUNCE_API_KEY` | **Secret** | `agent-chat` | ZeroBounce for email validation (all discovered emails) | `xxxxxxxxxxxxxxxxxxxxxxxx` |

#### **SEO Article Pipeline**

| Secret Name | Type | Used By Edge Functions | Description | Example/Format |
|------------|------|----------------------|-------------|----------------|
| `DATAFORSEO_LOGIN` | **Secret** | `seo-research` | DataForSEO API login (email) for keyword research, SERP analysis, content analysis | `your@email.com` |
| `DATAFORSEO_PASSWORD` | **Secret** | `seo-research` | DataForSEO API password | `xxxxxxxxxxxxxxxx` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | **Secret** | `seo-plan`, `seo-analyze` | Google Gemini API key for article planning (structured output) and content analysis/auto-fix | `AIzaSyxxxxxxxxxxxxxxxx` |

> **Note:** The SEO pipeline also uses `ANTHROPIC_API_KEY` (already listed under Core Secrets above) for article writing via Claude Sonnet. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided to all edge functions.

**How to get these keys:**

| Service | How to Get | Pricing |
|---------|------------|---------|
| **DataForSEO** | https://app.dataforseo.com/ → API Settings | Pay-per-task (~$0.05-0.15 per keyword research) |
| **Google Gemini** | https://aistudio.google.com/apikey | Pay-per-use (Gemini 3 Flash Preview — $0.50/$3 per 1M tokens) |

**SEO Pipeline Credit Costs** (1 credit = $0.01, 50% markup on raw API cost):
- Research: 18 credits (DataForSEO: 5 API calls ~$0.117 raw)
- Planning: 2 credits (Gemini 3 Flash: ~3K in/3K out ~$0.01 raw)
- Writing: 20 credits (Claude Sonnet 4.5: ~4K in/8K out ~$0.13 raw)
- Analysis: 2 credits (Gemini 3 Flash: ~6K in/3K out ~$0.01 raw, GEO scoring is regex-free)
- Auto-fix: 5 credits per iteration (Gemini 3 Flash: ~10K in/8K out ~$0.03 raw)
- **Total per article: 42 credits (no fix) — 57 credits (max 3 fixes)**

#### **Video & Image Generation**

| Secret Name | Type | Used By Edge Functions | Description | Example/Format |
|------------|------|----------------------|-------------|----------------|
| `REPLICATE_API_TOKEN` | **Secret** | `generate-interior-gemini` | Replicate API token for image generation models | `r8_xxxxxxxxxxxxxxxx` |
| `REPLICATE_API_KEY` | **Secret** | `generate-interior-video-v2`, `generate-social-image`, `generate-social-video` | Replicate API key (same value as `REPLICATE_API_TOKEN` — set both identically) | `r8_xxxxxxxxxxxxxxxx` |
| `KLINGAI_ACCESS_KEY` | **Secret** | `_shared/ai-client.ts` (video generation) | Kling AI native SDK access key for kling-v3.0 video model | Obtained from https://platform.kling.ai/ |
| `KLINGAI_SECRET_KEY` | **Secret** | `_shared/ai-client.ts` (video generation) | Kling AI native SDK secret key | Obtained from https://platform.kling.ai/ |
| `XAI_API_KEY` | **Secret** | `generate-social-image` | xAI Aurora image generation API key | Obtained from https://console.x.ai/ |
| `GEMINI_API_KEY` | **Secret** | `generate-social-image` | Google Imagen 3 via REST API (`v1beta` endpoint) — same Google AI key as `GOOGLE_GENERATIVE_AI_API_KEY`, set both identically | `AIzaSyxxxxxxxxxxxxxxxx` |

> **Note on Replicate key naming**: `REPLICATE_API_TOKEN` and `REPLICATE_API_KEY` refer to the same Replicate account token. Different edge functions use different variable names due to historical reasons — set both to the same value.

#### **VR World Generation**

| Secret Name | Type | Used By Edge Functions | Description | Example/Format |
|------------|------|----------------------|-------------|----------------|
| `WORLDLABS_API_KEY` | **Secret** | `generate-vr-world` | WorldLabs Marble API key for 3D Gaussian Splat world generation | `wl_xxxxxxxxxxxxxxxx` |

#### **Social Media (Later.com)**

| Secret Name | Type | Used By Edge Functions | Description | Example/Format |
|------------|------|----------------------|-------------|----------------|
| `LATE_API_KEY` | **Secret** | `late-analytics`, `late-oauth`, `late-publish`, social background agents | Later.com API key for social media scheduling & analytics | Obtained from https://app.later.com/ → Settings → API |
| `LATE_WEBHOOK_SECRET` | **Secret** | `late-webhook-handler` | Later.com webhook signing secret for HMAC-SHA256 verification | Set in Later.com webhook configuration |

#### **HuggingFace (Edge Functions)**

| Secret Name | Type | Used By Edge Functions | Description | Example/Format |
|------------|------|----------------------|-------------|----------------|
| `HUGGINGFACE_API_KEY` | **Secret** | `health-check` | HuggingFace API token used to check endpoint health status | `hf_xxxxxxxxxxxxxxxx` — same token as backend `HF_TOKEN`, set both identically |

#### **Push Notifications (Web Push)**

| Secret Name | Type | Used By Edge Functions | Description | Example/Format |
|------------|------|----------------------|-------------|----------------|
| `VAPID_PUBLIC_KEY` | Public | `notification-dispatcher` | VAPID public key for web push | `BNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `VAPID_PRIVATE_KEY` | **Secret** | `notification-dispatcher` | VAPID private key for web push | `xxxxxxxxxxxxxxxxxxxxxxxx` |
| `VAPID_SUBJECT` | Public | `notification-dispatcher` | VAPID subject email (default: `mailto:admin@materialkai.com`) | `mailto:admin@materialkai.com` |

> **Generate VAPID keys**: Run `npx web-push generate-vapid-keys` to create a new key pair.

#### **Cron Jobs & Backend URLs**

| Secret Name | Type | Used By Edge Functions | Description | Example/Format |
|------------|------|----------------------|-------------|----------------|
| `CRON_SECRET` | **Secret** | `price-monitoring-cron` | Secret for authenticating cron job requests | `your-secure-cron-secret` |
| `PYTHON_BACKEND_URL` | Public | `price-monitoring-cron` | MIVAA Python backend URL | `https://v1api.materialshub.gr` |
| `PYTHON_API_URL` | Public | `xml-import-orchestrator` | Python API URL for XML imports (default: `https://v1api.materialshub.gr`) | `https://v1api.materialshub.gr` |

> **Note:** Default sender email and name are now configured through the Admin Panel at `/admin/email` → Email Settings, not as environment variables.

**How to Set Supabase Edge Function Secrets:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (KAI - `bgbavxtjlbvgplozizxu`)
3. Navigate to **Edge Functions** → **Settings** → **Secrets**
4. Add each secret with the exact name from the table above
5. Secrets are automatically available to all Edge Functions (no redeployment needed)

**PDF Processing Agent Features:**
- ✅ **Intelligent job recovery** - Checks for existing jobs before upload, resumes from checkpoints
- ✅ **Connection loss resilience** - Verifies job status even when API is down (falls back to database)
- ✅ **Duplicate prevention** - Never starts duplicate jobs for the same PDF
- ✅ **Automatic retry** on transient failures (1 retry for 5xx errors)
- ✅ **Stuck job detection** - Alerts if no progress for 5+ minutes
- ✅ **Comprehensive error diagnostics** with Sentry integration
- ✅ **Server health monitoring** via SSH (disk, memory, CPU)
- ✅ **Conversational progress updates** with real-time stage tracking and emojis
- ✅ **Self-healing suggestions** for common issues
- ✅ **Partial data recovery** - Identifies what was created before failure
- ✅ **Respects user's custom prompts** while auto-executing uploads

### **Optional Monitoring & Analytics Secrets**

| Secret Name | Type | Where Used | Description | Example/Format |
|------------|------|------------|-------------|----------------|
| `SENTRY_DSN` | **Secret** | Backend | Sentry error tracking | `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx` |
| `SENTRY_AUTH_TOKEN` | **Secret** | GitHub Actions, Supabase Edge Functions | Sentry release tracking & error queries | `sntrys_xxxxxxxxxxxxxxxx` |
| `GOOGLE_ANALYTICS_ID` | Public | Frontend | Google Analytics tracking | `G-XXXXXXXXXX` |
| `POSTHOG_API_KEY` | **Secret** | Frontend | PostHog analytics | `phc_xxxxxxxxxxxxxxxx` |

---

## 💳 Stripe Setup (Subscription & Credits System)

### **Step 1: Create Stripe Account & Products**

1. **Create Stripe Account**: https://dashboard.stripe.com/register
2. **Create Products** in Stripe Dashboard:

**Pro Subscription ($29/month):**
- Go to **Products** → **Add Product**
- Name: `Pro Subscription`
- Description: `1000 credits per month + unlimited access`
- Pricing: `$29.00 USD` / `Recurring` / `Monthly`
- Copy the **Price ID** (starts with `price_...`)

**Enterprise Subscription ($99/month):**
- Go to **Products** → **Add Product**
- Name: `Enterprise Subscription`
- Description: `5000 credits per month + priority support`
- Pricing: `$99.00 USD` / `Recurring` / `Monthly`
- Copy the **Price ID** (starts with `price_...`)

**Credit Packages (One-time purchases):**
- 100 Credits: `$10.00 USD` / `One-time`
- 600 Credits: `$50.00 USD` / `One-time`
- 1300 Credits: `$100.00 USD` / `One-time`

### **Step 2: Get Stripe API Keys**

1. Go to **Developers** → **API Keys**
2. Copy **Publishable key** (starts with `pk_test_...` or `pk_live_...`)
3. Copy **Secret key** (starts with `sk_test_...` or `sk_live_...`)

### **Step 3: Set Up Webhook**

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. **Endpoint URL**: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/stripe-webhooks`
4. **Events to send**: Select these events:
   - `customer.created`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `payment_intent.succeeded`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_...`)

### **Step 4: Configure Supabase Secrets**

**Go to:** https://supabase.com/dashboard/project/bgbavxtjlbvgplozizxu/settings/vault

Add these secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CREDITS_PRODUCT_ID`, `STRIPE_PRO_PRICE_ID`, and `STRIPE_ENTERPRISE_PRICE_ID`.

### **Step 5: Configure Vercel Environment Variables**

**Go to:** https://vercel.com/creativeghq/material-kai-vision-platform/settings/environment-variables

Add `VITE_STRIPE_PRO_PRICE_ID` and `VITE_STRIPE_ENTERPRISE_PRICE_ID` for ALL environments (Production, Preview, Development).

### **Step 6: Test the Integration**

1. **Test Subscription Flow**:
   - Go to `/profile` page
   - Click "Subscribe to Pro"
   - Use Stripe test card: `4242 4242 4242 4242`
   - Verify subscription created in Stripe Dashboard
   - Verify credits granted in database

2. **Test Credit Purchase**:
   - Go to `/profile` page
   - Click "Buy Credits"
   - Complete test purchase
   - Verify credits added to account

3. **Test Webhook Events**:
   - Go to Stripe Dashboard → **Developers** → **Webhooks**
   - Click on your webhook endpoint
   - View **Recent events** to verify events are being received

### **Stripe Test Cards**

| Card Number | Description |
|------------|-------------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0002` | Card declined |
| `4000 0000 0000 9995` | Insufficient funds |

**Expiry**: Any future date (e.g., `12/34`)
**CVC**: Any 3 digits (e.g., `123`)
**ZIP**: Any 5 digits (e.g., `12345`)

---

## 🚀 Deployment Architecture

The Material Kai Vision Platform uses a multi-service deployment strategy:

1. **Frontend**: Vercel (Static hosting + Edge functions)
2. **MIVAA Service**: Systemd service with UV (Self-hosted server)
3. **Database**: Supabase (Managed PostgreSQL)
4. **External APIs**: Third-party services (OpenAI, Anthropic, Voyage AI, HuggingFace, Replicate, WorldLabs)

## 🏗️ Infrastructure Overview

**Production Environment**: Vercel Frontend (Static + Edge) connects to MIVAA Service (Systemd + UV) and Supabase (Database + Auth). MIVAA Service also connects to External APIs (OpenAI, Anthropic, Voyage AI, HuggingFace).

**Development Environment**: Local Frontend (localhost:5173) connects to Local MIVAA (localhost:8000) and Supabase Cloud (Shared Instance). Local MIVAA also connects to the shared Supabase Cloud instance.

## 🔧 Environment Configuration

### Production Environment Variables

**Frontend variables** (set in Vercel Production Environment): `NODE_ENV=production`, `VITE_DEBUG=false`, the Supabase URL and anon key with `VITE_` prefix, the three MIVAA service URLs (`VITE_MIVAA_API_URL`, `VITE_MIVAA_SERVICE_URL`, `VITE_MIVAA_GATEWAY_URL`) all pointing to `https://v1api.materialshub.gr`, the WebSocket URL, and the two Stripe price IDs.

**MIVAA Service variables** (set in deployment platform): `ENVIRONMENT=production`, `DEBUG=false`, `LOG_LEVEL=ERROR`, `HOST=0.0.0.0`, `PORT=8000`, the Supabase URL and both keys, `JWT_SECRET_KEY`, `CORS_ORIGINS`, rate limit settings (`RATE_LIMIT_REQUESTS=50`, `RATE_LIMIT_WINDOW=60`), performance settings (`MAX_WORKERS=4`, `CACHE_TTL=3600`, `DATABASE_POOL_SIZE=20`), and monitoring settings (`SENTRY_DSN`, `LOG_FILE`).

## 📦 Frontend Deployment (Vercel)

### Vercel Configuration

**File**: `vercel.json` — configures the build command (`npm run build`), output directory (`dist`), framework (`vite`), and security headers. Static assets under `/assets/` get a one-year immutable cache. All routes get `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `X-XSS-Protection: 1; mode=block` headers.

### Deployment Steps

1. **Connect Repository**: Install the Vercel CLI (`npm install -g vercel`), log in with `vercel login`, and link the project with `vercel link`.

2. **Configure Environment Variables**: Use `vercel env add` to set each `VITE_` prefixed variable for the production environment, including `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MIVAA_API_URL`, `VITE_MIVAA_SERVICE_URL`, `VITE_MIVAA_GATEWAY_URL`, `VITE_WS_URL`, `VITE_STRIPE_PRO_PRICE_ID`, and `VITE_STRIPE_ENTERPRISE_PRICE_ID`.

3. **Deploy**: Run `vercel --prod` for a manual production deploy, or push to `main` to trigger automatic deployment via Git.

### Build Optimization

**Vite Configuration** (`vite.config.ts`): Uses `rollupOptions.output.manualChunks` to split the bundle into separate chunks for `vendor` (react, react-dom), `ui` (@radix-ui packages), `supabase` (@supabase/supabase-js), and `utils` (clsx, tailwind-merge, lucide-react). Also enables sourcemaps and sets `chunkSizeWarningLimit: 1000`.

## ⚙️ MIVAA Service Deployment (Systemd + UV)

### 🚀 Deployment Method

The MIVAA backend service is deployed using:
- **UV Package Manager**: Fast Python package installer and resolver
- **Systemd Service**: Linux service manager for process control
- **GitHub Actions**: Automated CI/CD pipeline
- **Direct File Deployment**: No containers, optimized for fast updates

### 🏥 Health Check & Monitoring Features

#### **Real-Time Health Monitoring**
- **HTTP Status Code Verification**: Tests actual endpoint responses (200, 502, 404, etc.)
- **Multiple Endpoint Testing**: Health, docs, redoc, and OpenAPI schema endpoints
- **Response Time Monitoring**: Tracks endpoint response times and availability
- **Retry Logic**: Multiple attempts with intelligent backoff

#### **Automatic Diagnostics**
When health checks fail, the system automatically:
- **System Resource Analysis**: CPU, memory, disk usage, and load averages
- **Service Status Investigation**: systemd service status and configuration
- **Network Diagnostics**: Port availability, process binding, and network interfaces
- **Application Log Analysis**: Recent logs, error logs, and service history
- **Environment Verification**: Python environment, dependencies, and application structure

#### **Auto-Recovery Features**
- **Automatic Service Restart**: Attempts to restart failed services
- **Post-Restart Verification**: Re-tests endpoints after recovery attempts
- **Recovery Status Reporting**: Clear indication of recovery success or failure
- **Escalation Path**: Provides manual intervention steps when auto-recovery fails

### 🌐 Service Endpoints

All MIVAA service endpoints are available at:
- **Base URL**: `https://v1api.materialshub.gr`
- **Health Check**: `https://v1api.materialshub.gr/health`
- **API Documentation**: `https://v1api.materialshub.gr/docs`
- **ReDoc**: `https://v1api.materialshub.gr/redoc`
- **OpenAPI Schema**: `https://v1api.materialshub.gr/openapi.json`
- **PDF Processing**: `https://v1api.materialshub.gr/api/v1/pdf/*`
- **AI Analysis**: `https://v1api.materialshub.gr/api/v1/ai/*`
- **Vector Search**: `https://v1api.materialshub.gr/api/v1/search/*`

### 📋 Systemd Service Configuration

**Service File**: `/etc/systemd/system/mivaa-pdf-extractor.service`

The service is a `simple` type running as `root` with `WorkingDirectory=/var/www/mivaa-pdf-extractor`. It sets all environment variables inline (Supabase URL and keys, JWT secret, OpenAI and Anthropic API keys, Voyage AI key, Qwen and SLIG endpoint URLs, tokens, names, and namespaces). The `ExecStart` command launches uvicorn from the virtual environment at `.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000`. The service uses `Restart=always` with a 3-second restart delay, and logs to the systemd journal.

### 🚀 Deployment Process

#### **Automated Deployment (GitHub Actions)**

The deployment is fully automated via GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. **Code Push**: Push to `main` branch triggers deployment
2. **SSH Connection**: Connects to production server (165.227.31.109)
3. **Code Update**: Pulls latest code from GitHub
4. **Dependency Installation**: Uses UV to install/update dependencies
5. **Service Update**: Updates systemd service file with latest environment variables
6. **Service Restart**: Restarts the mivaa-pdf-extractor service
7. **Health Check**: Verifies all endpoints are responding correctly
8. **Auto-Recovery**: Automatically restarts service if health checks fail

#### **Manual Deployment**

If you need to deploy manually, SSH into the server, navigate to `/var/www/mivaa-pdf-extractor`, pull the latest code with `git pull origin main`, install dependencies with `uv pip install -r requirements.txt`, restart the service with `sudo systemctl restart mivaa-pdf-extractor`, check its status with `sudo systemctl status mivaa-pdf-extractor`, and tail logs with `sudo journalctl -u mivaa-pdf-extractor -f`.

### 🔧 Server Setup (One-Time)

**Initial Server Configuration**: Update system packages with `sudo apt update && sudo apt upgrade -y`. Install Python 3.11 and pip. Install UV with `curl -LsSf https://astral.sh/uv/install.sh | sh`. Clone the repository to `/var/www/`, create a virtual environment with `python3.11 -m venv .venv`, install dependencies with `uv pip install -r requirements.txt`, create the systemd service file at `/etc/systemd/system/mivaa-pdf-extractor.service`, then run `sudo systemctl daemon-reload`, `sudo systemctl enable mivaa-pdf-extractor`, and `sudo systemctl start mivaa-pdf-extractor` to enable and start the service.

## 🤖 GitHub Actions Deployment Workflows

### 🚀 Default Deployment Workflow

**File**: `.github/workflows/deploy.yml`

**Features**:
- **Automatic Triggers**: Push to `main` or `production` branches
- **Manual Triggers**: workflow_dispatch with optional deployment reason
- **Comprehensive Overview**: Pre-deployment system architecture and process breakdown
- **Real-Time Health Checks**: Tests actual service endpoints with HTTP status verification
- **Automatic Diagnostics**: System analysis when health checks fail
- **Auto-Recovery**: Service restart attempts with verification
- **GitHub Summary**: Detailed deployment results on action summary page

**Usage**: Trigger automatically by pushing to `main`. For manual runs, go to GitHub Actions → "MIVAA Deployment (Default)" → Run workflow.

### 🚀 Orchestrated Deployment Workflow

**File**: `.github/workflows/orchestrated-deployment.yml`

**Features**:
- **On-Demand Only**: Manual trigger via workflow_dispatch
- **Multi-Phase Pipeline**: 5-phase deployment with validation gates
- **Configurable Options**:
  - **Deployment Mode**: fast-track, intelligent, comprehensive
  - **Skip Diagnostics**: For faster deployments
  - **Target Branch**: main, production
  - **Deployment Reason**: Custom description for audit trail
- **Advanced Verification**: Comprehensive endpoint testing and system validation
- **Enhanced Diagnostics**: Detailed system analysis and recovery attempts
- **Complete Audit Trail**: Full deployment journey with metrics and status

**Usage**: Go to GitHub Actions → "Orchestrated MIVAA Deployment Pipeline (On-Demand)", configure the deployment mode (e.g., "intelligent"), target branch, and deployment reason, then run.

### 🏥 Health Check Features

Both workflows include comprehensive health monitoring:

#### **Endpoint Testing**
The following endpoints are tested: `https://v1api.materialshub.gr/health`, `/docs`, `/redoc`, and `/openapi.json`.

#### **Status Code Verification**
- **200**: ✅ Service healthy and responding correctly
- **502**: ❌ Bad Gateway - Service not responding
- **404**: ❌ Not Found - Endpoint not available
- **500**: ❌ Internal Server Error - Application error
- **000**: ❌ Connection failed - Service not reachable

#### **Automatic Diagnostics on Failure**
When health checks fail, the system collects: server uptime and load averages, memory and disk usage, service status (`systemctl status mivaa-pdf-extractor`), recent service logs (last 50 lines), network status (port 8000 availability), process binding verification, service restart attempt, and post-restart verification.

#### **GitHub Action Summary**
All deployment results are displayed on the main GitHub Action page with:
- **Deployment Overview**: Architecture, components, and process steps
- **Health Check Results**: Real-time endpoint status with HTTP codes
- **Service Endpoints**: Clickable links to all available endpoints
- **Troubleshooting**: Commands and steps for manual intervention
- **Quick Actions**: Direct links to health check, docs, and service endpoints

### 📋 Deployment Overview Features

#### **Pre-Deployment Information**
- **Deployment Configuration**: Environment, target server, branch, commit details
- **Application Architecture**: Runtime (Python 3.9, pyenv, uv), dependencies, process management
- **Key Components**: PDF processing, AI/ML models, database, authentication
- **Environment Variables**: Verification of all required secrets and configurations (15+ variables)
- **Deployment Process**: 8-step breakdown of the deployment pipeline
- **Expected Outcomes**: Clear expectations for deployment results
- **Summary Table**: All key information displayed on the main action page

#### **Post-Deployment Summary**
- **Deployment Status**: Success/failure with timestamps and duration
- **Service Information**: Server details, service status, process management
- **Health Check Results**: Real-time endpoint testing with HTTP status codes
- **API Endpoints**: Complete list of available endpoints with clickable URLs
- **Verification Checklist**: Confirmation of all deployment steps
- **Automatic Diagnostics**: Comprehensive system analysis when health checks fail
- **Auto-Recovery**: Automatic service restart and re-testing on failures
- **Troubleshooting Guide**: Quick access to logs, status commands, and common fixes
- **Next Steps**: Recommended actions after deployment
- **Results Table**: Deployment results and service status on the main action page

#### **Deployment Process Steps**
1. **🔄 Code Checkout**: Latest code from target branch
2. **🐍 Environment Setup**: Python 3.9, pyenv, uv package manager
3. **📦 Dependency Installation**: Requirements and system packages
4. **🔧 Service Configuration**: systemd service setup and configuration
5. **🚀 Service Deployment**: Service restart and process management
6. **🏥 Health Verification**: Real-time endpoint testing with diagnostics
7. **📊 Summary Generation**: Comprehensive results on GitHub Action page
8. **✅ Completion**: Final status and next steps

#### **System Architecture Overview**
- **Runtime**: Python 3.9+ with pyenv version management
- **Package Manager**: uv (ultrafast Python package installer)
- **Process Management**: systemd service (mivaa-pdf-extractor.service)
- **Web Framework**: FastAPI with Uvicorn ASGI server
- **Database**: Supabase PostgreSQL with vector extensions
- **AI Integration**: OpenAI, Anthropic, Voyage AI, HuggingFace Inference Endpoints
- **Visual Embeddings**: SLIG (SigLIP2) via HuggingFace Endpoint (768D)
- **Vision Models**: Qwen3-VL-32B-Instruct via HuggingFace Endpoint
- **Monitoring**: Sentry error tracking and structured logging
- **Security**: JWT authentication and environment-based secrets

### 🔧 Workflow Configuration

#### **Required Secrets by Workflow**

**`deploy.yml`** (Frontend & Supabase Functions deployment): requires `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.

**`ai-changelog-update.yml`** (AI-powered changelog on PR merge): requires `GH_TOKEN` and `OPENAI_API_KEY`.

**`deploy-docs.yml`** (Deploy docs to GitHub Pages): requires `GH_TOKEN` (same as above, needs cross-repo access).

**`update-supabase-types.yml`** (Auto-generate TypeScript types): requires `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID`.

**Backend Server Deployment** (manual SSH or orchestrated): requires `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, plus all application environment variables including Supabase credentials, JWT secret, AI API keys, and HuggingFace endpoint configuration.

#### **Deployment Process**
1. **Code Checkout**: Latest code from target branch
2. **Environment Setup**: Python 3.9, pyenv, uv package manager
3. **Dependency Installation**: Requirements and system packages
4. **Service Deployment**: systemd service configuration and restart
5. **Health Verification**: Real-time endpoint testing with diagnostics
6. **Summary Generation**: Comprehensive results on GitHub Action page

## 🗄️ Database Deployment (Supabase)

### Supabase Setup

1. **Create Project**:
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Note project URL and keys

2. **Configure Database**: Enable required extensions via the SQL Editor — `uuid-ossp`, `vector`, and `ltree`.

3. **Set Up Authentication**: Configure JWT settings in the Supabase dashboard, set up email templates, and configure OAuth providers if needed.

4. **Deploy Schema**: Initialize and push migrations using the Supabase CLI (`supabase migration new initial_schema` and `supabase db push`).

### Database Security

**Row Level Security (RLS)**: Enable RLS on all tables with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Create workspace-scoped policies using `auth.uid()` and a lookup into `user_workspaces` to ensure users can only access data belonging to their own workspace.

## 🔐 Security Configuration

### SSL/TLS Setup

**Nginx Configuration** (`nginx.conf`): Configure an HTTP-to-HTTPS redirect on port 80, and the main server block on port 443 with SSL (certificate + key, TLSv1.2/1.3, strong cipher suites). The `location /` block proxies requests to `http://mivaa-service:8000` with the standard `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers.

### Firewall Configuration

Use UFW to set default deny for incoming, default allow for outgoing, then explicitly allow SSH, port 80/tcp, and port 443/tcp before enabling the firewall.

## 📊 Monitoring & Logging

### Application Monitoring

**Health Check Endpoints**: Test the frontend health at `https://your-domain.com/api/health`, the MIVAA service at `https://your-mivaa-service.com/health`, and the database health at `https://your-mivaa-service.com/api/v1/health`.

### Logging Configuration

**Structured Logging** (`mivaa-pdf-extractor/app/utils/logging.py`): Uses `structlog` to produce structured log entries. Log calls include key-value context such as `document_id`, `processing_time`, and `user_id` alongside the log message.

### Error Tracking

**Sentry Integration**: The frontend initializes Sentry with the DSN from `process.env.VITE_SENTRY_DSN`, the current `NODE_ENV`, a `tracesSampleRate` of `1.0`, and a `Replay` integration with `maskAllText` and `blockAllMedia` enabled.

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

**File**: `.github/workflows/deploy.yml` — a workflow named "Deploy to Production" triggered on push to `main`. It runs a `test` job (checkout, Node setup, `npm ci`, `npm test`, `npm run build`) and two deployment jobs that depend on `test`: `deploy-frontend` (using the Vercel GitHub Action with prod flag) and `deploy-backend` (using the SSH action to pull the latest code, install dependencies with UV, and restart the systemd service).

### ⚠️ GitHub Actions Security Notes

1. **Token Naming**: GitHub doesn't allow environment variables starting with `GITHUB_` prefix
   - ✅ **Correct**: `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
   - ❌ **Wrong**: `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`

2. **SSH Key Security**: Always use SSH keys stored in GitHub Secrets for server access

## 🚨 Deployment Issues & Solutions

### Common Issues

1. **Missing Environment Variables**:
   - **Problem**: Service fails to start due to missing environment variables
   - **Solution**: Ensure all required environment variables are set in systemd service file:
     - SUPABASE_URL
     - SUPABASE_SERVICE_KEY
     - OPENAI_API_KEY
     - ANTHROPIC_API_KEY
     - VOYAGE_API_KEY (for text embeddings)
     - QWEN_ENDPOINT_URL (for vision models)
     - QWEN_ENDPOINT_TOKEN (for vision models)
     - SLIG_ENDPOINT_URL (for visual embeddings)
     - SLIG_ENDPOINT_TOKEN (for visual embeddings)
     - FIRECRAWL_API_KEY (for price monitoring)
     - GOOGLE_SHOPPING_API_KEY (optional)
     - GOOGLE_SHOPPING_CX (optional)

2. **Environment Variable Mismatch**:
   - **Problem**: Different env vars between environments
   - **Solution**: Configure environment-specific variables in Vercel (Production/Preview/Development)

3. **CORS Errors**:
   - **Problem**: Frontend can't connect to backend
   - **Solution**: Configure CORS_ORIGINS properly in backend environment

4. **Database Connection Issues**:
   - **Problem**: Can't connect to Supabase
   - **Solution**: Verify connection strings and firewall rules

5. **SSL Certificate Issues**:
   - **Problem**: HTTPS not working
   - **Solution**: Use Let's Encrypt or proper SSL certificates

### Visual Embeddings Configuration

#### **Remote GPU-Accelerated Embeddings (Optional)**

Enable Hugging Face Inference API for 15x faster visual embeddings by adding the following to the systemd service: `VISUAL_EMBEDDING_MODE=remote`, `HUGGINGFACE_API_KEY` (your HF token), `HUGGINGFACE_SIGLIP_MODEL=google/siglip2-so400m-patch14-384`, `HUGGINGFACE_BATCH_SIZE=10`, `HUGGINGFACE_TIMEOUT=60`, and optionally `VISUAL_EMBEDDING_PRIMARY_MODEL=google/siglip2-so400m-patch14-384` to upgrade the local model to SigLIP v2.

**Benefits:**
- ✅ GPU-accelerated: ~15x faster (12-17s → <1s per image)
- ✅ Batch processing: Up to 10 images per request
- ✅ Automatic fallback to local if API fails
- ✅ Cost-effective: ~$0.0001 per image (~$2/month for typical usage)

**Get API Key:**
1. Go to https://huggingface.co/settings/tokens
2. Create new token (Read access)
3. Copy token (starts with `hf_...`)

**Deployment:** Edit the service file (`sudo nano /etc/systemd/system/mivaa-pdf-extractor.service`), add the environment variables, then run `sudo systemctl daemon-reload` and `sudo systemctl restart mivaa-pdf-extractor`. Verify by checking logs for "Visual embedding mode: REMOTE (Hugging Face API)".

**See:** `mivaa-pdf-extractor/HUGGINGFACE_DEPLOYMENT.md` for detailed guide

### Rollback Strategy

To roll back the MIVAA service: SSH into the server at `root@165.227.31.109`, navigate to `/var/www/mivaa-pdf-extractor`, find the desired previous commit hash with `git log --oneline -n 5`, check out that commit with `git checkout <previous-commit-hash>`, restart the service with `sudo systemctl restart mivaa-pdf-extractor`, and verify with `sudo systemctl status mivaa-pdf-extractor` and `curl https://v1api.materialshub.gr/health`.

## 📋 Deployment Checklist

### Pre-Deployment
- All tests passing
- Environment variables configured in GitHub Secrets
- Systemd service file updated with latest environment variables
- SSL certificates ready
- Database migrations prepared
- Backup strategy in place

### Deployment
- Frontend deployed to Vercel
- Backend deployed to production server
- Database schema updated
- Health checks passing
- SSL/HTTPS working

### Post-Deployment
- Monitor application logs
- Verify all endpoints working
- Check performance metrics
- Validate security headers
- Test critical workflows

## 💾 Backup & Disaster Recovery

### Automated Backup Strategy

**Database Backups** (Supabase): Supabase provides automatic daily backups accessible from the Supabase Dashboard → Settings → Backups. Point-in-time recovery (PITR) is available for 7 days and can be restored via the dashboard or API.

**Application Data Backups**: An automated backup script runs daily via cron and is located at `/usr/local/bin/backup-mivaa.sh`. Backups are stored at `/backups/mivaa_backup_YYYYMMDD_HHMMSS.tar.gz` and the last 7 backups are retained automatically.

### Disaster Recovery Procedures

**Database Recovery**:
1. Go to Supabase Dashboard → Settings → Backups
2. Select desired backup point
3. Click "Restore" and confirm
4. Verify data integrity after restore

**Application Recovery**: Restore from backup by extracting the tar.gz archive from `/backups/` into `/app/`, then restart the service with `systemctl restart mivaa-pdf-extractor`.

---

## 🗄️ Database Migrations & Schema Management

### Migration Strategy

**Using Supabase Migrations**: Create new migrations with `supabase migration new <name>`, apply them with `supabase db push`, and roll back with `supabase db reset`.

**Zero-Downtime Deployments**:
1. Add new columns as nullable
2. Deploy code that handles both old and new columns
3. Backfill data in background job
4. Remove old columns in subsequent deployment

### Extension Management

**Required PostgreSQL Extensions**: Enable in Supabase Dashboard → SQL Editor — `uuid-ossp`, `vector`, and `ltree`.

---

## 🔄 Job Recovery & Signal Handling

### Job Persistence

The platform implements automatic job recovery for PDF processing:

**Job States**:
- `pending` - Waiting to start
- `processing` - Currently running
- `completed` - Successfully finished
- `failed` - Processing failed
- `cancelled` - User cancelled

**Recovery on Restart**: On service startup, the system automatically resumes jobs that were in `processing` state and retries failed jobs up to `max_retries`.

**Graceful Shutdown**: When the service receives SIGTERM, it completes current in-flight operations, persists job state to the database, and exits cleanly. A 30-second grace period is allowed before SIGKILL.

---

## 📊 Performance Optimization & Scaling

### Horizontal Scaling

**MIVAA Service Scaling**: For horizontal scaling, copy the systemd service file to create instances on ports 8001 and 8002 (editing the `ExecStart` port in each copy), then start all three services. Use nginx as a load balancer with an `upstream mivaa_backend` block pointing to `localhost:8000`, `localhost:8001`, and `localhost:8002`, with a `location /` block that `proxy_pass`es to `http://mivaa_backend`.

### Database Connection Pooling

**Supabase Connection Pool**: Set `DATABASE_POOL_SIZE=20` and `DATABASE_POOL_TIMEOUT=30` in the MIVAA service environment.

### Caching Strategy

**Application-Level Caching**: Configure caching with `enabled: true`, `ttl: 3600000` (1 hour), `maxSize: 1000` items, and `strategy: 'lru'` (Least Recently Used).

---

## 🚨 Monitoring & Alerting

### Metrics Collection

**Key Metrics to Monitor**:
- Request latency (p50, p95, p99)
- Error rate (5xx, 4xx responses)
- Database query performance
- Memory usage
- CPU utilization
- Job processing time

**Sentry Configuration**: Initialize Sentry on the frontend with the DSN, current environment, `tracesSampleRate: 1.0`, and a Replay integration with `maskAllText: true` and `blockAllMedia: true`.

### Alert Thresholds

Configure alerts for: `errorRate: 0.05` (5% error rate), `responseTime: 2000` (2 seconds), `memoryUsage: 0.7` (70% memory), and `cpuUsage: 0.8` (80% CPU).

---

## 🔐 Security Hardening

### API Rate Limiting

Set `RATE_LIMIT_REQUESTS=50` and `RATE_LIMIT_WINDOW=60` (per minute) in the MIVAA service environment.

### Security Headers

Configure nginx to add: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, and `Content-Security-Policy: default-src 'self'`.

### Secrets Rotation

**Rotation Schedule**:
- JWT Secret: Every 90 days
- API Keys: Every 180 days
- Database Password: Every 90 days

**Rotation Process**:
1. Generate new secret
2. Update in secret manager
3. Deploy with new secret
4. Verify functionality
5. Revoke old secret

---

## 🌐 Edge Functions Deployment

### Supabase Edge Functions

**Deploy Function**: Create new functions with `supabase functions new my-function` and deploy them with `supabase functions deploy my-function --project-ref bgbavxtjlbvgplozizxu`.

**Environment Variables**: Set secrets via the Supabase Dashboard → Edge Functions → Secrets, or use `supabase secrets set JWT_SECRET_KEY=your_secret` from the CLI.

---

## 💼 Operation Management & Services Billing

This section covers all third-party services used by the platform, their pricing plans, and billing management guidelines. Use this as the single reference for operational cost tracking.

---

### 📧 Resend (Email Service)

**Role**: Transactional and marketing email delivery — replaced Amazon SES as of 2026-03-11.

**Dashboard**: https://resend.com/overview
**Billing**: https://resend.com/billing
**Pricing Page**: https://resend.com/pricing

#### Plans

| Plan | Price | Emails/month | Domains | API Keys | Support |
|------|-------|-------------|---------|----------|---------|
| **Free** | $0/month | 3,000 | 1 | 1 | Community |
| **Pro** | From $20/month | 50,000 | Unlimited | Unlimited | Email |
| **Scale** | From $90/month | 300,000 | Unlimited | Unlimited | Priority Email |
| **Enterprise** | Custom | Custom | Unlimited | Unlimited | Dedicated support |

#### Pro Plan — Volume Pricing

| Emails/month | Price |
|-------------|-------|
| Up to 50,000 | $20/month |
| Up to 100,000 | $35/month |
| Up to 200,000 | $60/month |
| Up to 500,000 | $125/month |
| Up to 1,000,000 | $200/month |

#### Key Features by Plan

- **Free**: 3,000 emails/month, 100 emails/day, 1 domain, basic API
- **Pro**: Unlimited domains, webhooks, open/click tracking, suppression lists, scheduled sends, batch API
- **Scale**: All Pro features + dedicated IPs (on request), SLA
- **Enterprise**: All Scale features + custom volume, dedicated account manager, custom contracts

#### What We Use

| Feature | Used For |
|---------|----------|
| REST API (`POST /emails`) | Transactional emails (invitations, notifications, quotes, campaigns) |
| Webhooks (Svix-signed) | Delivery tracking → `email_logs` table (delivered, bounced, complained, opened, clicked) |
| SMTP relay (`smtp.resend.com:465`) | Supabase Auth emails (magic links, confirmations, password reset) |
| Domain verification | Sender domain setup in Resend dashboard |

#### Secrets Required

| Secret | Location | Description |
|--------|----------|-------------|
| `RESEND_API_KEY` | Supabase Edge Function Secrets | API key for sending emails (prefix `re_`) |
| `RESEND_WEBHOOK_SECRET` | Supabase Edge Function Secrets | Svix webhook signing secret (prefix `whsec_`) |

#### Billing Tips

- **Free plan** is sufficient for development and low-volume production (< 3,000 emails/month)
- Upgrade to **Pro** when exceeding 3,000 emails/month or needing webhooks + tracking
- Monitor usage in the Resend dashboard → Emails section; set up billing alerts at 80% of plan limit
- Webhooks are required for delivery tracking — **Pro plan minimum** for production environments with reporting

---

### 💳 Stripe (Payments & Subscriptions)

**Role**: Subscription management, one-time credit purchases, and payment processing.

**Dashboard**: https://dashboard.stripe.com
**Billing**: Stripe charges a percentage per transaction — no monthly platform fee.

#### Pricing

| Transaction Type | Fee |
|----------------|-----|
| Card payments (domestic) | 2.9% + $0.30 per transaction |
| Card payments (international) | 3.9% + $0.30 per transaction |
| Recurring subscriptions | 2.9% + $0.30 per payment |
| Dispute/chargeback fee | $15 per dispute |

#### What We Use

| Feature | Used For |
|---------|----------|
| Subscription billing | Pro ($29/month) and Enterprise ($99/month) plans |
| One-time payments | Credit pack purchases (100/600/1300 credits) |
| Customer portal | Self-service subscription management |
| Webhooks | `stripe-webhooks` edge function — updates subscription/credit state in DB |

---

### 🤖 Anthropic (Claude AI)

**Role**: Core AI model for KAI agent, SEO article writing, B2B research, and various AI pipelines.

**Dashboard**: https://console.anthropic.com
**Pricing**: https://www.anthropic.com/pricing

#### Key Models & Pricing

| Model | Input | Output | Used For |
|-------|-------|--------|---------|
| Claude Sonnet 4.6 | $3/M tokens | $15/M tokens | KAI agent, SEO writing |
| Claude Haiku 4.5 | $0.80/M tokens | $4/M tokens | Demo agent, B2B web search |
| Claude Opus 4.6 | $15/M tokens | $75/M tokens | Complex reasoning (on demand) |

---

### 🧠 OpenAI

**Role**: AI changelog generation and product discovery. (updated 2026-04 — production text embeddings use Voyage AI, see below. OpenAI text-embedding-3-small is only retained for the legacy CI changelog workflow.)

**Dashboard**: https://platform.openai.com
**Pricing**: https://openai.com/pricing

| Model | Price | Used For |
|-------|-------|---------|
| text-embedding-3-small | $0.02/M tokens | CI changelog workflow only (legacy) |
| GPT-4o | $2.50/$10/M tokens | AI changelog analysis |

---

### 🌊 Voyage AI

**Role**: High-quality text embeddings (1024D) for semantic search across all product and document content.

**Dashboard**: https://dash.voyageai.com
**Pricing**: https://www.voyageai.com/pricing

| Model | Price | Used For |
|-------|-------|---------|
| voyage-3-large | $0.18/M tokens | Understanding embeddings (1024D) |

---

### 🗄️ Supabase (Database + Auth + Edge Functions)

**Role**: Primary database, authentication, real-time subscriptions, and serverless edge functions.

**Dashboard**: https://supabase.com/dashboard
**Pricing**: https://supabase.com/pricing

#### Plans

| Plan | Price | DB Size | Edge Function Invocations | Bandwidth |
|------|-------|---------|--------------------------|-----------|
| **Free** | $0/month | 500 MB | 500K/month | 5 GB |
| **Pro** | $25/month | 8 GB | 2M/month | 250 GB |
| **Team** | $599/month | Unlimited | Unlimited | Unlimited |

#### Add-ons (Pro plan)

| Add-on | Price |
|--------|-------|
| Additional DB storage | $0.125/GB/month |
| Additional edge function invocations | $2 per 1M |
| Additional bandwidth | $0.09/GB |
| Point-in-time recovery (PITR) | $100/month |

---

### ☁️ Vercel (Frontend Hosting)

**Role**: Frontend hosting, edge network, and preview deployments.

**Dashboard**: https://vercel.com
**Pricing**: https://vercel.com/pricing

#### Plans

| Plan | Price | Bandwidth | Build minutes |
|------|-------|-----------|---------------|
| **Hobby** | $0/month | 100 GB | 6,000 min/month |
| **Pro** | $20/month per member | 1 TB | 24,000 min/month |
| **Enterprise** | Custom | Custom | Custom |

---

### 🔥 Firecrawl (Web Scraping)

**Role**: Website scraping for price monitoring and product data extraction.

**Dashboard**: https://firecrawl.dev
**Pricing**: https://firecrawl.dev/pricing

| Plan | Price | Credits/month |
|------|-------|--------------|
| **Free** | $0 | 500 |
| **Starter** | $16/month | 3,000 |
| **Standard** | $83/month | 100,000 |
| **Growth** | $333/month | 500,000 |

---

### 🤗 HuggingFace Inference Endpoints

**Role**: GPU-accelerated vision models (Qwen3-VL, SigLIP2) and Chandra OCR.

**Dashboard**: https://ui.endpoints.huggingface.co
**Pricing**: https://huggingface.co/pricing

| Endpoint | Instance | Rate | Auto-pause |
|----------|----------|------|-----------|
| Qwen3-VL-32B (Qwen analysis) | GPU (A100) | ~$3-5/hour | Yes (15 min idle) |
| SigLIP2 (SLIG visual embeddings) | GPU (A10G) | ~$1-2/hour | Yes (15 min idle) |
| Chandra OCR | GPU (A10G) | ~$0.60/hour | Yes (60 sec idle) |

**Cost control**: All endpoints use auto-pause — billed only when active. Typical monthly cost: $5–$20 depending on PDF processing volume.

---

### 📊 DataForSEO

**Role**: Keyword research, SERP analysis, and content analysis for the SEO article pipeline.

**Dashboard**: https://app.dataforseo.com
**Pricing**: Pay-per-task (~$0.05–0.15 per keyword research task)

---

### 📱 Twilio (SMS/WhatsApp)

**Role**: SMS and WhatsApp messaging for platform notifications.

**Dashboard**: https://console.twilio.com
**Pricing**: Pay-per-message

| Channel | Price |
|---------|-------|
| SMS (outbound, US) | ~$0.0079/message |
| WhatsApp (template) | ~$0.005/message |

---

### 🌍 WorldLabs Marble (VR World Generation)

**Role**: Generates 3D Gaussian Splat worlds from product images for VR/AR preview features.

**Dashboard**: https://worldlabs.ai
**Pricing**: Credit-based

| World Quality | Credits | Time |
|--------------|---------|------|
| Mini | 50 credits | ~30–45 seconds |
| Plus | 200 credits | ~5 minutes |

Credits are refunded on generation failure.

---

### 📈 Monthly Cost Estimate (Typical Production)

| Service | Estimated Monthly Cost | Notes |
|---------|----------------------|-------|
| **Resend** | $20–$35 | Pro plan, ~50K–100K emails |
| **Stripe** | 2.9% + $0.30/tx | Transaction-based |
| **Anthropic** | $50–$200 | Depends on AI usage volume |
| **OpenAI** | $5–$20 | Embeddings + changelog |
| **Voyage AI** | $5–$30 | Embedding volume |
| **Supabase** | $25–$75 | Pro + storage add-ons |
| **Vercel** | $20/member | Pro plan |
| **HuggingFace** | $5–$20 | Auto-paused endpoints |
| **Firecrawl** | $16–$83 | Depends on scraping volume |
| **DataForSEO** | $10–$50 | Depends on SEO pipeline usage |
| **Twilio** | $5–$30 | Depends on messaging volume |
| **WorldLabs** | Variable | Per-credit, on-demand |
| **Total (est.)** | **~$160–$600/month** | Scales with usage |

> **Cost optimization tips:**
> - HuggingFace endpoints are auto-paused — ensure `auto_pause_timeout` is set correctly for all endpoints
> - Resend Free plan covers 3,000 emails/month; upgrade to Pro only when needed
> - Monitor Anthropic token usage in the console — KAI agent is the largest consumer
> - Supabase PITR ($100/month) is optional but recommended for production data safety

---

## 🧨 Platform Reset (admin destructive operation)

The "Reset Platform" admin action wipes the platform back to a clean install state while preserving accounts, billing, prompts, knowledge base, and CRM. Use this for staging/QA resets — **never** in production except as a last-resort recovery.

**UI**: `/admin` → "Reset Platform" (admin/owner only, requires typed confirmation)
**Edge function**: `supabase/functions/reset-platform/index.ts`
**RPC helper**: `trim_prompt_history(keep_n)`

### What gets wiped

The function clears every table that holds derived/AI-produced/cached data, in FK-safe order. The list is the source of truth in `TABLES_TO_CLEAR`. Categories include: agent chat history, document/PDF processing artefacts, embeddings rows on `document_images` / `products` / `document_vectors`, image variants, generated 3D/VR worlds, virtual-staging outputs, manufacturer analytics, search analytics, audit logs, and the entire VECS image embedding collections (`image_slig_embeddings`, `image_color/texture/style/material_embeddings`, `image_understanding_embeddings`).

Storage buckets cleared: `pdf-extracted-images`, `generated-images`, `vr-worlds`, `staging-outputs`, etc. (anything the platform produces; `quote-templates`, `profile-avatars`, and `pdf-documents` are preserved).

### What is preserved

- `profiles`, `auth.users`, `workspaces`, `workspace_members` — accounts
- `user_credits`, `credit_transactions`, `credit_packages` — billing
- `prompts`, `extraction_prompts` — AI configuration
- `prompt_history` — **trimmed** to the 5 most recent rows per `prompt_id` (audit trail kept, bloat dropped)
- `kb_docs`, `kb_categories`, `kb_doc_attachments`, `kb_search_analytics` — Knowledge Base
- `crm_companies`, `crm_contacts`, `crm_contact_relationships`, `crm_company_contacts` — CRM
- `flows`, `background_agents`, `roles`, `role_permissions`, `ai_model_pricing`, `subscription_plans`, `webhook_endpoints` — admin config
- `system_settings`, `upsells`, `timeline_steps` — global config
- Storage: `quote-templates`, `profile-avatars`, `pdf-documents`

### Steps the function performs

1. Truncate every table in `TABLES_TO_CLEAR` (FK-safe order)
2. Empty the listed storage buckets
3. Drop and recreate every VECS image embedding collection
4. Trim `prompt_history` via `trim_prompt_history(5)` RPC
5. **Wipe MIVAA server `/tmp` folder** by calling `POST {MIVAA_GATEWAY_URL}/api/system/cleanup-temp-files?max_age_hours=0&dry_run=false` (uses `MIVAA_API_KEY` for auth) — clears any orphan PDF extraction work directories left on the Python backend

The response summary reports: rows deleted, tables affected, storage files removed, VECS embeddings dropped, prompt_history rows trimmed, and MIVAA `/tmp` cleanup status (incl. MB freed).

### Required env vars

| Var | Purpose |
|-----|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | DB + storage wipe |
| `MIVAA_GATEWAY_URL` | MIVAA `/tmp` cleanup endpoint (defaults to `https://v1api.materialshub.gr`) |
| `MIVAA_API_KEY` | Bearer token for the MIVAA cleanup call (call is skipped silently if missing) |

### Safety

- Confirmation modal with typed phrase before invocation
- Function logs every step; partial failures (e.g. one table errors out) are reported in the summary but the function continues
- Idempotent — running it twice on a clean platform is a no-op

---

## 🔗 Related Documentation

- [Setup & Configuration](./setup-configuration.md) - Environment setup
- [Security & Authentication](./security-authentication.md) - Security configuration
- [Testing Strategy](./testing-strategy.md) - Pre-deployment testing
- [Troubleshooting](./troubleshooting.md) - Issue resolution
- [Job Recovery & Signal Handling](../mivaa-pdf-extractor/docs/JOB-RECOVERY-AND-SIGNAL-HANDLING.md) - Job persistence
