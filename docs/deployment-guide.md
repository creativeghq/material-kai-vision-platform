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

| Secret Name | Type | Where Used | Description | Example/Format |
|------------|------|------------|-------------|----------------|
| `GH_TOKEN` | **Secret** | GitHub Actions | Personal access token for deployments | `ghp_xxxxxxxxxxxxxxxxxxxx` |
| `VERCEL_TOKEN` | **Secret** | GitHub Actions | Vercel deployment token | `xxxxxxxxxxxxxxxxxxxxxxxxx` |
| `VERCEL_ORG_ID` | Public | GitHub Actions | Vercel organization ID | `team_xxxxxxxxxxxxxxxx` |
| `VERCEL_PROJECT_ID` | Public | GitHub Actions | Vercel project ID | `prj_xxxxxxxxxxxxxxxx` |
| `SSH_PRIVATE_KEY` | **Secret** | GitHub Actions | SSH key for server deployment | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_HOST` | Public | GitHub Actions | Server hostname | `v1api.materialshub.gr` |
| `SSH_USER` | Public | GitHub Actions | SSH username | `root` or `deploy` |

### **Vercel Environment Variables**

| Secret Name | Type | Environment | Description | Example/Format |
|------------|------|-------------|-------------|----------------|
| `SUPABASE_URL` | Public | Production, Preview | Supabase project URL | `https://bgbavxtjlbvgplozizxu.supabase.co` |
| `SUPABASE_ANON_KEY` | Public | Production, Preview | Supabase anonymous key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Production | Service role key for Edge Functions | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `MIVAA_GATEWAY_URL` | Public | Production, Preview | MIVAA API endpoint | `https://v1api.materialshub.gr` |
| `MIVAA_API_KEY` | **Secret** | Production | MIVAA JWT token | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `VITE_OPENAI_API_KEY` | **Secret** | Production | OpenAI API key | `sk-proj-xxxxxxxxxxxxxxxx` |
| `VITE_ANTHROPIC_API_KEY` | **Secret** | Production | Anthropic API key | `sk-ant-xxxxxxxxxxxxxxxx` |
| `VITE_TOGETHER_AI_API_KEY` | **Secret** | Production | Together AI API key | `xxxxxxxxxxxxxxxxxxxxxxxx` |
| `VITE_REPLICATE_API_TOKEN` | **Secret** | Production | Replicate API token | `r8_xxxxxxxxxxxxxxxx` |
| `NODE_ENV` | Public | Production | Node environment | `production` |
| `VITE_DEBUG` | Public | Production, Preview | Debug mode | `false` (production), `true` (preview) |

### **Backend/MIVAA Service Secrets**

| Secret Name | Type | Where Set | Description | Example/Format |
|------------|------|-----------|-------------|----------------|
| `SUPABASE_URL` | Public | Server ENV | Supabase project URL | `https://bgbavxtjlbvgplozizxu.supabase.co` |
| `SUPABASE_ANON_KEY` | Public | Server ENV | Supabase anonymous key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Server ENV | Service role key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `JWT_SECRET_KEY` | **Secret** | Server ENV | JWT signing secret | `your-super-secret-jwt-secret-with-at-least-32-characters` |
| `OPENAI_API_KEY` | **Secret** | Server ENV | OpenAI API key | `sk-proj-xxxxxxxxxxxxxxxx` |
| `ANTHROPIC_API_KEY` | **Secret** | Server ENV | Anthropic API key | `sk-ant-xxxxxxxxxxxxxxxx` |
| `TOGETHER_AI_API_KEY` | **Secret** | Server ENV | Together AI API key | `xxxxxxxxxxxxxxxxxxxxxxxx` |
| `REPLICATE_API_TOKEN` | **Secret** | Server ENV | Replicate API token | `r8_xxxxxxxxxxxxxxxx` |
| `SENTRY_DSN` | **Secret** | Server ENV | Sentry error tracking DSN | `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx` |
| `CORS_ORIGINS` | Public | Server ENV | Allowed CORS origins | `https://your-domain.com,https://preview.vercel.app` |
| `ENVIRONMENT` | Public | Server ENV | Environment name | `production`, `staging`, `development` |
| `DEBUG` | Public | Server ENV | Debug mode | `false` (production), `true` (development) |
| `LOG_LEVEL` | Public | Server ENV | Logging level | `ERROR`, `WARNING`, `INFO`, `DEBUG` |

### **AI Service API Keys**

