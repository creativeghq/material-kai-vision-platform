# Setup & Configuration Guide

## 🚀 Quick Start

### Prerequisites

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **Python**: >= 3.9 (for MIVAA microservice)
- **Git**: Latest version
- **Supabase Account**: For database and authentication

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/creativeghq/material-kai-vision-platform.git
   cd material-kai-vision-platform
   ```

2. **Install Dependencies**:
   ```bash
   # Frontend dependencies
   npm install
   
   # MIVAA microservice dependencies
   cd mivaa-pdf-extractor
   pip install -r requirements.txt
   cd ..
   ```

3. **Environment Setup**:
   - Configure environment variables in GitHub Secrets, Supabase Dashboard, and Vercel
   - **NEVER use .env files** - all secrets are managed through platform secret managers

## 🔧 Environment Variables

### 🗝️ Complete Secret Keys Reference Table

#### Core Platform Secrets

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **Supabase Project URL** | Supabase Dashboard, Vercel, GitHub | `SUPABASE_URL` | Database connection | Auto-generated when creating Supabase project |
| **Supabase Anon Key** | Supabase Dashboard, Vercel, GitHub | `SUPABASE_ANON_KEY` | Client-side database access | Copy from Supabase API settings |
| **Supabase Service Role Key** | Supabase Edge Functions, GitHub | `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access | Copy from Supabase API settings (⚠️ Keep secret) |
| **Supabase Project ID** | GitHub Secrets | `SUPABASE_PROJECT_ID` | Project reference for deployments | Found in Supabase Dashboard URL or config.toml |
| **Supabase Access Token** | GitHub Secrets | `SUPABASE_ACCESS_TOKEN` | CLI authentication for deployments | Generate in Supabase Dashboard → Settings → Access Tokens |
| **Supabase DB Password** | GitHub Secrets | `SUPABASE_DB_PASSWORD` | Direct database access | Set during Supabase project creation |

#### Authentication & Security

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **JWT Secret Key** | Supabase Edge Functions, GitHub, MIVAA | `JWT_SECRET_KEY` | Token signing/verification | Generate: `openssl rand -hex 32` |
| **JWT Algorithm** | MIVAA Deployment | `JWT_ALGORITHM` | JWT signing algorithm | Default: `HS256` |
| **JWT Issuer** | MIVAA Deployment | `JWT_ISSUER` | JWT token issuer | Default: `material-kai-platform` |
| **JWT Audience** | MIVAA Deployment | `JWT_AUDIENCE` | JWT token audience | Default: `mivaa-pdf-extractor` |
| **Encryption Key** | GitHub Secrets, MIVAA | `ENCRYPTION_KEY` | Data encryption at rest | Generate: `openssl rand -hex 32` |

#### Material Kai Platform API

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **Material Kai API Key** | Vercel, Supabase Edge Functions, MIVAA | `MATERIAL_KAI_API_KEY` or `VITE_MATERIAL_KAI_API_KEY` | Internal API authentication | Generate: `mk_api_2024_$(openssl rand -hex 32)` |
| **Material Kai API URL** | Vercel, GitHub, MIVAA | `MATERIAL_KAI_API_URL` or `MATERIAL_KAI_PLATFORM_URL` | Platform API endpoint | Production URL or localhost for dev |
| **Material Kai Workspace ID** | MIVAA Deployment | `MATERIAL_KAI_WORKSPACE_ID` | Workspace identifier | From platform database |
| **Material Kai Client ID** | GitHub Secrets | `MATERIAL_KAI_CLIENT_ID` | OAuth client identifier | Generate in platform admin |
| **Material Kai Client Secret** | GitHub Secrets | `MATERIAL_KAI_CLIENT_SECRET` | OAuth client secret | Generate in platform admin |
| **Material Kai Webhook Secret** | GitHub Secrets | `MATERIAL_KAI_WEBHOOK_SECRET` | Webhook signature verification | Generate: `openssl rand -hex 32` |

