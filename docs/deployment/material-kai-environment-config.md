# Material Kai Platform Environment Configuration

This document provides comprehensive guidance for configuring environment variables for the Material Kai API key integration across different deployment environments.

## Overview

The Material Kai Platform integration requires proper environment variable configuration to enable secure API key validation and authentication across development, staging, and production environments.

## Required Environment Variables

### Core Material Kai Configuration

```bash
# Material Kai Platform API Configuration
MATERIAL_KAI_API_ENABLED=true
MATERIAL_KAI_API_BASE_URL=https://api.materialkai.com
MATERIAL_KAI_API_VERSION=v1

# Database Configuration (Supabase)
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=24h

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### Development Environment (.env.local)

```bash
# Development Environment Configuration
NODE_ENV=development
PORT=3000

# Material Kai Development Settings
MATERIAL_KAI_API_ENABLED=true
MATERIAL_KAI_API_BASE_URL=https://api.materialkai.com
MATERIAL_KAI_DEBUG_MODE=true
MATERIAL_KAI_RATE_LIMIT_ENABLED=false

# Supabase Development
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_development_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_development_service_role_key

# JWT Development
JWT_SECRET=development_jwt_secret_change_in_production
JWT_EXPIRES_IN=24h

# CORS Development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000

# Debug Settings
DEBUG=material-kai:*
LOG_LEVEL=debug
```

### Staging Environment (.env.staging)

```bash
# Staging Environment Configuration
NODE_ENV=staging
PORT=3000

# Material Kai Staging Settings
MATERIAL_KAI_API_ENABLED=true
MATERIAL_KAI_API_BASE_URL=https://api.materialkai.com
MATERIAL_KAI_DEBUG_MODE=false
MATERIAL_KAI_RATE_LIMIT_ENABLED=true
MATERIAL_KAI_RATE_LIMIT_WINDOW=900000
MATERIAL_KAI_RATE_LIMIT_MAX=100

# Supabase Staging
SUPABASE_URL=https://your-staging-project-id.supabase.co
SUPABASE_ANON_KEY=your_staging_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_staging_service_role_key

# JWT Staging
JWT_SECRET=staging_jwt_secret_secure_random_string
JWT_EXPIRES_IN=12h

# CORS Staging
ALLOWED_ORIGINS=https://staging.yourdomain.com,https://preview.yourdomain.com

# Monitoring
LOG_LEVEL=info
ENABLE_METRICS=true
```

### Production Environment (.env.production)

```bash
# Production Environment Configuration
NODE_ENV=production
PORT=3000

# Material Kai Production Settings
MATERIAL_KAI_API_ENABLED=true
MATERIAL_KAI_API_BASE_URL=https://api.materialkai.com
MATERIAL_KAI_DEBUG_MODE=false
MATERIAL_KAI_RATE_LIMIT_ENABLED=true
MATERIAL_KAI_RATE_LIMIT_WINDOW=900000
MATERIAL_KAI_RATE_LIMIT_MAX=50
MATERIAL_KAI_CACHE_TTL=3600

# Supabase Production
SUPABASE_URL=https://your-production-project-id.supabase.co
SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key

# JWT Production
JWT_SECRET=production_jwt_secret_highly_secure_random_string
JWT_EXPIRES_IN=8h

# CORS Production
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Security & Monitoring
LOG_LEVEL=warn
ENABLE_METRICS=true
SECURITY_HEADERS_ENABLED=true
```

## Platform-Specific Configuration

### Vercel Deployment

Add these environment variables in your Vercel dashboard:

```bash
# Vercel Environment Variables
MATERIAL_KAI_API_ENABLED=true
MATERIAL_KAI_API_BASE_URL=https://api.materialkai.com
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_secure_jwt_secret
ALLOWED_ORIGINS=https://yourdomain.com
```

### Netlify Deployment

Configure in `netlify.toml`:

```toml
[build.environment]
  MATERIAL_KAI_API_ENABLED = "true"
  MATERIAL_KAI_API_BASE_URL = "https://api.materialkai.com"
  NODE_ENV = "production"

[context.production.environment]
  SUPABASE_URL = "https://your-project-id.supabase.co"
  JWT_SECRET = "your_secure_jwt_secret"
  ALLOWED_ORIGINS = "https://yourdomain.com"

[context.deploy-preview.environment]
  MATERIAL_KAI_DEBUG_MODE = "true"
  LOG_LEVEL = "debug"
```

### Docker Configuration

Create a `docker-compose.yml` with environment variables:

```yaml
version: '3.8'
services:
  material-kai-app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MATERIAL_KAI_API_ENABLED=true
      - MATERIAL_KAI_API_BASE_URL=https://api.materialkai.com
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
    env_file:
      - .env.production
```

### GitHub Actions CI/CD

Configure secrets in GitHub repository settings:

```yaml
# .github/workflows/deploy.yml
name: Deploy Material Kai Platform
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Production
        env:
          MATERIAL_KAI_API_ENABLED: true
          MATERIAL_KAI_API_BASE_URL: https://api.materialkai.com
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          ALLOWED_ORIGINS: ${{ secrets.ALLOWED_ORIGINS }}
        run: |
          npm run build
          npm run deploy