| Service | Secret Name | Where Used | How to Get | Pricing |
|---------|------------|------------|------------|---------|
| **OpenAI** | `OPENAI_API_KEY` | Frontend, Backend | https://platform.openai.com/api-keys | Pay-per-use |
| **Anthropic** | `ANTHROPIC_API_KEY` | Backend | https://console.anthropic.com/ | Pay-per-use |
| **Together AI** | `TOGETHER_AI_API_KEY` | Backend | https://api.together.xyz/settings/api-keys | Pay-per-use |
| **Replicate** | `REPLICATE_API_TOKEN` | Frontend, Backend | https://replicate.com/account/api-tokens | Pay-per-use |

### **Optional Monitoring & Analytics Secrets**

| Secret Name | Type | Where Used | Description | Example/Format |
|------------|------|------------|-------------|----------------|
| `SENTRY_DSN` | **Secret** | Backend | Sentry error tracking | `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx` |
| `SENTRY_AUTH_TOKEN` | **Secret** | GitHub Actions | Sentry release tracking | `sntrys_xxxxxxxxxxxxxxxx` |
| `GOOGLE_ANALYTICS_ID` | Public | Frontend | Google Analytics tracking | `G-XXXXXXXXXX` |
| `POSTHOG_API_KEY` | **Secret** | Frontend | PostHog analytics | `phc_xxxxxxxxxxxxxxxx` |

---

## 🚀 Deployment Architecture

The Material Kai Vision Platform uses a multi-service deployment strategy:

1. **Frontend**: Vercel (Static hosting + Edge functions)
2. **MIVAA Service**: Systemd service with UV (Self-hosted server)
3. **Database**: Supabase (Managed PostgreSQL)
4. **External APIs**: Third-party services (OpenAI, Anthropic, Together AI, Replicate)

## 🏗️ Infrastructure Overview

```mermaid
graph TB
    subgraph "Production Environment"
        A[Vercel Frontend<br/>Static + Edge]
        B[MIVAA Service<br/>Systemd + UV]
        C[Supabase<br/>Database + Auth]
        D[External APIs<br/>OpenAI, Anthropic, Together AI]
    end

    subgraph "Development Environment"
        E[Local Frontend<br/>localhost:5173]
        F[Local MIVAA<br/>localhost:8000]
        G[Supabase Cloud<br/>Shared Instance]
    end

    A --> B
    A --> C
    B --> C
    B --> D
    E --> F
    E --> G
    F --> G
```

## 🔧 Environment Configuration

### Production Environment Variables

#### Frontend (Set in Vercel Production Environment)
```bash
# Application
NODE_ENV=production
VITE_DEBUG=false

# Supabase
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_ANON_KEY=your_production_anon_key

# Services
MIVAA_GATEWAY_URL=https://v1api.materialshub.gr
MIVAA_API_KEY=your_production_mivaa_jwt_token

# External APIs
VITE_OPENAI_API_KEY=your_production_openai_key
VITE_HUGGINGFACE_API_KEY=your_production_hf_key
VITE_REPLICATE_API_TOKEN=your_production_replicate_token

# Security
VITE_ALLOWED_ORIGINS=https://your-domain.com
```

#### MIVAA Service (Set in Deployment Platform)
```bash
# Application
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=ERROR
HOST=0.0.0.0
PORT=8000

# Database
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_key

# Security
JWT_SECRET_KEY=your_secure_production_jwt_secret
CORS_ORIGINS=https://your-domain.com
RATE_LIMIT_REQUESTS=50
RATE_LIMIT_WINDOW=60

# Performance
MAX_WORKERS=4
CACHE_TTL=3600
DATABASE_POOL_SIZE=20

# Monitoring
SENTRY_DSN=your_sentry_dsn
LOG_FILE=/var/log/mivaa/app.log
```

## 📦 Frontend Deployment (Vercel)

### Vercel Configuration

**File**: `vercel.json`
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

### Deployment Steps

1. **Connect Repository**:
   ```bash
   # Install Vercel CLI
   npm install -g vercel
   
   # Login and link project
   vercel login
   vercel link
   ```

2. **Configure Environment Variables**:
   ```bash
   # Set production environment variables
   vercel env add SUPABASE_URL production
   vercel env add SUPABASE_ANON_KEY production
   vercel env add VITE_MIVAA_SERVICE_URL production
   # ... add all required variables
   ```

3. **Deploy**:
   ```bash
   # Deploy to production
   vercel --prod
   
   # Or use automatic deployment via Git
   git push origin main  # Triggers automatic deployment
   ```

### Build Optimization