#### MIVAA Integration

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **MIVAA Gateway URL** | Vercel, Supabase Edge Functions | `MIVAA_GATEWAY_URL` | MIVAA service endpoint | `https://v1api.materialshub.gr` |
| **MIVAA API Key** | Vercel, Supabase Edge Functions | `MIVAA_API_KEY` | MIVAA authentication | JWT token from Supabase function |
| **MIVAA Docs Enabled** | MIVAA Deployment | `DOCS_ENABLED` | Enable Swagger UI documentation | Default: `true` |
| **MIVAA ReDoc Enabled** | MIVAA Deployment | `REDOC_ENABLED` | Enable ReDoc documentation | Default: `true` |

#### AI/ML Service API Keys

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **OpenAI API Key** | Vercel, Supabase Edge Functions, GitHub, MIVAA | `OPENAI_API_KEY` or `VITE_OPENAI_API_KEY` | GPT models, embeddings, vision | Create at platform.openai.com/api-keys |
| **OpenAI Organization ID** | MIVAA Deployment | `OPENAI_ORG_ID` | Organization billing tracking | Optional, from OpenAI settings |
| **OpenAI Project ID** | MIVAA Deployment | `OPENAI_PROJECT_ID` | Project-level tracking | Optional, from OpenAI settings |
| **Anthropic API Key** | GitHub Secrets, MIVAA | `ANTHROPIC_API_KEY` | Claude models | Create at console.anthropic.com |
| **HuggingFace API Token** | Vercel, GitHub, MIVAA | `HUGGINGFACE_API_KEY` or `HUGGINGFACE_API_TOKEN` | HF models, 3D generation | Create at huggingface.co/settings/tokens |
| **HuggingFace Access Token** | MIVAA Deployment | `HUGGING_FACE_ACCESS_TOKEN` | Alternative HF token variable | Same as HUGGINGFACE_API_TOKEN |
| **Replicate API Token** | Vercel, GitHub, MIVAA | `REPLICATE_API_TOKEN` or `REPLICATE_API_KEY` | 3D generation models | Create at replicate.com/account/api-tokens |
| **TogetherAI API Key** | GitHub Secrets, MIVAA | `TOGETHER_API_KEY` | LLaMA 4 Scout Vision (69.4% MMMU, #1 OCR) | Create at api.together.xyz/settings/api-keys |
| **Jina API Key** | MIVAA Deployment | `JINA_API_KEY` | Jina embeddings/reranking | Create at jina.ai |
| **Firecrawl API Key** | MIVAA Deployment | `FIRECRAWL_API_KEY` | Web scraping service | Create at firecrawl.dev |

#### Vercel Deployment

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **Vercel Token** | GitHub Secrets | `VERCEL_TOKEN` | Deployment automation | Create in Vercel Dashboard → Settings → Tokens |
| **Vercel Org ID** | GitHub Secrets | `VERCEL_ORG_ID` | Organization identifier | Found in Vercel project settings |
| **Vercel Project ID** | GitHub Secrets | `VERCEL_PROJECT_ID` | Project identifier | Found in Vercel project settings |
| **Vercel Deploy Hook** | Optional | `VERCEL_DEPLOY_HOOK` | Webhook for triggering deploys | Create in Vercel project settings |

#### GitHub Actions & CI/CD

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **GitHub Token** | Auto-provided, GitHub Secrets | `GITHUB_TOKEN` | Repository access for CI/CD | Auto-provided by GitHub Actions |
| **GitHub Container Registry Token** | GitHub Secrets, Deployment Scripts | `GH_TOKEN` | Docker image authentication | Use `${{ secrets.GITHUB_TOKEN }}` (⚠️ **NEVER** use `GITHUB_TOKEN` as env var name) |
| **GitHub Repository** | MIVAA Deployment | `GITHUB_REPOSITORY` | Container registry path | Format: `owner/repo` |
| **Deploy Host** | GitHub Secrets | `DEPLOY_HOST` | Server IP/hostname for deployment | Your server address |
| **Deploy User** | GitHub Secrets | `DEPLOY_USER` | SSH username | Server username (e.g., `root`) |
| **Deploy SSH Key** | GitHub Secrets | `DEPLOY_SSH_KEY` | SSH private key for deployment | Generate: `ssh-keygen -t ed25519` |

> **⚠️ CRITICAL**: GitHub doesn't allow environment variables starting with `GITHUB_` prefix. Always use `GH_TOKEN` instead of `GITHUB_TOKEN` when passing the token as an environment variable in workflows and deployments.

#### Monitoring & Error Tracking

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **Sentry DSN** | Vercel, GitHub, MIVAA | `SENTRY_DSN` | Error tracking endpoint | Copy from Sentry project settings |
| **Sentry Auth Token** | GitHub Secrets | `SENTRY_AUTH_TOKEN` | Sentry API authentication | Create in Sentry settings |
| **Sentry Organization** | GitHub Secrets | `SENTRY_ORG` | Sentry organization slug | From Sentry settings |
| **Sentry Project** | GitHub Secrets | `SENTRY_PROJECT` | Sentry project slug | From Sentry project settings |
| **LogRocket App ID** | Vercel | `LOGROCKET_APP_ID` | Session replay tracking | From LogRocket dashboard |

#### Additional Infrastructure (Optional)

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **Redis URL** | Optional | `REDIS_URL` or `CACHE_REDIS_URL` | Caching service | Redis connection string |
| **Database URL** | MIVAA Deployment | `DATABASE_URL` | Direct database connection | PostgreSQL connection string |

> **Note:** All file storage is handled by **Supabase Storage** (buckets: `material-images`, `pdf-documents`). AWS S3 is not required or used.

#### SSL & Domain Configuration (Optional)

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **Domain Name** | GitHub Secrets | `DOMAIN_NAME` | Custom domain for MIVAA | Your domain (e.g., `api.example.com`) |
| **Admin Email** | GitHub Secrets | `ADMIN_EMAIL` | SSL certificate contact | Your email for Let's Encrypt |

### 🔐 Security Configuration Locations

| Platform | Configuration Location | What to Add |
|----------|----------------------|-------------|
| **Supabase Dashboard** | Settings → Auth | JWT secret, CORS origins, redirect URLs |
| **Supabase Edge Functions** | CLI: `supabase secrets set KEY_NAME value` | `MIVAA_GATEWAY_URL`, `MIVAA_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Vercel** | Project → Settings → Environment Variables | All `VITE_*` and `NEXT_PUBLIC_*` variables, Supabase keys, API keys |
| **GitHub Secrets** | Repository → Settings → Secrets and variables → Actions | All deployment secrets, CI/CD tokens, API keys for workflows |
| **MIVAA Deployment** | Server environment or Docker secrets | All MIVAA-specific variables, AI API keys, database credentials |

### ⚠️ Critical Security Notes

1. **NEVER use .env files** - All secrets managed through GitHub, Vercel, and Supabase
2. **GitHub Token Naming** - Never use environment variables starting with `GITHUB_` prefix (use `GH_TOKEN` instead of `GITHUB_TOKEN`)
3. **Rotate exposed keys immediately** - If any key is accidentally committed
4. **Use different keys for different environments** - Development vs Production
5. **Limit key permissions** - Only grant necessary permissions
6. **Monitor key usage** - Set up alerts for unusual activity

### Required Environment Variables

**⚠️ IMPORTANT: We DO NOT use .env files. All environment variables are managed through:**
- **GitHub Secrets** (for CI/CD)
- **Vercel Environment Variables** (for frontend deployment)
- **Supabase Edge Functions Secrets** (for backend functions)

## ✅ GitHub Secrets
**Location**: Repository → Settings → Secrets and variables → Actions

### Required for Deployment
- [ ] `SUPABASE_PROJECT_ID` - Supabase project reference
- [ ] `SUPABASE_ACCESS_TOKEN` - Supabase CLI authentication
- [ ] `VERCEL_TOKEN` - Vercel deployment automation
- [ ] `VERCEL_ORG_ID` - Vercel organization ID
- [ ] `VERCEL_PROJECT_ID` - Vercel project ID

### Required for MIVAA Deployment
- [ ] `DEPLOY_HOST` - Server IP/hostname
- [ ] `DEPLOY_USER` - SSH username
- [ ] `DEPLOY_SSH_KEY` - SSH private key
- [ ] `SUPABASE_URL` - Supabase project URL (⚠️ **Must be available on server**)
- [ ] `SUPABASE_ANON_KEY` - Supabase anon key (⚠️ **Must be available on server**)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- [ ] `JWT_SECRET_KEY` - JWT signing secret
- [ ] `ENCRYPTION_KEY` - Data encryption key

### AI/ML API Keys
- [ ] `OPENAI_API_KEY` - OpenAI API access (⚠️ **Must be available on server**)
- [ ] `ANTHROPIC_API_KEY` - Anthropic Claude access
- [ ] `HUGGINGFACE_API_KEY` - HuggingFace models
- [ ] `REPLICATE_API_TOKEN` - Replicate 3D models
- [ ] `TOGETHER_API_KEY` - TogetherAI LLaMA 4 Scout Vision

### Material Kai Platform
- [ ] `MATERIAL_KAI_API_KEY` - Platform API key (⚠️ **Must be available on server**)
- [ ] `MATERIAL_KAI_API_URL` - Platform API endpoint (⚠️ **Must be available on server**)
- [ ] `MATERIAL_KAI_CLIENT_ID` - OAuth client ID
- [ ] `MATERIAL_KAI_CLIENT_SECRET` - OAuth client secret
- [ ] `MATERIAL_KAI_WEBHOOK_SECRET` - Webhook verification

### Monitoring (Optional)
- [ ] `SENTRY_DSN` - Sentry error tracking (⚠️ **Must be available on server**)
- [ ] `SENTRY_AUTH_TOKEN` - Sentry API token
- [ ] `SENTRY_ORG` - Sentry organization
- [ ] `SENTRY_PROJECT` - Sentry project

### SSL/Domain (Optional)
- [ ] `DOMAIN_NAME` - Custom domain
- [ ] `ADMIN_EMAIL` - SSL certificate email

---

## ✅ Vercel Environment Variables
**Location**: Project → Settings → Environment Variables

### Core Configuration
- [ ] `SUPABASE_URL` - Supabase project URL
- [ ] `SUPABASE_ANON_KEY` - Supabase anon key
- [ ] `NODE_ENV` - Environment (production/development)

### MIVAA Integration
- [ ] `MIVAA_GATEWAY_URL` - MIVAA service endpoint
- [ ] `MIVAA_API_KEY` - MIVAA authentication
- [ ] `VITE_MIVAA_SERVICE_URL` - Frontend MIVAA URL

### Material Kai Platform
- [ ] `VITE_MATERIAL_KAI_API_KEY` - Platform API key
- [ ] `VITE_MATERIAL_KAI_API_URL` - Platform API URL

### AI/ML Services (Frontend)
- [ ] `VITE_OPENAI_API_KEY` - OpenAI API key
- [ ] `VITE_HUGGINGFACE_API_KEY` - HuggingFace token
- [ ] `VITE_REPLICATE_API_TOKEN` - Replicate token

### Optional Services
- [ ] `SENTRY_DSN` - Error tracking
- [ ] `LOGROCKET_APP_ID` - Session replay

---

## ✅ Supabase Edge Functions Secrets
**Location**: CLI command `supabase secrets set KEY_NAME value`

### Required Secrets
```bash
# MIVAA Integration
supabase secrets set MIVAA_GATEWAY_URL "https://your-mivaa-url.com"
supabase secrets set MIVAA_API_KEY "your-mivaa-api-key"

# Database Access
supabase secrets set SUPABASE_SERVICE_ROLE_KEY "your-service-role-key"

# AI Services
supabase secrets set OPENAI_API_KEY "your-openai-key"
```

### Checklist
- [ ] `MIVAA_GATEWAY_URL` - MIVAA service endpoint
- [ ] `MIVAA_API_KEY` - MIVAA authentication
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Admin database access
- [ ] `OPENAI_API_KEY` - OpenAI embeddings/chat

### Optional Secrets
- [ ] `USE_MIVAA_EMBEDDINGS` - Enable MIVAA embeddings (default: true)
- [ ] `USE_MIVAA_CHAT` - Enable MIVAA chat (default: true)
- [ ] `PDF_PROCESSING_TIMEOUT` - Timeout in ms (default: 300000)
- [ ] `RATE_LIMIT_HEALTH_CHECK` - Health check rate limit (default: 60)
- [ ] `RATE_LIMIT_PDF_EXTRACT` - PDF extract rate limit (default: 10)
- [ ] `RATE_LIMIT_BATCH_PROCESS` - Batch process rate limit (default: 5)

---

## ✅ MIVAA Deployment Environment
**Location**: Server environment variables or Docker secrets

### Core Application
- [ ] `ENVIRONMENT` - Environment name (production/staging/development)
- [ ] `DEBUG` - Debug mode (false for production)
- [ ] `LOG_LEVEL` - Logging level (ERROR/INFO/DEBUG)
- [ ] `HOST` - Server host (0.0.0.0)
- [ ] `PORT` - Server port (8000)

### Database
- [ ] `SUPABASE_URL` - Supabase project URL
- [ ] `SUPABASE_ANON_KEY` - Supabase anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- [ ] `DATABASE_URL` - Direct PostgreSQL connection (optional)

### Authentication
- [ ] `JWT_SECRET_KEY` - JWT signing secret
- [ ] `JWT_ALGORITHM` - JWT algorithm (HS256)
- [ ] `JWT_ISSUER` - JWT issuer (material-kai-platform)
- [ ] `JWT_AUDIENCE` - JWT audience (mivaa-pdf-extractor)

### AI/ML Services
- [ ] `OPENAI_API_KEY` - OpenAI API key
- [ ] `OPENAI_ORG_ID` - OpenAI organization (optional)
- [ ] `OPENAI_PROJECT_ID` - OpenAI project (optional)
- [ ] `ANTHROPIC_API_KEY` - Anthropic API key (optional)
- [ ] `HUGGINGFACE_API_TOKEN` - HuggingFace token
- [ ] `HUGGING_FACE_ACCESS_TOKEN` - Alternative HF token
- [ ] `REPLICATE_API_KEY` - Replicate API key (optional)
- [ ] `TOGETHER_API_KEY` - TogetherAI API key (optional)
- [ ] `JINA_API_KEY` - Jina API key (optional)
- [ ] `FIRECRAWL_API_KEY` - Firecrawl API key (optional)

### Material Kai Platform
- [ ] `MATERIAL_KAI_API_URL` - Platform API URL (⚠️ **Required for Docker deployment**)
- [ ] `MATERIAL_KAI_API_KEY` - Platform API key (⚠️ **Required for Docker deployment**)
- [ ] `MATERIAL_KAI_WORKSPACE_ID` - Workspace ID (optional)

### Security
- [ ] `ENCRYPTION_KEY` - Data encryption key
- [ ] `CORS_ORIGINS` - Allowed CORS origins
- [ ] `RATE_LIMIT_PER_MINUTE` - Rate limit (default: 60)

### Monitoring
- [ ] `SENTRY_DSN` - Sentry error tracking (⚠️ **Required for Docker deployment**)
- [ ] `SENTRY_ENVIRONMENT` - Sentry environment name

### Performance (Optional)
- [ ] `MAX_WORKERS` - Worker processes (default: 4)
- [ ] `CACHE_TTL` - Cache TTL in seconds (default: 3600)
- [ ] `DATABASE_POOL_SIZE` - DB pool size (default: 10)

### Documentation
- [ ] `DOCS_ENABLED` - Enable Swagger UI documentation (default: true)
- [ ] `REDOC_ENABLED` - Enable ReDoc documentation (default: true)

### 🐳 Docker Deployment - Required Environment Variables

**⚠️ CRITICAL**: These environment variables are **REQUIRED** for Docker deployment and must be available on the deployment server. The docker-compose.yml file expects these exact variable names:

#### Core Required Variables (Must be set on server)
- [ ] `SUPABASE_URL` - Supabase project URL
- [ ] `SUPABASE_ANON_KEY` - Supabase anon key
- [ ] `OPENAI_API_KEY` - OpenAI API key
- [ ] `MATERIAL_KAI_API_URL` - Material Kai platform API URL
- [ ] `MATERIAL_KAI_API_KEY` - Material Kai platform API key
- [ ] `SENTRY_DSN` - Sentry error tracking DSN

#### How to Set on Deployment Server
```bash
# Option 1: Export in deployment script
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export OPENAI_API_KEY="your-openai-key"
export MATERIAL_KAI_API_URL="https://your-platform-url.com"
export MATERIAL_KAI_API_KEY="your-api-key"
export SENTRY_DSN="your-sentry-dsn"

# Option 2: Add to server environment file
echo 'export SUPABASE_URL="https://your-project.supabase.co"' >> ~/.bashrc
echo 'export SUPABASE_ANON_KEY="your-anon-key"' >> ~/.bashrc
# ... etc for all variables
source ~/.bashrc
```

> **Note**: These variables must be available in the shell environment where `docker-compose up` is executed. If any are missing, Docker will show warnings and the application may not function correctly.

---

## ✅ Supabase Dashboard Configuration
**Location**: Supabase Dashboard → Settings

### Authentication Settings
- [ ] JWT Secret configured in Auth settings
- [ ] CORS origins configured
- [ ] Redirect URLs configured
- [ ] Email templates customized (optional)

### API Settings
- [ ] Anon key copied
- [ ] Service role key copied (keep secure!)
- [ ] Project URL noted

### Storage Settings
- [ ] `material-images` bucket created
- [ ] `pdf-documents` bucket created
- [ ] Public access configured appropriately
- [ ] Storage policies configured

---

## 🔒 Security Verification

### Pre-Deployment Checklist
- [ ] All secrets use strong, randomly generated values
- [ ] No secrets are committed to git
- [ ] No `.env` files in repository
- [ ] Different secrets for dev/staging/production
- [ ] Service role keys are only in secure locations
- [ ] SSH keys are properly secured
- [ ] API keys have appropriate rate limits

### Post-Deployment Checklist
- [ ] All deployments successful
- [ ] Health checks passing
- [ ] Error tracking configured
- [ ] Logs show no authentication errors
- [ ] API rate limits working
- [ ] CORS configured correctly

---

## 🛠️ Quick Commands

### Generate Secrets
```bash
# JWT Secret
openssl rand -hex 32

# Material Kai API Key
echo "mk_api_2024_$(openssl rand -hex 32)"

# Encryption Key
openssl rand -hex 32

# SSH Key
ssh-keygen -t ed25519 -C "deployment@materialkai.vision"
```

### Set Supabase Secrets
```bash
# Set all required secrets at once
supabase secrets set \
  MIVAA_GATEWAY_URL="https://your-mivaa-url.com" \
  MIVAA_API_KEY="your-api-key" \
  SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
  OPENAI_API_KEY="your-openai-key"
```

### Verify Secrets
```bash
# List all Supabase secrets (values hidden)
supabase secrets list

# Check GitHub secrets (via web UI only)
# Go to: Repository → Settings → Secrets and variables → Actions

# Check Vercel environment variables
vercel env ls
```

### Security Considerations

1. **Never use .env files** - All secrets managed in GitHub/Vercel/Supabase
2. **Use strong, unique JWT secrets**
3. **Rotate API keys regularly**
4. **Enable HTTPS in production**
5. **Configure proper CORS origins**

## 🔧 Configuration Management

### API Configuration

The application uses a centralized configuration system:

```typescript
// src/config/index.ts
export const initializeConfiguration = async (): Promise<AppConfig>
```

### Service Configuration

Each service has its own configuration:
- `src/config/apis/` - API-specific configs
- `src/config/environments/` - Environment-specific settings
- `mivaa-pdf-extractor/app/config.py` - Python service config

## 🐛 Common Setup Issues

### 1. ESLint Configuration Error
**Issue**: `Invalid option '--ext'` error when running lint
**Solution**: Update package.json lint script to use new ESLint config format

### 2. Missing Environment Variables
**Issue**: Application fails to start due to missing env vars
**Solution**: Ensure all required variables are set in GitHub Secrets, Vercel, or Supabase

### 3. CORS Errors
**Issue**: Frontend can't connect to backend services
**Solution**: Configure CORS_ORIGINS properly in backend services

### 4. Database Connection Issues
**Issue**: Can't connect to Supabase
**Solution**: Verify Supabase URL and keys are correct

## 📝 Next Steps

After setup:
1. Review [Security & Authentication](./security-authentication.md)
2. Check [Database & Schema](./database-schema.md)
3. Explore [API Documentation](./api-documentation.md)
