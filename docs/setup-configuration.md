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
   ```bash
   cp .env.example .env
   # Configure your environment variables (see below)
   ```

## 🔧 Environment Variables

### 🗝️ Complete Secret Keys Reference Table

| Secret/Key | Where to Add | Environment Variable | Purpose | How to Generate/Obtain |
|------------|--------------|---------------------|---------|------------------------|
| **Supabase Project URL** | Supabase Dashboard | `VITE_SUPABASE_URL` | Database connection | Auto-generated when creating Supabase project |
| **Supabase Anon Key** | Supabase Dashboard → Settings → API | `VITE_SUPABASE_ANON_KEY` | Client-side database access | Copy from Supabase API settings |
| **Supabase Service Role Key** | Supabase Dashboard → Settings → API | `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access | Copy from Supabase API settings (⚠️ Keep secret) |
| **JWT Secret** | Supabase Dashboard → Settings → Auth | `JWT_SECRET_KEY` | Token signing/verification | Generate: `openssl rand -hex 32` |
| **Material Kai API Key** | Application Database | `VITE_MATERIAL_KAI_API_KEY` | Internal API authentication | Generate: `mk_api_2024_$(openssl rand -hex 32)` |
| **OpenAI API Key** | OpenAI Dashboard → API Keys | `OPENAI_API_KEY` | AI text/image processing | Create at platform.openai.com |
| **OpenAI Organization ID** | OpenAI Dashboard → Settings | `OPENAI_ORG_ID` | Organization billing | Optional, from OpenAI settings |
| **HuggingFace API Token** | HuggingFace → Settings → Access Tokens | `HUGGINGFACE_API_KEY` | Alternative ML models | Create at huggingface.co/settings/tokens |
| **Replicate API Token** | Replicate Dashboard → Account | `REPLICATE_API_TOKEN` | 3D generation models | Create at replicate.com/account |
| **TogetherAI API Key** | TogetherAI Dashboard | `TOGETHER_API_KEY` | LLaMA Vision models | Create at api.together.xyz |
| **GitHub Personal Access Token** | GitHub → Settings → Developer settings | `GITHUB_TOKEN` | Repository access for CI/CD | Create with repo permissions |
| **Vercel Token** | Vercel Dashboard → Settings → Tokens | `VERCEL_TOKEN` | Deployment automation | Create for CI/CD deployments |
| **Sentry DSN** | Sentry Project Settings | `SENTRY_DSN` | Error tracking | Copy from Sentry project settings |

### 🔐 Security Configuration Locations

| Platform | Configuration Location | What to Add |
|----------|----------------------|-------------|
| **Supabase** | Dashboard → Settings → Auth | JWT secret, CORS origins, redirect URLs |
| **Vercel** | Project → Settings → Environment Variables | All `VITE_*` variables for frontend |
| **GitHub** | Repository → Settings → Secrets and variables | All secrets for CI/CD actions |
| **Docker/Server** | `.env.production` file | All backend environment variables |
| **Local Development** | `.env` and `.env.local` files | Development versions of all variables |

### ⚠️ Critical Security Notes

1. **NEVER commit secrets to Git** - Use `.env` files and add them to `.gitignore`
2. **Rotate exposed keys immediately** - If any key is accidentally committed
3. **Use different keys for different environments** - Development vs Production
4. **Limit key permissions** - Only grant necessary permissions
5. **Monitor key usage** - Set up alerts for unusual activity

### Required Environment Variables

#### Frontend Application (.env)
```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

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

#### MIVAA PDF Extractor (.env in mivaa-pdf-extractor/)
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

#### Production (.env.production)
```bash
NODE_ENV=production
VITE_DEBUG=false
LOG_LEVEL=ERROR

# Use production URLs
VITE_SUPABASE_URL=https://your-prod-project.supabase.co
VITE_MIVAA_SERVICE_URL=https://your-mivaa-service.com

# Security hardening
CORS_ORIGINS=https://your-domain.com
RATE_LIMIT_REQUESTS=50
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
```

#### Staging (.env.staging)
```bash
NODE_ENV=staging
VITE_DEBUG=true
LOG_LEVEL=INFO

# Use staging URLs
VITE_SUPABASE_URL=https://your-staging-project.supabase.co
```

### Security Considerations

1. **Never commit .env files**
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
**Solution**: Ensure all required variables are set in .env file

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