**Vite Configuration** (`vite.config.ts`):
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          supabase: ['@supabase/supabase-js'],
          utils: ['clsx', 'tailwind-merge', 'lucide-react'],
        },
      },
    },
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
  },
});
```

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

```ini
[Unit]
Description=MIVAA PDF Extractor FastAPI service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/mivaa-pdf-extractor
Environment=SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
Environment=SUPABASE_SERVICE_KEY=<your-service-key>
Environment=TOGETHER_AI_API_KEY=<your-together-ai-key>
Environment=ANTHROPIC_API_KEY=<your-anthropic-key>
Environment=OPENAI_API_KEY=<your-openai-key>
ExecStart=/var/www/mivaa-pdf-extractor/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 🚀 Deployment Process

#### **Automated Deployment (GitHub Actions)**

The deployment is fully automated via GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. **Code Push**: Push to `main` branch triggers deployment
2. **SSH Connection**: Connects to production server (104.248.68.3)
3. **Code Update**: Pulls latest code from GitHub
4. **Dependency Installation**: Uses UV to install/update dependencies
5. **Service Update**: Updates systemd service file with latest environment variables
6. **Service Restart**: Restarts the mivaa-pdf-extractor service
7. **Health Check**: Verifies all endpoints are responding correctly
8. **Auto-Recovery**: Automatically restarts service if health checks fail

#### **Manual Deployment**

If you need to deploy manually:

```bash
# SSH into server
ssh root@104.248.68.3

# Navigate to project directory
cd /var/www/mivaa-pdf-extractor

# Pull latest code
git pull origin main

# Install/update dependencies with UV
uv pip install -r requirements.txt

# Restart service
sudo systemctl restart mivaa-pdf-extractor

# Check service status
sudo systemctl status mivaa-pdf-extractor

# View logs
sudo journalctl -u mivaa-pdf-extractor -f
```

### 🔧 Server Setup (One-Time)

**Initial Server Configuration**:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python 3.11
sudo apt install python3.11 python3.11-venv python3-pip -y

# Install UV package manager
curl -LsSf https://astral.sh/uv/install.sh | sh

# Clone repository
cd /var/www
git clone https://github.com/creativeghq/mivaa-pdf-extractor.git
cd mivaa-pdf-extractor

# Create virtual environment
python3.11 -m venv .venv

# Install dependencies
uv pip install -r requirements.txt

# Create systemd service (see configuration above)
sudo nano /etc/systemd/system/mivaa-pdf-extractor.service

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable mivaa-pdf-extractor
sudo systemctl start mivaa-pdf-extractor

# Check status
sudo systemctl status mivaa-pdf-extractor
```

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

**Usage**:
```bash
# Automatic deployment
git push origin main

# Manual deployment
# Go to GitHub Actions → "MIVAA Deployment (Default)" → Run workflow
```

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

**Usage**:
```bash
# Manual orchestrated deployment
# Go to GitHub Actions → "Orchestrated MIVAA Deployment Pipeline (On-Demand)"
# Configure options:
# - Deployment Mode: intelligent
# - Target Branch: main
# - Deployment Reason: "Feature release with enhanced monitoring"
# Run workflow
```

### 🏥 Health Check Features

Both workflows include comprehensive health monitoring:

#### **Endpoint Testing**
```bash
# Tested endpoints:
curl https://v1api.materialshub.gr/health
curl https://v1api.materialshub.gr/docs
curl https://v1api.materialshub.gr/redoc
curl https://v1api.materialshub.gr/openapi.json
```

#### **Status Code Verification**
- **200**: ✅ Service healthy and responding correctly
- **502**: ❌ Bad Gateway - Service not responding
- **404**: ❌ Not Found - Endpoint not available
- **500**: ❌ Internal Server Error - Application error
- **000**: ❌ Connection failed - Service not reachable

#### **Automatic Diagnostics on Failure**
```bash
# System diagnostics collected:
- Server uptime and load averages
- Memory and disk usage
- Service status (systemctl status mivaa-pdf-extractor)
- Recent service logs (last 50 lines)
- Network status (port 8000 availability)
- Process binding verification
- Service restart attempt
- Post-restart verification
```

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
- **AI Integration**: OpenAI, HuggingFace, TogetherAI APIs
- **Monitoring**: Sentry error tracking and structured logging
- **Security**: JWT authentication and environment-based secrets

### 🔧 Workflow Configuration

#### **Required Secrets**
Set these in GitHub repository secrets:
```bash
# Server Access
SSH_PRIVATE_KEY=your_ssh_private_key
DEPLOY_HOST=104.248.68.3

