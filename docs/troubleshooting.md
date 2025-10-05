# Troubleshooting Guide

## 🚨 Critical Issues Identified

### Security Vulnerabilities (IMMEDIATE ACTION REQUIRED)

#### 1. Hardcoded API Keys and Secrets
**Severity**: CRITICAL  
**Files Affected**:
- `src/middleware/materialKaiAuthMiddleware.ts`
- `src/middleware/jwtAuthMiddleware.ts`
- `supabase/config.toml`
- `src/config/apis/supabaseConfig.ts`

**Issue**:
```typescript
// EXPOSED: Hardcoded API key
'mk_api_2024_Kj9mN2pQ8rT5vY7wE3uI6oP1aS4dF8gH2kL9nM6qR3tY5vX8zA1bC4eG7jK0mP9s'

// EXPOSED: JWT secret
jwt_secret = "Kj9mN2pQ8rT5vY7wE3uI6oP1aS4dF8gH2kL9nM6qR3tY5vX8zA1bC4eG7jK0mP9s"
```

**Solution**:
```bash
# 1. Generate new secrets
openssl rand -hex 32 > .env.JWT_SECRET
openssl rand -hex 32 > .env.API_KEY

# 2. Update environment variables
echo "JWT_SECRET_KEY=$(cat .env.JWT_SECRET)" >> .env
echo "MATERIAL_KAI_API_KEY=mk_api_2024_$(cat .env.API_KEY)" >> .env

# 3. Remove hardcoded values from code
# 4. Rotate all exposed keys immediately
```

#### 2. Wildcard CORS Configuration
**Severity**: HIGH  
**File**: `supabase/functions/_shared/cors.ts`

**Issue**:
```typescript
'Access-Control-Allow-Origin': '*'  // Allows any origin
```

**Solution**:
```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
```

## 🔧 Development Issues

### 1. ESLint Configuration Error

**Error**:
```bash
npm run lint
# Invalid option '--ext' - perhaps you meant '-c'?
```

**Cause**: Outdated ESLint configuration for new ESLint version

**Solution**:
```json
// package.json - Update lint script
{
  "scripts": {
    "lint": "eslint . --report-unused-disable-directives --max-warnings 0"
  }
}
```

### 2. Missing Database Migrations

**Issue**: Empty `supabase/migrations/` directory

**Impact**: 
- No version control for database schema
- Inconsistent database state across environments
- Difficult deployments

**Solution**:
```bash
# 1. Initialize migration system
supabase migration new initial_schema

# 2. Export current schema
pg_dump --schema-only your_database > migrations/001_initial_schema.sql

# 3. Create migration files
supabase migration new add_vector_extension
supabase migration new create_core_tables
supabase migration new add_rls_policies
```

### 3. Test Infrastructure Missing

**Issue**: Test configuration exists but no actual tests

**Files with missing implementations**:
- `tests/unit/` - Empty
- `tests/integration/` - Empty
- `tests/e2e/` - Empty

**Solution**:
```bash
# 1. Create basic test structure
mkdir -p tests/{unit,integration,e2e,fixtures}

# 2. Add test fixtures
cp sample-files/* tests/fixtures/

# 3. Implement basic tests
# See testing-strategy.md for detailed implementation
```

## 🌐 API & Service Issues

### 1. MIVAA Service Connection Issues

**Symptoms**:
- Frontend can't connect to MIVAA service
- 500 errors on document processing
- Gateway timeouts

**Debugging Steps**:
```bash
# 1. Check MIVAA service health
curl http://localhost:8000/health

# 2. Check service logs
docker logs mivaa-service

# 3. Verify environment variables
echo $MIVAA_SERVICE_URL
echo $MIVAA_API_KEY
```

**Common Solutions**:
```bash
# Fix CORS issues
export CORS_ORIGINS="http://localhost:3000,http://localhost:5173"

# Fix authentication
export JWT_SECRET_KEY="your-secure-secret"

# Restart service
docker-compose restart mivaa-service
```

### 2. Supabase Connection Issues

**Symptoms**:
- Authentication failures
- Database connection errors
- RLS policy violations

**Debugging**:
```typescript
// Check Supabase client configuration
console.log('Supabase URL:', process.env.VITE_SUPABASE_URL);
console.log('Anon Key:', process.env.VITE_SUPABASE_ANON_KEY?.substring(0, 20) + '...');

// Test connection
const { data, error } = await supabase.from('api_keys').select('count');
console.log('Connection test:', { data, error });
```