```

## Environment Variable Validation

### Runtime Validation Script

Create `scripts/validate-env.js`:

```javascript
const requiredEnvVars = [
  'MATERIAL_KAI_API_ENABLED',
  'MATERIAL_KAI_API_BASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET'
];

const optionalEnvVars = [
  'MATERIAL_KAI_DEBUG_MODE',
  'MATERIAL_KAI_RATE_LIMIT_ENABLED',
  'ALLOWED_ORIGINS',
  'LOG_LEVEL'
];

function validateEnvironment() {
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(envVar => console.error(`  - ${envVar}`));
    process.exit(1);
  }
  
  console.log('✅ All required environment variables are set');
  
  const optional = optionalEnvVars.filter(envVar => !process.env[envVar]);
  if (optional.length > 0) {
    console.warn('⚠️  Optional environment variables not set:');
    optional.forEach(envVar => console.warn(`  - ${envVar}`));
  }
}

if (require.main === module) {
  validateEnvironment();
}

module.exports = { validateEnvironment };
```

### TypeScript Environment Types

Create `types/environment.d.ts`:

```typescript
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Core Configuration
      NODE_ENV: 'development' | 'staging' | 'production';
      PORT?: string;
      
      // Material Kai Configuration
      MATERIAL_KAI_API_ENABLED: string;
      MATERIAL_KAI_API_BASE_URL: string;
      MATERIAL_KAI_API_VERSION?: string;
      MATERIAL_KAI_DEBUG_MODE?: string;
      MATERIAL_KAI_RATE_LIMIT_ENABLED?: string;
      MATERIAL_KAI_RATE_LIMIT_WINDOW?: string;
      MATERIAL_KAI_RATE_LIMIT_MAX?: string;
      MATERIAL_KAI_CACHE_TTL?: string;
      
      // Supabase Configuration
      SUPABASE_URL: string;
      SUPABASE_ANON_KEY: string;
      SUPABASE_SERVICE_ROLE_KEY: string;
      
      // JWT Configuration
      JWT_SECRET: string;
      JWT_EXPIRES_IN?: string;
      
      // CORS Configuration
      ALLOWED_ORIGINS?: string;
      
      // Monitoring & Debug
      LOG_LEVEL?: string;
      DEBUG?: string;
      ENABLE_METRICS?: string;
      SECURITY_HEADERS_ENABLED?: string;
    }
  }
}

export {};
```

## Security Best Practices

### 1. Environment Variable Security

- **Never commit** `.env` files to version control
- Use **different secrets** for each environment
- **Rotate secrets** regularly (quarterly recommended)
- Use **strong, random values** for JWT secrets (minimum 32 characters)
- **Validate environment variables** at application startup

### 2. Secret Management

```bash
# Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate Material Kai API key format
node -e "console.log('mk_api_' + new Date().getFullYear() + '_' + require('crypto').randomBytes(32).toString('hex').substring(0, 48))"
```

### 3. Environment Isolation

- Use **separate Supabase projects** for each environment
- Configure **different CORS origins** per environment
- Enable **rate limiting** in staging and production
- Use **environment-specific logging levels**

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   ```bash
   Error: SUPABASE_URL is not defined
   ```
   Solution: Ensure all required environment variables are set

2. **CORS Errors**
   ```bash
   Access to fetch blocked by CORS policy
   ```
   Solution: Add your domain to `ALLOWED_ORIGINS`

3. **JWT Secret Issues**
   ```bash
   JsonWebTokenError: invalid signature
   ```
   Solution: Ensure `JWT_SECRET` matches across all services

4. **Supabase Connection Errors**
   ```bash
   Failed to connect to Supabase
   ```
   Solution: Verify `SUPABASE_URL` and API keys are correct

### Debug Commands

```bash
# Check environment variables
npm run validate-env

# Test Material Kai API connection
curl -H "Authorization: Bearer mk_api_2024_..." \
     -H "Content-Type: application/json" \
     http://localhost:3000/api/mivaa-gateway/health

# Verify Supabase connection
npx supabase status --project-ref your-project-id
```

## Migration Guide

### From Hardcoded Keys to Environment Variables

1. **Update middleware configuration**:
   ```typescript
   // Before
   const hardcodedKeys = ['mk_api_2024_...'];
   
   // After
   const apiKeys = process.env.MATERIAL_KAI_API_KEYS?.split(',') || [];
   ```

2. **Update deployment scripts**:
   ```bash
   # Add environment variable validation
   npm run validate-env
   npm run build
   npm run deploy
   ```

3. **Update documentation**:
   - Update README with environment setup instructions
   - Add environment variable reference to API documentation
   - Update deployment guides with new configuration

## Next Steps

1. **Set up environment variables** for your target deployment platform
2. **Test the configuration** in development environment
3. **Validate API key authentication** end-to-end
4. **Deploy to staging** and verify functionality
5. **Deploy to production** with production-grade secrets

For additional support, refer to the [Material Kai Platform Documentation](https://docs.materialkai.com) or contact the development team.