# Application Environment
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET_KEY=your_jwt_secret
OPENAI_API_KEY=your_openai_key
HUGGINGFACE_API_KEY=your_huggingface_key
MATERIAL_KAI_API_URL=https://v1api.materialshub.gr
MATERIAL_KAI_API_KEY=your_api_key
SENTRY_DSN=your_sentry_dsn
```

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

2. **Configure Database**:
   ```sql
   -- Enable required extensions
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS "vector";
   CREATE EXTENSION IF NOT EXISTS "ltree";
   ```

3. **Set Up Authentication**:
   ```bash
   # Configure JWT settings in Supabase dashboard
   # Set up email templates
   # Configure OAuth providers (if needed)
   ```

4. **Deploy Schema**:
   ```bash
   # Initialize migrations (when available)
   supabase migration new initial_schema
   supabase db push
   ```

### Database Security

**Row Level Security (RLS)**:
```sql
-- Enable RLS on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can only access their workspace data" ON documents
  FOR ALL USING (workspace_id IN (
    SELECT workspace_id FROM user_workspaces 
    WHERE user_id = auth.uid()
  ));
```

## 🔐 Security Configuration

### SSL/TLS Setup

**Nginx Configuration** (`nginx.conf`):
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    location / {
        proxy_pass http://mivaa-service:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Firewall Configuration

```bash
# UFW firewall setup
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 📊 Monitoring & Logging

### Application Monitoring

**Health Check Endpoints**:
```bash
# Frontend health
curl https://your-domain.com/api/health

# MIVAA service health
curl https://your-mivaa-service.com/health

# Database health
curl https://your-mivaa-service.com/api/v1/health
```

### Logging Configuration

**Structured Logging**:
```python
# mivaa-pdf-extractor/app/utils/logging.py
import structlog

logger = structlog.get_logger()

# Log with context
logger.info("Document processed", 
           document_id=doc_id, 
           processing_time=time_taken,
           user_id=user_id)
```

### Error Tracking

**Sentry Integration**:
```typescript
// Frontend error tracking
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test
      - run: npm run build

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to server
        uses: appleboy/ssh-action@v0.1.5
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.KEY }}
          script: |
            cd /var/www/mivaa-pdf-extractor
            git pull origin main
            uv pip install -r requirements.txt
            sudo systemctl restart mivaa-pdf-extractor
            sudo systemctl status mivaa-pdf-extractor
```

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
     - TOGETHER_AI_API_KEY

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

### Rollback Strategy

```bash
# Quick rollback for MIVAA service
ssh root@104.248.68.3

# Navigate to project directory
cd /var/www/mivaa-pdf-extractor

# Checkout previous commit
git log --oneline -n 5  # Find previous commit hash
git checkout <previous-commit-hash>

# Restart service
sudo systemctl restart mivaa-pdf-extractor

# Verify service is running
sudo systemctl status mivaa-pdf-extractor
curl https://v1api.materialshub.gr/health
```

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Environment variables configured in GitHub Secrets
- [ ] Systemd service file updated with latest environment variables
- [ ] SSL certificates ready
- [ ] Database migrations prepared
- [ ] Backup strategy in place

### Deployment
- [ ] Frontend deployed to Vercel
- [ ] Backend deployed to production server
- [ ] Database schema updated
- [ ] Health checks passing
- [ ] SSL/HTTPS working

### Post-Deployment
- [ ] Monitor application logs
- [ ] Verify all endpoints working
- [ ] Check performance metrics
- [ ] Validate security headers
- [ ] Test critical workflows

## 💾 Backup & Disaster Recovery

### Automated Backup Strategy

**Database Backups** (Supabase):
```bash
# Supabase provides automatic daily backups
# Access backups in Supabase Dashboard → Settings → Backups

# Point-in-time recovery (PITR) available for 7 days
# Restore via Supabase Dashboard or API
```

**Application Data Backups**:
```bash
# Automated backup script (runs daily via cron)
# Location: /usr/local/bin/backup-mivaa.sh

# Manual backup
backup-mivaa.sh

# Backup location: /backups/mivaa_backup_YYYYMMDD_HHMMSS.tar.gz
# Retention: Last 7 backups kept automatically
```

### Disaster Recovery Procedures

**Database Recovery**:
1. Go to Supabase Dashboard → Settings → Backups
2. Select desired backup point
3. Click "Restore" and confirm
4. Verify data integrity after restore