**Solutions**:
```bash
# 1. Verify environment variables
grep SUPABASE .env

# 2. Check Supabase project status
# Visit Supabase dashboard

# 3. Test API key permissions
curl -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     "$SUPABASE_URL/rest/v1/api_keys?select=count"
```

### 3. External API Rate Limiting

**Symptoms**:
- 429 Too Many Requests errors
- Slow response times
- API quota exceeded

**OpenAI API Issues**:
```typescript
// Check rate limits
const response = await fetch('https://api.openai.com/v1/models', {
  headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
});
console.log('Rate limit remaining:', response.headers.get('x-ratelimit-remaining'));
```

**Solutions**:
```typescript
// Implement exponential backoff
const retryWithBackoff = async (fn, retries = 3) => {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && error.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 2 ** (3 - retries) * 1000));
      return retryWithBackoff(fn, retries - 1);
    }
    throw error;
  }
};
```

## 🗄️ Database Issues

### 1. Vector Search Performance

**Symptoms**:
- Slow embedding searches
- High CPU usage on database
- Query timeouts

**Diagnosis**:
```sql
-- Check missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE tablename = 'embeddings';

-- Check query performance
EXPLAIN ANALYZE 
SELECT * FROM embeddings 
ORDER BY embedding <-> '[0.1,0.2,...]' 
LIMIT 10;
```

**Solutions**:
```sql
-- Add vector index
CREATE INDEX embeddings_vector_idx ON embeddings 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Add workspace filtering index
CREATE INDEX embeddings_workspace_id_idx ON embeddings(workspace_id);
```

### 2. RLS Policy Issues

**Symptoms**:
- Users can access other workspaces' data
- Permission denied errors
- Inconsistent data access

**Debugging**:
```sql
-- Check current RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('documents', 'embeddings', 'api_keys');

-- Test policy with specific user
SET ROLE authenticated;
SET request.jwt.claims.sub TO 'user-uuid';
SELECT * FROM documents; -- Should only return user's documents
```

**Solutions**:
```sql
-- Enable RLS on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- Create workspace isolation policy
CREATE POLICY "workspace_isolation" ON documents
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );
```

## 🚀 Performance Issues

### 1. Large Bundle Size

**Issue**: Frontend bundle too large (>2MB)

**Analysis**:
```bash
# Analyze bundle
npm run build
npx vite-bundle-analyzer dist

# Check largest dependencies
npm ls --depth=0 --long
```

**Solutions**:
```typescript
// vite.config.ts - Optimize chunks
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          utils: ['clsx', 'tailwind-merge'],
        },
      },
    },
  },
});
```

### 2. Memory Leaks

**Symptoms**:
- Increasing memory usage over time
- Browser tab crashes
- Slow performance after extended use

**Debugging**:
```typescript
// Monitor memory usage
const measureMemory = () => {
  if ('memory' in performance) {
    console.log('Memory usage:', {
      used: Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB',
      total: Math.round(performance.memory.totalJSHeapSize / 1048576) + ' MB',
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576) + ' MB'
    });
  }
};

// Call periodically
setInterval(measureMemory, 30000);
```

**Solutions**:
```typescript
// Clean up event listeners
useEffect(() => {
  const handleResize = () => { /* handler */ };
  window.addEventListener('resize', handleResize);
  
  return () => {
    window.removeEventListener('resize', handleResize);
  };
}, []);

// Clean up subscriptions
useEffect(() => {
  const subscription = supabase
    .channel('documents')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, handleChange)
    .subscribe();
    
  return () => {
    subscription.unsubscribe();
  };
}, []);
```

## 🔐 Authentication Issues

### 1. JWT Token Expiration

**Symptoms**:
- Sudden authentication failures
- Users logged out unexpectedly
- 401 Unauthorized errors

**Debugging**:
```typescript
// Check token expiration
const checkTokenExpiry = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    const payload = JSON.parse(atob(session.access_token.split('.')[1]));
    const expiryTime = new Date(payload.exp * 1000);
    console.log('Token expires at:', expiryTime);
    console.log('Time until expiry:', expiryTime.getTime() - Date.now(), 'ms');
  }
};
```

**Solutions**:
```typescript
// Implement token refresh
const refreshToken = async () => {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    console.error('Token refresh failed:', error);
    // Redirect to login
  }
};

// Auto-refresh before expiry
useEffect(() => {
  const interval = setInterval(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]));
      const timeUntilExpiry = (payload.exp * 1000) - Date.now();
      
      // Refresh if less than 5 minutes remaining
      if (timeUntilExpiry < 5 * 60 * 1000) {
        await refreshToken();
      }
    }
  }, 60000); // Check every minute
  
  return () => clearInterval(interval);
}, []);
```

