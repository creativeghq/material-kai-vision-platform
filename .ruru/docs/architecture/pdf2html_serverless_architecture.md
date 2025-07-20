+++
id = "PDF2HTML-SERVERLESS-ARCH-V1"
title = "PDF2HTML Serverless Architecture Design"
context_type = "architecture"
scope = "Serverless deployment architecture for pdf2html PDF processing solution"
target_audience = ["core-architect", "dev-backend", "lead-backend", "framework-nextjs", "baas-supabase"]
granularity = "detailed"
status = "active"
last_updated = "2025-07-20"
tags = ["pdf-processing", "serverless", "supabase", "vercel", "edge-functions", "pdf2html", "architecture"]
related_context = [
    ".ruru/decisions/ADR-001_PDF_Processing_Solution_Evaluation.md",
    "src/services/hybridPDFPipeline.ts",
    "supabase/functions/convertapi-pdf-processor/index.ts"
]
template_schema_doc = ".ruru/templates/toml-md/08_architecture.README.md"
relevance = "High: Defines serverless deployment strategy for PDF processing migration"
+++

# PDF2HTML Serverless Architecture Design

## Executive Summary

This document defines a **serverless architecture** for deploying the pdf2html solution as a replacement for ConvertAPI, focusing on **simplicity, cost-effectiveness, and seamless integration** with the existing Supabase infrastructure.

**Primary Recommendation:** Supabase Edge Functions
**Alternative:** Vercel Functions
**Complexity:** Low (No Kubernetes required)
**Timeline:** 1-2 weeks implementation

## Architecture Overview

### Current State
```
React Frontend → HybridPDFPipelineService → Supabase Edge Function → ConvertAPI
```

### Target State (Supabase Edge Functions)
```
React Frontend → HybridPDFPipelineService → Supabase Edge Function → pdf2html (Self-hosted)
```

### Target State (Vercel Alternative)
```
React Frontend → HybridPDFPipelineService → Vercel Function → pdf2html (Self-hosted)
```

## Primary Solution: Supabase Edge Functions

### Architecture Components

#### 1. Supabase Edge Function
**Location:** `supabase/functions/pdf2html-processor/`

**Key Benefits:**
- **Zero Infrastructure Management**: No servers, containers, or Kubernetes
- **Seamless Integration**: Direct access to Supabase database and storage
- **Built-in Authentication**: Leverage existing Supabase auth
- **Cost Effective**: Pay-per-execution model
- **Auto-scaling**: Handles traffic spikes automatically

#### 2. Function Structure
```typescript
// supabase/functions/pdf2html-processor/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { pdf2html } from "npm:pdf2html@latest"

serve(async (req) => {
  try {
    // Extract PDF from request
    const formData = await req.formData()
    const pdfFile = formData.get('pdf') as File
    const pdfBuffer = await pdfFile.arrayBuffer()
    
    // Process with pdf2html
    const htmlResult = await pdf2html.html(Buffer.from(pdfBuffer), {
      bufferSize: 1024 * 1024 * 10 // 10MB buffer
    })
    
    // Return structured response
    return new Response(JSON.stringify({
      success: true,
      html: htmlResult.html,
      metadata: {
        pages: htmlResult.pages,
        processingTime: Date.now() - startTime
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500 })
  }
})
```

#### 3. API Specification

**Endpoint:** `https://[project-id].supabase.co/functions/v1/pdf2html-processor`

**Request Format:**
```typescript
// Multipart form data
FormData {
  pdf: File,           // PDF file to process
  options?: {          // Optional processing options
    bufferSize?: number,
    extractImages?: boolean,
    preserveLayout?: boolean
  }
}
```

**Response Format:**
```typescript
interface ProcessingResponse {
  success: boolean
  html?: string
  metadata?: {
    pages: number
    processingTime: number
    fileSize: number
  }
  error?: string
}
```

#### 4. Integration with HybridPDFPipelineService

**Modified Service Call:**
```typescript
// src/services/hybridPDFPipeline.ts
async function processWithPdf2Html(pdfBuffer: ArrayBuffer): Promise<ProcessingResult> {
  const formData = new FormData()
  formData.append('pdf', new Blob([pdfBuffer], { type: 'application/pdf' }))
  
  const response = await fetch(
    `${supabaseUrl}/functions/v1/pdf2html-processor`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: formData
    }
  )
  
  const result = await response.json()
  
  if (!result.success) {
    throw new Error(`PDF processing failed: ${result.error}`)
  }
  
  return {
    html: result.html,
    metadata: result.metadata
  }
}
```

### Deployment Process

