# PDF Integration Service Deployment Guide

This guide provides step-by-step instructions for deploying the PDF integration service to Supabase and setting up the complete system.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Migration](#database-migration)
4. [Edge Functions Deployment](#edge-functions-deployment)
5. [Configuration Verification](#configuration-verification)
6. [Testing](#testing)
7. [Monitoring and Maintenance](#monitoring-and-maintenance)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- **Supabase CLI**: Install the latest version
  ```bash
  npm install -g supabase
  ```

- **Node.js**: Version 18 or higher
- **Git**: For version control
- **curl** or **Postman**: For API testing

### Required Services

- **Supabase Project**: Active project with database access
- **Mivaa PDF Extractor**: Running instance (local or deployed)
- **API Keys**: Supabase service role key and anon key

### Required Permissions

- Supabase project admin access
- Database migration permissions
- Edge Functions deployment permissions

## Environment Setup

### 1. Clone and Setup Project

```bash
# Navigate to your project directory
cd material-kai-vision-platform

# Ensure all dependencies are installed
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual values:

```bash
# Required Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Required Mivaa Configuration
MIVAA_BASE_URL=http://localhost:8000  # or your deployed Mivaa URL
MIVAA_API_KEY=your-mivaa-api-key-here  # if required

# Security Configuration
JWT_SECRET=your-secure-jwt-secret-here  # Generate a strong random string
```

### 3. Initialize Supabase CLI

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-id
```

## Database Migration

### 1. Apply the PDF Integration Schema

```bash
# Apply the migration
supabase db push

# Verify migration was applied
supabase db diff
```

### 2. Verify Database Schema

Connect to your Supabase database and verify the following tables exist:

- `pdf_documents`
- `pdf_batch_jobs`
- `pdf_batch_items`
- `rag_documents`
- `rag_document_chunks`
- `api_usage_logs`
- `service_health_metrics`

### 3. Enable Required Extensions

Ensure the following PostgreSQL extensions are enabled:

```sql
-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgvector for embeddings (optional)
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4. Verify Row Level Security (RLS)

Check that RLS policies are properly applied:

```sql
-- Verify RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename LIKE 'pdf_%' OR tablename LIKE 'rag_%' OR tablename LIKE 'api_%' OR tablename LIKE 'service_%';
```

## Edge Functions Deployment

### 1. Deploy All Edge Functions

```bash
# Deploy all PDF integration Edge Functions
supabase functions deploy pdf-integration-health
supabase functions deploy pdf-extract
supabase functions deploy pdf-batch-process
```

### 2. Set Environment Variables for Edge Functions

```bash
# Set environment variables for Edge Functions
supabase secrets set MIVAA_BASE_URL=http://localhost:8000
supabase secrets set MIVAA_API_KEY=your-mivaa-api-key-here
supabase secrets set JWT_SECRET=your-secure-jwt-secret-here
supabase secrets set PDF_PROCESSING_TIMEOUT=300000
supabase secrets set MAX_FILE_SIZE=104857600
supabase secrets set MAX_BATCH_SIZE=100
supabase secrets set MAX_CONCURRENT_PROCESSING=10
supabase secrets set RATE_LIMIT_HEALTH_CHECK=60
supabase secrets set RATE_LIMIT_PDF_EXTRACT=10
supabase secrets set RATE_LIMIT_BATCH_PROCESS=5
supabase secrets set LOG_LEVEL=info
supabase secrets set ENABLE_METRICS=true
```

### 3. Verify Deployment

```bash
# List deployed functions
supabase functions list

# Check function logs
supabase functions logs pdf-integration-health
supabase functions logs pdf-extract
supabase functions logs pdf-batch-process
```

## Configuration Verification

### 1. Test Database Connectivity

```bash
# Test database connection
supabase db ping
```

### 2. Verify Edge Function URLs

Your Edge Functions will be available at:

- Health Check: `https://your-project-id.supabase.co/functions/v1/pdf-integration-health`
- PDF Extract: `https://your-project-id.supabase.co/functions/v1/pdf-extract`
- Batch Process: `https://your-project-id.supabase.co/functions/v1/pdf-batch-process`

### 3. Test Mivaa Service Connectivity

```bash
# Test Mivaa service health
curl -X GET "http://localhost:8000/health"

# Test Mivaa PDF extraction endpoint
curl -X GET "http://localhost:8000/extract/markdown"
```

## Testing

### 1. Health Check Test

```bash
# Test health check endpoint
curl -X GET "https://your-project-id.supabase.co/functions/v1/pdf-integration-health" \
  -H "Authorization: Bearer your-anon-key"
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-27T10:00:00.000Z",
  "services": {
    "database": "healthy",
    "mivaa": "healthy"
  },
  "metrics": {
    "response_time_ms": 150,
    "memory_usage_mb": 45
  }
}
```

### 2. PDF Extraction Test

```bash
# Test PDF extraction with a sample file
curl -X POST "https://your-project-id.supabase.co/functions/v1/pdf-extract" \
  -H "Authorization: Bearer your-anon-key" \
  -H "Content-Type: application/json" \
  -d '{
    "file_url": "https://example.com/sample.pdf",
    "workspace_id": "test-workspace",
    "extract_options": {
      "include_markdown": true,
      "include_tables": true,
      "include_images": false
    }
  }'
```

### 3. Batch Processing Test

```bash
# Test batch processing
curl -X POST "https://your-project-id.supabase.co/functions/v1/pdf-batch-process" \
  -H "Authorization: Bearer your-anon-key" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {
        "file_url": "https://example.com/doc1.pdf",
        "filename": "document1.pdf"
      },
      {
        "file_url": "https://example.com/doc2.pdf",
        "filename": "document2.pdf"
      }
    ],
    "workspace_id": "test-workspace",
    "batch_options": {
      "webhook_url": "https://your-app.com/webhook/batch-complete"
    }
  }'
```

### 4. Authentication Test

```bash
# Test with invalid token (should return 401)
curl -X POST "https://your-project-id.supabase.co/functions/v1/pdf-extract" \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 5. Rate Limiting Test

```bash
# Test rate limiting by making multiple rapid requests
for i in {1..15}; do
  curl -X GET "https://your-project-id.supabase.co/functions/v1/pdf-integration-health" \
    -H "Authorization: Bearer your-anon-key" &
done
wait
```

## Monitoring and Maintenance

### 1. Monitor Edge Function Logs

```bash
# Monitor real-time logs
supabase functions logs pdf-integration-health --follow
supabase functions logs pdf-extract --follow
supabase functions logs pdf-batch-process --follow
```

### 2. Database Monitoring

```sql
-- Monitor API usage
SELECT 
  endpoint,
  COUNT(*) as request_count,
  AVG(response_time_ms) as avg_response_time,
  COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
FROM api_usage_logs 
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY endpoint;

-- Monitor batch job status
SELECT 
  status,
  COUNT(*) as job_count,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds
FROM pdf_batch_jobs 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Monitor service health
SELECT 
  service_name,
  status,
  AVG(response_time_ms) as avg_response_time,
  MAX(created_at) as last_check
FROM service_health_metrics 
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY service_name, status;
```

### 3. Performance Monitoring

Set up alerts for:

- High error rates (>5% in 5 minutes)
- Slow response times (>5 seconds average)
- Failed health checks
- High memory usage (>80%)
- Database connection issues

### 4. Regular Maintenance Tasks

```sql
-- Clean up old logs (run weekly)
DELETE FROM api_usage_logs WHERE created_at < NOW() - INTERVAL '90 days';
DELETE FROM service_health_metrics WHERE created_at < NOW() - INTERVAL '30 days';

-- Clean up completed batch jobs (run monthly)
DELETE FROM pdf_batch_jobs 
WHERE status = 'completed' 
AND completed_at < NOW() - INTERVAL '6 months';
```

## Troubleshooting

### Common Issues

#### 1. Edge Function Deployment Fails

**Symptoms**: Deployment command returns errors

**Solutions**:
```bash
# Check Supabase CLI version
supabase --version

# Update CLI if needed
npm update -g supabase

# Check project linking
supabase projects list
supabase link --project-ref your-project-id

# Retry deployment with verbose logging
supabase functions deploy pdf-extract --debug
```

#### 2. Database Migration Fails

**Symptoms**: Migration command returns errors

**Solutions**:
```bash
# Check current migration status
supabase migration list

# Reset and reapply migrations
supabase db reset
supabase db push

# Apply specific migration
supabase migration up --target 20250127_pdf_integration_schema
```

#### 3. Mivaa Service Connection Issues

**Symptoms**: Health check shows Mivaa as unhealthy

**Solutions**:
```bash
# Check Mivaa service status
curl -X GET "http://localhost:8000/health"

# Verify network connectivity
ping localhost  # or your Mivaa host

# Check firewall settings
# Ensure port 8000 is accessible

# Update Mivaa base URL in secrets
supabase secrets set MIVAA_BASE_URL=http://your-correct-mivaa-url:8000
```

#### 4. Authentication Issues

**Symptoms**: 401 Unauthorized errors

**Solutions**:
```bash
# Verify API keys
supabase projects api-keys

# Check JWT secret configuration
supabase secrets list

# Test with correct anon key
curl -X GET "https://your-project-id.supabase.co/functions/v1/pdf-integration-health" \
  -H "Authorization: Bearer your-correct-anon-key"
```

#### 5. Rate Limiting Issues

**Symptoms**: 429 Too Many Requests errors

**Solutions**:
```bash
# Check current rate limits
supabase secrets list | grep RATE_LIMIT

# Adjust rate limits if needed
supabase secrets set RATE_LIMIT_PDF_EXTRACT=20

# Monitor rate limiting in database
SELECT * FROM api_usage_logs 
WHERE status_code = 429 
ORDER BY created_at DESC 
LIMIT 10;
```

#### 6. Memory or Timeout Issues

**Symptoms**: 500 errors, timeout errors

**Solutions**:
```bash
# Increase timeout limits
supabase secrets set PDF_PROCESSING_TIMEOUT=600000

# Reduce batch size
supabase secrets set MAX_BATCH_SIZE=50

# Monitor memory usage
supabase functions logs pdf-extract | grep -i memory
```

### Getting Help

1. **Check Logs**: Always start by checking Edge Function logs
2. **Supabase Documentation**: https://supabase.com/docs
3. **Community Support**: https://github.com/supabase/supabase/discussions
4. **Project Issues**: Check the project's issue tracker

### Rollback Procedures

#### Rollback Edge Functions

```bash
# Deploy previous version
git checkout previous-commit
supabase functions deploy pdf-extract

# Or disable function temporarily
# (Note: Supabase doesn't have a direct disable command)
# You would need to deploy a minimal function that returns maintenance mode
```

#### Rollback Database Changes

```bash
# Reset to previous migration
supabase db reset
supabase migration up --target previous-migration-timestamp
```

## Security Considerations

1. **API Keys**: Rotate API keys regularly
2. **JWT Secrets**: Use strong, unique JWT secrets
3. **Rate Limiting**: Monitor and adjust rate limits based on usage
4. **Access Control**: Implement proper RLS policies
5. **Logging**: Monitor for suspicious activity
6. **HTTPS**: Always use HTTPS in production
7. **CORS**: Configure CORS appropriately for your domain

## Performance Optimization

1. **Database Indexing**: Monitor query performance and add indexes as needed
2. **Connection Pooling**: Configure appropriate connection pool sizes
3. **Caching**: Implement caching for frequently accessed data
4. **Batch Processing**: Optimize batch sizes based on performance testing
5. **Resource Monitoring**: Set up monitoring and alerting for resource usage

This deployment guide provides a comprehensive approach to setting up the PDF integration service. Follow each step carefully and test thoroughly before deploying to production.