**Application Recovery**:
```bash
# Restore from backup
cd /backups
tar -xzf mivaa_backup_YYYYMMDD_HHMMSS.tar.gz -C /app

# Restart service
systemctl restart mivaa-pdf-extractor
```

---

## 🗄️ Database Migrations & Schema Management

### Migration Strategy

**Using Supabase Migrations**:
```bash
# Create new migration
supabase migration new add_new_table

# Apply migrations
supabase db push

# Rollback migration
supabase db reset
```

**Zero-Downtime Deployments**:
1. Add new columns as nullable
2. Deploy code that handles both old and new columns
3. Backfill data in background job
4. Remove old columns in subsequent deployment

### Extension Management

**Required PostgreSQL Extensions**:
```sql
-- Enable in Supabase Dashboard → SQL Editor
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "ltree";
```

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

**Recovery on Restart**:
```python
# Automatic on service startup
# Resumes jobs in 'processing' state
# Retries failed jobs up to max_retries
```

**Graceful Shutdown**:
```bash
# Service receives SIGTERM
# Completes current operations
# Persists job state
# Exits cleanly

# Timeout: 30 seconds before SIGKILL
```

---

## 📊 Performance Optimization & Scaling

### Horizontal Scaling

**MIVAA Service Scaling**:

For horizontal scaling, you can run multiple instances of the MIVAA service on different ports and use nginx for load balancing:

```bash
# Create multiple systemd services
sudo cp /etc/systemd/system/mivaa-pdf-extractor.service /etc/systemd/system/mivaa-pdf-extractor-8001.service
sudo cp /etc/systemd/system/mivaa-pdf-extractor.service /etc/systemd/system/mivaa-pdf-extractor-8002.service

# Edit each service to use different ports
# mivaa-pdf-extractor.service uses port 8000
# mivaa-pdf-extractor-8001.service uses port 8001
# mivaa-pdf-extractor-8002.service uses port 8002

# Start all services
sudo systemctl start mivaa-pdf-extractor
sudo systemctl start mivaa-pdf-extractor-8001
sudo systemctl start mivaa-pdf-extractor-8002
```

**Load Balancing with Nginx**:
```nginx
upstream mivaa_backend {
    server localhost:8000;
    server localhost:8001;
    server localhost:8002;
}

server {
    location / {
        proxy_pass http://mivaa_backend;
    }
}
```

### Database Connection Pooling

**Supabase Connection Pool**:
```bash
# Set in MIVAA environment
DATABASE_POOL_SIZE=20
DATABASE_POOL_TIMEOUT=30
```

### Caching Strategy

**Application-Level Caching**:
```typescript
// Production caching configuration
caching: {
  enabled: true,
  ttl: 3600000,        // 1 hour
  maxSize: 1000,       // 1000 items
  strategy: 'lru'      // Least Recently Used
}
```

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

**Sentry Configuration**:
```typescript
// Frontend monitoring
Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  integrations: [
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
```

### Alert Thresholds

```typescript
alertThresholds: {
  errorRate: 0.05,        // 5% error rate
  responseTime: 2000,     // 2 seconds
  memoryUsage: 0.7,       // 70% memory
  cpuUsage: 0.8,          // 80% CPU
}
```

---

## 🔐 Security Hardening

### API Rate Limiting

```bash
# MIVAA Service environment
RATE_LIMIT_REQUESTS=50
RATE_LIMIT_WINDOW=60  # per minute
```

### Security Headers

```nginx
# nginx.conf
add_header X-Content-Type-Options "nosniff";
add_header X-Frame-Options "DENY";
add_header X-XSS-Protection "1; mode=block";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
add_header Content-Security-Policy "default-src 'self'";
```

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

**Deploy Function**:
```bash
# Create new function
supabase functions new my-function

# Deploy to production
supabase functions deploy my-function --project-ref bgbavxtjlbvgplozizxu
```

**Environment Variables**:
```bash
# Set in Supabase Dashboard → Edge Functions → Secrets
supabase secrets set JWT_SECRET_KEY=your_secret
```

---

## 🔗 Related Documentation

- [Setup & Configuration](./setup-configuration.md) - Environment setup
- [Security & Authentication](./security-authentication.md) - Security configuration
- [Testing Strategy](./testing-strategy.md) - Pre-deployment testing
- [Troubleshooting](./troubleshooting.md) - Issue resolution
- [Job Recovery & Signal Handling](../mivaa-pdf-extractor/docs/JOB-RECOVERY-AND-SIGNAL-HANDLING.md) - Job persistence