#### 1. Setup Supabase Function
```bash
# Install Supabase CLI
npm install -g supabase

# Create new function
supabase functions new pdf2html-processor

# Deploy function
supabase functions deploy pdf2html-processor
```

#### 2. Environment Configuration
```bash
# Set environment variables
supabase secrets set PDF_PROCESSING_BUFFER_SIZE=10485760
supabase secrets set PDF_MAX_FILE_SIZE=50485760
```

#### 3. Database Permissions
```sql
-- Grant necessary permissions for function
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pdf_processing_logs TO anon, authenticated;
```

### Performance & Scaling

#### Resource Limits
- **Memory**: 512MB per function instance
- **Timeout**: 60 seconds per request
- **Concurrent Executions**: Auto-scaling based on demand
- **File Size Limit**: 50MB (configurable)

#### Performance Targets
- **Processing Time**: < 10 seconds for typical PDFs (< 10MB)
- **Cold Start**: < 2 seconds
- **Throughput**: 100+ concurrent requests
- **Availability**: 99.9% uptime

### Cost Analysis

#### Supabase Edge Functions Pricing
- **Free Tier**: 500,000 function invocations/month
- **Pro Tier**: $0.00000325 per invocation after free tier
- **Bandwidth**: Included in Supabase plan

#### Cost Comparison (Monthly)
```
Current ConvertAPI: $200-500/month (usage-based)
Supabase Edge Functions: $10-50/month (typical usage)
Savings: 80-95% cost reduction
```

## Alternative Solution: Vercel Functions

### Architecture Overview

#### 1. Vercel Function Setup
**Location:** `api/pdf2html-processor.ts`

```typescript
// api/pdf2html-processor.ts
import { NextRequest, NextResponse } from 'next/server'
import { pdf2html } from 'pdf2html'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const pdfFile = formData.get('pdf') as File
    const pdfBuffer = await pdfFile.arrayBuffer()
    
    const result = await pdf2html.html(Buffer.from(pdfBuffer))
    
    return NextResponse.json({
      success: true,
      html: result.html,
      metadata: {
        pages: result.pages,
        processingTime: Date.now() - startTime
      }
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

export const config = {
  maxDuration: 60, // 60 seconds timeout
  memory: 512,     // 512MB memory
}
```

#### 2. Deployment Configuration
```json
// vercel.json
{
  "functions": {
    "api/pdf2html-processor.ts": {
      "maxDuration": 60,
      "memory": 512
    }
  },
  "env": {
    "PDF_PROCESSING_BUFFER_SIZE": "10485760"
  }
}
```

#### 3. Integration
```typescript
// Modified service call for Vercel
const response = await fetch('/api/pdf2html-processor', {
  method: 'POST',
  body: formData
})
```

### Vercel vs Supabase Comparison

| Feature | Supabase Edge Functions | Vercel Functions |
|---------|------------------------|------------------|
| **Integration** | Native Supabase access | Requires API calls |
| **Authentication** | Built-in | Manual implementation |
| **Database Access** | Direct | Via API/SDK |
| **Cold Start** | ~1-2s | ~1-3s |
| **Memory Limit** | 512MB | 1GB (Pro) |
| **Timeout** | 60s | 60s |
| **Cost** | Lower | Moderate |
| **Deployment** | Supabase CLI | Git-based |

## Security Considerations

### 1. Authentication & Authorization
```typescript
// Supabase Edge Function with auth
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? ''
)

// Verify user authentication
const authHeader = req.headers.get('Authorization')
const { data: { user }, error } = await supabase.auth.getUser(
  authHeader?.replace('Bearer ', '') ?? ''
)

if (error || !user) {
  return new Response('Unauthorized', { status: 401 })
}
```

### 2. Input Validation
```typescript
// File size and type validation
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_TYPES = ['application/pdf']

if (pdfFile.size > MAX_FILE_SIZE) {
  return new Response('File too large', { status: 413 })
}

if (!ALLOWED_TYPES.includes(pdfFile.type)) {
  return new Response('Invalid file type', { status: 400 })
}
```

### 3. Rate Limiting
```typescript
// Simple rate limiting
const rateLimiter = new Map()

const userKey = user.id
const now = Date.now()
const windowMs = 60 * 1000 // 1 minute
const maxRequests = 10

const userRequests = rateLimiter.get(userKey) || []
const recentRequests = userRequests.filter(time => now - time < windowMs)

if (recentRequests.length >= maxRequests) {
  return new Response('Rate limit exceeded', { status: 429 })
}

recentRequests.push(now)
rateLimiter.set(userKey, recentRequests)
```

## Monitoring & Observability