### 2. API Key Validation Issues

**Symptoms**:
- Valid API keys rejected
- Inconsistent authentication behavior
- Rate limiting issues

**Debugging**:
```typescript
// Validate API key format
const validateApiKey = (key: string) => {
  console.log('API Key validation:', {
    length: key.length,
    format: key.startsWith('mk_api_') || key.startsWith('kai_'),
    hasSpecialChars: /[^a-zA-Z0-9_]/.test(key)
  });
};
```

## 🛠️ Development Environment Issues

### 1. Node.js Version Conflicts

**Issue**: Different Node.js versions causing build failures

**Solution**:
```bash
# Use Node Version Manager
nvm install 18
nvm use 18

# Or use .nvmrc file
echo "18" > .nvmrc
nvm use
```

### 2. Package Installation Issues

**Symptoms**:
- npm install failures
- Dependency conflicts
- Missing peer dependencies

**Solutions**:
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Fix peer dependency issues
npm install --legacy-peer-deps
```

## 📊 Monitoring & Debugging Tools

### 1. Health Check Endpoints

```bash
# Frontend health
curl http://localhost:5173/api/health

# MIVAA service health
curl http://localhost:8000/health

# Supabase health
curl "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_ANON_KEY"
```

### 2. Log Analysis

```bash
# Frontend logs (browser console)
# Check for errors, warnings, and network failures

# MIVAA service logs
docker logs mivaa-service --tail 100 -f

# System logs
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

### 3. Performance Monitoring

```typescript
// Frontend performance monitoring
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log('Performance entry:', entry);
  }
});
observer.observe({ entryTypes: ['navigation', 'resource', 'measure'] });
```

## 🆘 Emergency Procedures

### 1. Service Outage Response

```bash
# 1. Check service status
curl -I https://your-domain.com/health

# 2. Check logs for errors
docker logs mivaa-service --tail 50

# 3. Restart services
docker-compose restart

# 4. Rollback if necessary
git checkout previous-working-commit
docker-compose up -d --build
```

### 2. Security Incident Response

```bash
# 1. Rotate all API keys immediately
# 2. Check access logs for suspicious activity
# 3. Update all secrets
# 4. Deploy security patches
# 5. Monitor for continued issues
```

### 3. Data Recovery

```bash
# 1. Check Supabase backups
# 2. Restore from point-in-time backup if needed
# 3. Verify data integrity
# 4. Update application if schema changed
```

## 📞 Getting Help

### 1. Log Collection

Before seeking help, collect these logs:
- Browser console logs
- Network tab (failed requests)
- MIVAA service logs
- Database error logs
- System resource usage

### 2. Issue Reporting Template

```markdown
## Issue Description
Brief description of the problem

## Environment
- OS: 
- Node.js version:
- Browser (if frontend issue):
- Deployment environment:

## Steps to Reproduce
1. 
2. 
3. 

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Logs
```
Relevant log entries
```

## Additional Context
Any other relevant information
```

## 🤖 MIVAA Service Troubleshooting

### 🏥 Health Check Issues

#### **Health Endpoint Returns 502 Bad Gateway**
```bash
# Check service status
sudo systemctl status mivaa-pdf-extractor

# Check if service is running
ps aux | grep mivaa

# Check port binding
ss -tlnp | grep :8000

# Restart service
sudo systemctl restart mivaa-pdf-extractor

# Monitor logs
sudo journalctl -u mivaa-pdf-extractor -f
```

#### **Health Endpoint Returns 404 Not Found**
```bash
# Verify endpoint URL
curl https://v1api.materialshub.gr/health

# Check nginx configuration
sudo nginx -t
sudo systemctl status nginx

# Verify proxy configuration
sudo cat /etc/nginx/sites-available/default | grep proxy_pass
```

#### **Connection Timeout or 000 Status**
```bash
# Check network connectivity
ping v1api.materialshub.gr

# Check DNS resolution
nslookup v1api.materialshub.gr

# Check SSL certificate
curl -I https://v1api.materialshub.gr

# Test local endpoint
curl http://localhost:8000/health
```

### 🚀 Deployment Issues

#### **Deployment Fails During Health Check**
1. **Check Service Status**:
   ```bash
   sudo systemctl status mivaa-pdf-extractor
   sudo journalctl -u mivaa-pdf-extractor --since "5 minutes ago"
   ```

2. **Verify Environment Variables**:
   ```bash
   # Check if all required variables are set
   sudo systemctl show mivaa-pdf-extractor --property=Environment
   ```

