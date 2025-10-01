# Deployment Guide

## 🚀 Deployment Architecture

The Material Kai Vision Platform uses a multi-service deployment strategy:

1. **Frontend**: Vercel (Static hosting + Edge functions)
2. **MIVAA Service**: Docker containers (Self-hosted or cloud)
3. **Database**: Supabase (Managed PostgreSQL)
4. **External APIs**: Third-party services (OpenAI, HuggingFace, Replicate)

## 🏗️ Infrastructure Overview

```mermaid
graph TB
    subgraph "Production Environment"
        A[Vercel Frontend<br/>Static + Edge]
        B[MIVAA Service<br/>Docker Container]
        C[Supabase<br/>Database + Auth]
        D[External APIs<br/>OpenAI, HuggingFace]
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

#### Frontend (.env.production)
```bash
# Application
NODE_ENV=production
VITE_DEBUG=false

# Supabase
VITE_SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
VITE_SUPABASE_ANON_KEY=your_production_anon_key

# Services
VITE_MIVAA_SERVICE_URL=https://your-mivaa-service.com
VITE_MATERIAL_KAI_API_KEY=your_production_api_key

# External APIs
VITE_OPENAI_API_KEY=your_production_openai_key
VITE_HUGGINGFACE_API_KEY=your_production_hf_key
VITE_REPLICATE_API_TOKEN=your_production_replicate_token

# Security
VITE_ALLOWED_ORIGINS=https://your-domain.com
```

#### MIVAA Service (.env.production)
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
   vercel env add VITE_SUPABASE_URL production
   vercel env add VITE_SUPABASE_ANON_KEY production
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

## 🐳 MIVAA Service Deployment (Docker)

### Docker Configuration

**Dockerfile**:
```dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Start application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Docker Compose** (`docker-compose.yml`):
```yaml
version: '3.8'

services:
  mivaa-service:
    build: .
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=production
      - DEBUG=false
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    volumes:
      - ./logs:/var/log/mivaa
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - mivaa-service
    restart: unless-stopped
```

### Deployment Options

#### Option 1: Cloud Provider (AWS/GCP/Azure)

**AWS ECS Deployment**:
```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin your-account.dkr.ecr.us-east-1.amazonaws.com

docker build -t mivaa-service .
docker tag mivaa-service:latest your-account.dkr.ecr.us-east-1.amazonaws.com/mivaa-service:latest
docker push your-account.dkr.ecr.us-east-1.amazonaws.com/mivaa-service:latest

# Deploy to ECS
aws ecs update-service --cluster mivaa-cluster --service mivaa-service --force-new-deployment
```

#### Option 2: VPS/Dedicated Server

**Setup Script** (`deploy/setup-server.sh`):
```bash
#!/bin/bash

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Clone repository
git clone https://github.com/your-org/material-kai-vision-platform.git
cd material-kai-vision-platform/mivaa-pdf-extractor

# Set up environment
cp .env.production.example .env.production
# Edit .env.production with your values

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Set up SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

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
            cd /app/material-kai-vision-platform
            git pull origin main
            docker-compose -f docker-compose.prod.yml up -d --build
```

## 🚨 Deployment Issues & Solutions

### Common Issues

1. **Environment Variable Mismatch**:
   - **Problem**: Different env vars between environments
   - **Solution**: Use environment-specific .env files

2. **CORS Errors**:
   - **Problem**: Frontend can't connect to backend
   - **Solution**: Configure CORS_ORIGINS properly

3. **Database Connection Issues**:
   - **Problem**: Can't connect to Supabase
   - **Solution**: Verify connection strings and firewall rules

4. **SSL Certificate Issues**:
   - **Problem**: HTTPS not working
   - **Solution**: Use Let's Encrypt or proper SSL certificates

### Rollback Strategy

```bash
# Quick rollback for MIVAA service
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --scale mivaa-service=0
docker tag mivaa-service:previous mivaa-service:latest
docker-compose -f docker-compose.prod.yml up -d
```

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Environment variables configured
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

## 🔗 Related Documentation

- [Setup & Configuration](./setup-configuration.md) - Environment setup
- [Security & Authentication](./security-authentication.md) - Security configuration
- [Testing Strategy](./testing-strategy.md) - Pre-deployment testing
- [Troubleshooting](./troubleshooting.md) - Issue resolution