### 1. Logging Strategy
```typescript
// Structured logging
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'INFO',
  event: 'pdf_processing_started',
  userId: user.id,
  fileSize: pdfFile.size,
  fileName: pdfFile.name
}))
```

### 2. Error Tracking
```typescript
// Error handling with context
try {
  // Processing logic
} catch (error) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    event: 'pdf_processing_failed',
    error: error.message,
    stack: error.stack,
    userId: user.id,
    fileSize: pdfFile.size
  }))
  
  throw error
}
```

### 3. Performance Metrics
```typescript
// Performance tracking
const startTime = Date.now()
// ... processing ...
const processingTime = Date.now() - startTime

console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'METRIC',
  event: 'pdf_processing_completed',
  processingTime,
  fileSize: pdfFile.size,
  pages: result.pages
}))
```

## Migration Strategy

### Phase 1: Development & Testing (Week 1)
1. **Setup Development Environment**
   - Create Supabase Edge Function
   - Implement pdf2html integration
   - Add basic error handling

2. **Local Testing**
   - Test with sample PDFs
   - Validate output format
   - Performance benchmarking

3. **Integration Testing**
   - Modify HybridPDFPipelineService
   - Test end-to-end workflow
   - Validate error scenarios

### Phase 2: Deployment & Validation (Week 2)
1. **Production Deployment**
   - Deploy Edge Function to production
   - Configure environment variables
   - Set up monitoring

2. **Gradual Rollout**
   - A/B test with 10% traffic
   - Monitor performance metrics
   - Compare results with ConvertAPI

3. **Full Migration**
   - Switch 100% traffic to new solution
   - Remove ConvertAPI integration
   - Update documentation

### Rollback Strategy
```typescript
// Feature flag for easy rollback
const USE_PDF2HTML = Deno.env.get('USE_PDF2HTML') === 'true'

if (USE_PDF2HTML) {
  // Use new pdf2html solution
  return await processPdfWithPdf2Html(pdfBuffer)
} else {
  // Fallback to ConvertAPI
  return await processPdfWithConvertApi(pdfBuffer)
}
```

## Disaster Recovery

### 1. Function Redundancy
- Supabase Edge Functions automatically replicated across regions
- No single point of failure
- Automatic failover handling

### 2. Error Handling
```typescript
// Graceful degradation
try {
  return await processPdfWithPdf2Html(pdfBuffer)
} catch (error) {
  console.error('pdf2html processing failed, attempting fallback')
  
  // Optional: Fallback to ConvertAPI temporarily
  if (ENABLE_CONVERTAPI_FALLBACK) {
    return await processPdfWithConvertApi(pdfBuffer)
  }
  
  throw new Error('PDF processing unavailable')
}
```

### 3. Monitoring & Alerts
- Set up Supabase monitoring dashboards
- Configure alerts for function failures
- Monitor processing times and error rates

## Implementation Checklist

### Prerequisites
- [ ] Supabase project with Edge Functions enabled
- [ ] pdf2html npm package compatibility verified
- [ ] Development environment configured

### Development Tasks
- [ ] Create `supabase/functions/pdf2html-processor/` directory
- [ ] Implement Edge Function with pdf2html integration
- [ ] Add input validation and error handling
- [ ] Implement authentication and rate limiting
- [ ] Add structured logging and monitoring

### Testing Tasks
- [ ] Unit tests for Edge Function
- [ ] Integration tests with HybridPDFPipelineService
- [ ] Performance testing with various PDF sizes
- [ ] Error scenario testing
- [ ] Load testing for concurrent requests

### Deployment Tasks
- [ ] Deploy Edge Function to staging environment
- [ ] Configure production environment variables
- [ ] Set up monitoring and alerting
- [ ] Deploy to production with feature flag
- [ ] Conduct gradual rollout

### Post-Deployment Tasks
- [ ] Monitor performance metrics
- [ ] Validate cost savings
- [ ] Update documentation
- [ ] Remove ConvertAPI dependencies
- [ ] Conduct post-implementation review

## Conclusion

The serverless architecture using **Supabase Edge Functions** provides a **simple, cost-effective, and scalable** solution for PDF processing that eliminates the complexity of Kubernetes while maintaining high performance and reliability.

**Key Benefits:**
- **80-95% cost reduction** compared to ConvertAPI
- **Zero infrastructure management** - no Kubernetes complexity
- **Seamless integration** with existing Supabase infrastructure
- **Auto-scaling** and high availability out of the box
- **1-2 week implementation timeline**

This approach aligns perfectly with the user's preference for avoiding Kubernetes complexity while delivering all the benefits of the pdf2html migration.