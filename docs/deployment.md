# Deployment Guide

**Material Kai Vision Platform** - Production Deployment

---

## Overview

The Material Kai Vision Platform uses a **multi-service architecture** with separate deployments for frontend, backend API, and database services. All deployments are automated through **GitHub Actions** with zero-downtime updates.

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Vercel)                                          │
│  • Global Edge Network                                      │
│  • Automatic HTTPS                                          │
│  • Preview deployments per PR                               │
│  • Production: materialshub.gr                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  MIVAA API (Self-hosted)                                    │
│  • Docker container                                         │
│  • Nginx reverse proxy                                      │
│  • SSL/TLS (Let's Encrypt)                                  │
│  • Production: v1api.materialshub.gr                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Supabase (Cloud)                                           │
│  • PostgreSQL 15 + pgvector                                 │
│  • Edge Functions (Deno)                                    │
│  • Storage (S3-compatible)                                  │
│  • Region: EU West 3 (Paris)                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend Deployment (Vercel)

### Repository
- **GitHub**: `creativeghq/material-kai-vision-platform`
- **Branch**: `main` (production), `develop` (staging)

### Deployment Process

1. **Automatic Deployment**:
   - Push to `main` → Production deployment
   - Push to any branch → Preview deployment
   - Pull Request → Preview deployment with unique URL

2. **Build Configuration**:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "framework": "vite"
}
```

3. **Environment Variables** (Vercel Dashboard):
```bash
# Supabase
VITE_SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# MIVAA API
VITE_MIVAA_API_URL=https://v1api.materialshub.gr

# Feature Flags
VITE_ENABLE_3D_GENERATION=true
VITE_ENABLE_MATERIAL_SCRAPER=true
```

### GitHub Actions Workflow

**File**: `.github/workflows/deploy.yml`

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

---

## MIVAA API Deployment (Self-hosted)

### Repository
- **GitHub**: `Basilakis/mivaa-pdf-extractor`
- **Branch**: `main`

### Server Configuration

**Server**: v1api.materialshub.gr  
**OS**: Ubuntu 22.04 LTS  
**Docker**: 24.0+  
**Nginx**: 1.18+

### Deployment Process

1. **GitHub Actions Workflow**:

**File**: `.github/workflows/deploy-mivaa.yml`

```yaml
name: Deploy MIVAA API

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/mivaa-pdf-extractor
            git pull origin main
            docker-compose down
            docker-compose build
            docker-compose up -d
            docker-compose logs --tail=50
```

2. **Docker Configuration**:

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  mivaa-api:
    build: .
    container_name: mivaa-api
    restart: always
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - TOGETHER_API_KEY=${TOGETHER_API_KEY}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
    volumes:
      - ./temp:/app/temp
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**File**: `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

3. **Nginx Configuration**:

**File**: `/etc/nginx/sites-available/mivaa-api`

```nginx
server {
    listen 80;
    server_name v1api.materialshub.gr;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name v1api.materialshub.gr;

    ssl_certificate /etc/letsencrypt/live/v1api.materialshub.gr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/v1api.materialshub.gr/privkey.pem;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for long-running requests
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

4. **Environment Variables** (Server):

**File**: `/var/www/mivaa-pdf-extractor/.env`

```bash
# AI Services
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
TOGETHER_API_KEY=...
REPLICATE_API_TOKEN=r8_...

# Supabase
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Application
LOG_LEVEL=INFO
ENVIRONMENT=production
```

---

## Supabase Deployment

### Edge Functions

**Deployment**:
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref bgbavxtjlbvgplozizxu

# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy mivaa-gateway
```

### Database Migrations

**File**: `supabase/migrations/YYYYMMDDHHMMSS_migration_name.sql`

```sql
-- Example migration
CREATE TABLE IF NOT EXISTS new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
```

**Apply Migration**:
```bash
supabase db push
```

---

## Health Checks & Monitoring

### Frontend Health
```bash
curl https://materialshub.gr/health
```

### MIVAA API Health
```bash
curl https://v1api.materialshub.gr/health
```

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00Z",
  "version": "2.0.0",
  "service": "MIVAA PDF Extractor",
  "database": "connected",
  "storage": "available"
}
```

### Supabase Health
```bash
curl https://bgbavxtjlbvgplozizxu.supabase.co/rest/v1/
```

---

## Rollback Procedures

### Frontend Rollback (Vercel)
1. Go to Vercel Dashboard
2. Select deployment to rollback to
3. Click "Promote to Production"

### MIVAA API Rollback
```bash
ssh user@v1api.materialshub.gr
cd /var/www/mivaa-pdf-extractor
git checkout <previous-commit>
docker-compose down
docker-compose build
docker-compose up -d
```

### Database Rollback
```bash
supabase db reset --linked
```

---

## Secrets Management

### GitHub Secrets
- `VERCEL_TOKEN` - Vercel deployment token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID
- `SERVER_HOST` - MIVAA API server hostname
- `SERVER_USER` - SSH username
- `SSH_PRIVATE_KEY` - SSH private key
- `VITE_SUPABASE_URL` - Supabase URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key

### Vercel Environment Variables
- All `VITE_*` variables
- Separate for Production, Preview, Development

### Server Environment Variables
- All API keys and secrets in `.env` file
- Never committed to git
- Managed through SSH access

---

## Monitoring & Alerts

### Error Tracking
- **Platform**: Sentry
- **Coverage**: Frontend + Backend
- **Alerts**: Email + Slack

### Performance Monitoring
- **Vercel Analytics**: Frontend performance
- **Custom Metrics**: MIVAA API `/metrics` endpoint
- **Database**: Supabase Dashboard

### Uptime Monitoring
- **Service**: UptimeRobot
- **Checks**: Every 5 minutes
- **Alerts**: Email + SMS

---

## Backup & Recovery

### Database Backups
- **Frequency**: Daily automatic backups
- **Retention**: 30 days
- **Location**: Supabase Cloud

### Storage Backups
- **Frequency**: Weekly
- **Retention**: 90 days
- **Location**: Supabase Storage

### Code Backups
- **Platform**: GitHub
- **Frequency**: Every commit
- **Retention**: Unlimited

---

**Last Updated**: 2025-10-31  
**Version**: 2.0.0  
**Status**: Production

