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
| **MIVAA Gateway URL** | Vercel, Supabase Edge Functions | `MIVAA_GATEWAY_URL` | MIVAA service endpoint | Production URL or `http://localhost:8000` for dev |
| **MIVAA API Key** | Vercel, Supabase Edge Functions | `MIVAA_API_KEY` | MIVAA authentication | Same as Material Kai API Key |
| **MIVAA Service URL** | Vercel | `VITE_MIVAA_SERVICE_URL` | Frontend MIVAA endpoint | Production URL or localhost |

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
| **TogetherAI API Key** | GitHub Secrets, MIVAA | `TOGETHER_API_KEY` | LLaMA Vision, fast inference | Create at api.together.xyz/settings/api-keys |
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
| **GitHub Repository** | MIVAA Deployment | `GITHUB_REPOSITORY` | Container registry path | Format: `owner/repo` |
| **Deploy Host** | GitHub Secrets | `DEPLOY_HOST` | Server IP/hostname for deployment | Your server address |
| **Deploy User** | GitHub Secrets | `DEPLOY_USER` | SSH username | Server username (e.g., `root`) |
| **Deploy SSH Key** | GitHub Secrets | `DEPLOY_SSH_KEY` | SSH private key for deployment | Generate: `ssh-keygen -t ed25519` |

#### Monitoring & Error Tracking

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **Sentry DSN** | Vercel, GitHub, MIVAA | `SENTRY_DSN` | Error tracking endpoint | Copy from Sentry project settings |
| **Sentry Auth Token** | GitHub Secrets | `SENTRY_AUTH_TOKEN` | Sentry API authentication | Create in Sentry settings |
| **Sentry Organization** | GitHub Secrets | `SENTRY_ORG` | Sentry organization slug | From Sentry settings |
| **Sentry Project** | GitHub Secrets | `SENTRY_PROJECT` | Sentry project slug | From Sentry project settings |
| **LogRocket App ID** | Vercel | `LOGROCKET_APP_ID` | Session replay tracking | From LogRocket dashboard |

#### Storage & Infrastructure (Optional)

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **AWS Region** | Vercel, MIVAA | `AWS_REGION` | S3 bucket region | e.g., `us-east-1` |
| **AWS S3 Bucket** | Vercel, MIVAA | `AWS_S3_BUCKET` | Storage bucket name | Your S3 bucket name |
| **AWS Access Key ID** | MIVAA Deployment | `AWS_ACCESS_KEY_ID` | AWS authentication | From AWS IAM |
| **AWS Secret Access Key** | MIVAA Deployment | `AWS_SECRET_ACCESS_KEY` | AWS authentication | From AWS IAM |
| **Redis URL** | Optional | `REDIS_URL` or `CACHE_REDIS_URL` | Caching service | Redis connection string |
| **Database URL** | MIVAA Deployment | `DATABASE_URL` | Direct database connection | PostgreSQL connection string |

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
2. **Rotate exposed keys immediately** - If any key is accidentally committed
3. **Use different keys for different environments** - Development vs Production
4. **Limit key permissions** - Only grant necessary permissions
5. **Monitor key usage** - Set up alerts for unusual activity

### Required Environment Variables

**⚠️ IMPORTANT: We DO NOT use .env files. All environment variables are managed through:**
- **GitHub Secrets** (for CI/CD)
- **Vercel Environment Variables** (for frontend deployment)
- **Supabase Edge Functions Secrets** (for backend functions)

#### Frontend Application (Set in Vercel)
```bash
# Supabase Configuration
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# API Configuration
VITE_OPENAI_API_KEY=your_openai_api_key
VITE_HUGGINGFACE_API_KEY=your_huggingface_api_key
VITE_REPLICATE_API_TOKEN=your_replicate_token

# MIVAA Service
VITE_MIVAA_SERVICE_URL=http://localhost:8000
VITE_MIVAA_API_KEY=your_mivaa_api_key

# Material Kai API
VITE_MATERIAL_KAI_API_URL=your_material_kai_api_url
VITE_MATERIAL_KAI_API_KEY=mk_api_2024_your_secure_key

# Development Settings
NODE_ENV=development
VITE_DEBUG=true
```

#### MIVAA PDF Extractor (Set in Deployment Platform)
```bash
# Application Settings
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=INFO
HOST=0.0.0.0
PORT=8000

# Database Configuration
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# JWT Authentication
JWT_SECRET_KEY=your_secure_jwt_secret_key_here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# API Keys
OPENAI_API_KEY=your_openai_api_key
MATERIAL_KAI_API_URL=your_material_kai_api_url
MATERIAL_KAI_API_KEY=your_material_kai_api_key

# Security Settings
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60

# Performance Settings
MAX_WORKERS=4
CACHE_TTL=3600
```

### Optional Environment Variables

```bash
# Monitoring & Analytics
SENTRY_DSN=your_sentry_dsn
LOGROCKET_APP_ID=your_logrocket_app_id

# Storage Configuration
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_s3_bucket
STORAGE_PROVIDER=local

# Performance Tuning
CACHE_REDIS_URL=redis://localhost:6379
DATABASE_POOL_SIZE=10
MAX_REQUEST_SIZE=52428800
```

## 🗄️ Database Setup

### Supabase Configuration

1. **Create Supabase Project**:
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Note your project URL and anon key

2. **Configure Authentication**:
   ```sql
   -- Enable email authentication
   -- Configure JWT settings in Supabase dashboard
   ```

3. **Database Schema**:
   ```bash
   # Currently no migrations in supabase/migrations/
   # Manual schema setup required
   ```

### Required Database Tables

The application expects these core tables:
- `api_keys` - API key management
- `materials_catalog` - Material data
- `agent_ml_tasks` - ML task tracking
- `material_metadata_fields` - Dynamic metadata
- `documents` - Document storage
- `embeddings` - Vector embeddings

## 🔨 Development Setup

### Frontend Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run start

# Run linting (currently broken - needs fix)
npm run lint
```

### MIVAA Microservice Development

```bash
cd mivaa-pdf-extractor

# Start development server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
python -m pytest tests/ -v

# Run with Docker
docker-compose up --build
```

## 🏗️ Production Configuration

### Environment-Specific Settings

#### Production (Set in Vercel Production Environment)
```bash
NODE_ENV=production
VITE_DEBUG=false
LOG_LEVEL=ERROR

# Use production URLs
SUPABASE_URL=https://your-prod-project.supabase.co
VITE_MIVAA_SERVICE_URL=https://your-mivaa-service.com

# Security hardening
CORS_ORIGINS=https://your-domain.com
RATE_LIMIT_REQUESTS=50
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
```

#### Staging (Set in Vercel Preview Environment)
```bash
NODE_ENV=staging
VITE_DEBUG=true
LOG_LEVEL=INFO

# Use staging URLs
SUPABASE_URL=https://your-staging-project.supabase.co
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