3. **Test Local Endpoints**:
   ```bash
   curl http://localhost:8000/health
   curl http://localhost:8000/docs
   ```

4. **Check Dependencies**:
   ```bash
   # Verify Python environment
   which python3
   python3 --version

   # Check installed packages
   pip list | grep fastapi
   ```

#### **Service Fails to Start**
```bash
# Check service configuration
sudo systemctl cat mivaa-pdf-extractor

# Check for port conflicts
sudo lsof -i :8000

# Verify file permissions
ls -la /path/to/mivaa-pdf-extractor/

# Check Python path and virtual environment
which python3
echo $VIRTUAL_ENV
```

### 📊 Performance Issues

#### **Slow Response Times**
```bash
# Monitor system resources
htop
free -h
df -h

# Check service logs for errors
sudo journalctl -u mivaa-pdf-extractor --since "1 hour ago" | grep ERROR

# Test endpoint response time
time curl https://v1api.materialshub.gr/health
```

#### **High Memory Usage**
```bash
# Check memory usage by service
ps aux | grep mivaa | awk '{print $4, $11}'

# Monitor memory over time
watch -n 5 'free -h && ps aux | grep mivaa'

# Check for memory leaks in logs
sudo journalctl -u mivaa-pdf-extractor | grep -i memory
```

### 🔧 Auto-Recovery Troubleshooting

#### **Auto-Recovery Fails**
When the automatic recovery system fails to restore service:

1. **Manual Service Restart**:
   ```bash
   sudo systemctl stop mivaa-pdf-extractor
   sleep 5
   sudo systemctl start mivaa-pdf-extractor
   ```

2. **Check Service Dependencies**:
   ```bash
   # Verify database connectivity
   curl -X POST https://bgbavxtjlbvgplozizxu.supabase.co/rest/v1/rpc/ping \
     -H "apikey: your-anon-key"

   # Check external API connectivity
   curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://api.openai.com/v1/models
   ```

3. **Rebuild Service**:
   ```bash
   cd /path/to/mivaa-pdf-extractor
   git pull origin main
   pip install -r requirements.txt
   sudo systemctl restart mivaa-pdf-extractor
   ```

### 🔍 Diagnostic Commands

#### **Quick Health Check**
```bash
# Test all endpoints
curl https://v1api.materialshub.gr/health
curl https://v1api.materialshub.gr/docs
curl https://v1api.materialshub.gr/redoc
curl https://v1api.materialshub.gr/openapi.json
```

#### **Service Status Check**
```bash
# Complete service status
sudo systemctl status mivaa-pdf-extractor --no-pager --lines=20

# Recent logs
sudo journalctl -u mivaa-pdf-extractor --since "10 minutes ago" --no-pager

# Error logs only
sudo journalctl -u mivaa-pdf-extractor --priority=err --since "1 hour ago"
```

#### **System Resource Check**
```bash
# System overview
uptime
free -h
df -h /

# Network status
ss -tlnp | grep :8000
netstat -tlnp | grep :8000

# Process information
ps aux | grep mivaa
pgrep -f mivaa-pdf-extractor
```

### 🚨 Emergency Procedures

#### **Service Down - Immediate Recovery**
```bash
# 1. Quick restart
sudo systemctl restart mivaa-pdf-extractor

# 2. If restart fails, check logs
sudo journalctl -u mivaa-pdf-extractor --since "5 minutes ago"

# 3. Kill and restart if necessary
sudo pkill -f mivaa-pdf-extractor
sudo systemctl start mivaa-pdf-extractor

# 4. Verify recovery
curl https://v1api.materialshub.gr/health
```

#### **Complete System Recovery**
```bash
# 1. Stop service
sudo systemctl stop mivaa-pdf-extractor

# 2. Clear logs
sudo journalctl --vacuum-time=1d

# 3. Update code
cd /path/to/mivaa-pdf-extractor
git pull origin main

# 4. Reinstall dependencies
pip install -r requirements.txt

# 5. Restart service
sudo systemctl start mivaa-pdf-extractor

# 6. Monitor startup
sudo journalctl -u mivaa-pdf-extractor -f
```

## 🔗 Related Documentation

- [Setup & Configuration](./setup-configuration.md) - Initial setup issues
- [Security & Authentication](./security-authentication.md) - Security problems
- [API Documentation](./api-documentation.md) - API issues
- [Deployment Guide](./deployment-guide.md) - Deployment problems
- [MIVAA Service](./mivaa-service.md) - MIVAA-specific documentation
