+++
id = "PDF-PROCESSING-SERVERLESS-ALTERNATIVES-V1"
title = "PDF Processing Serverless Alternatives (Java Runtime Constraint)"
context_type = "architecture"
scope = "Alternative PDF processing solutions for serverless environments without Java runtime"
target_audience = ["core-architect", "dev-backend", "lead-backend", "framework-nextjs", "baas-supabase"]
granularity = "detailed"
status = "active"
last_updated = "2025-07-20"
tags = ["pdf-processing", "serverless", "javascript", "pdf-js", "alternatives", "java-constraint"]
related_context = [
    ".ruru/decisions/ADR-001_PDF_Processing_Solution_Evaluation.md",
    ".ruru/docs/architecture/pdf2html_serverless_architecture.md",
    "src/services/hybridPDFPipeline.ts"
]
template_schema_doc = ".ruru/templates/toml-md/08_architecture.README.md"
relevance = "Critical: Addresses Java runtime incompatibility with serverless environments"
+++

# PDF Processing Serverless Alternatives

## Critical Discovery: Java Runtime Constraint

**ISSUE IDENTIFIED:** The pdf2html package requires **Java Runtime Environment (JRE) >= 8** for Apache Tika and PDFBox, which creates a fundamental incompatibility with serverless JavaScript/TypeScript environments.

### Runtime Environment Compatibility Matrix

| Platform | Runtime | Java Support | pdf2html Compatible | Recommendation |
|----------|---------|--------------|-------------------|----------------|
| **Supabase Edge Functions** | Deno (JS/TS) | ❌ No | ❌ No | Use PDF.js alternative |
| **Vercel Functions** | Node.js | ❌ No | ❌ No | Use PDF.js alternative |
| **Netlify Functions** | Node.js | ❌ No | ❌ No | Use PDF.js alternative |
| **AWS Lambda** | Multi-runtime | ✅ Yes (Java) | ✅ Yes | Java Lambda function |
| **Google Cloud Functions** | Multi-runtime | ✅ Yes (Java) | ✅ Yes | Java Cloud Function |
| **Azure Functions** | Multi-runtime | ✅ Yes (Java) | ✅ Yes | Java Azure Function |

## Recommended Solution: PDF.js with Supabase Edge Functions

### Architecture Overview

**Primary Choice: Pure JavaScript PDF Processing**
- Use **PDF.js** instead of pdf2html (Apache Tika/PDFBox)
- Deploy on **Supabase Edge Functions** (Deno runtime)
- Maintain existing integration patterns
- No Java dependency required

### Implementation: PDF.js-based Solution

#### 1. Supabase Edge Function Implementation

```typescript
// supabase/functions/pdf-processor/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@3.11.174"

// Configure PDF.js for Deno environment
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js"

serve(async (req) => {
  const startTime = Date.now()
  
  try {
    // Extract PDF from request
    const formData = await req.formData()
    const pdfFile = formData.get('pdf') as File
    const options = JSON.parse(formData.get('options') as string || '{}')
    
    if (!pdfFile || pdfFile.type !== 'application/pdf') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid PDF file'
      }), { status: 400 })
    }
    
    const pdfBuffer = await pdfFile.arrayBuffer()
    
    // Load PDF document with PDF.js
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      disableFontFace: false,
      verbosity: 0
    }).promise
    
    let htmlContent = '<div class="pdf-document" style="position: relative;">'
    const pages = []
    
    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.0 })
      const textContent = await page.getTextContent()
      
      // Create page container
      htmlContent += `<div class="pdf-page" data-page="${pageNum}" style="position: relative; width: ${viewport.width}px; height: ${viewport.height}px; margin-bottom: 20px; border: 1px solid #ccc;">`
      
      // Extract text with positioning
      const textItems = []
      textContent.items.forEach((item: any) => {
        if (item.str && item.str.trim()) {
          const transform = item.transform
          const x = Math.round(transform[4])
          const y = Math.round(viewport.height - transform[5]) // Flip Y coordinate
          const fontSize = Math.round(transform[0])
          const fontFamily = item.fontName || 'Arial'
          
          textItems.push({
            text: item.str,
            x,
            y,
            fontSize,
            fontFamily,
            width: item.width || 0,
            height: item.height || fontSize
          })
          
          // Add positioned text element
          htmlContent += `<span style="position: absolute; left: ${x}px; top: ${y}px; font-size: ${fontSize}px; font-family: ${fontFamily}; white-space: pre;">${escapeHtml(item.str)}</span>`
        }
      })
      
      htmlContent += '</div>'
      
      // Store page metadata
      pages.push({
        pageNumber: pageNum,
        width: viewport.width,
        height: viewport.height,
        textItems: textItems.length,
        rotation: viewport.rotation
      })
    }
    
    htmlContent += '</div>'
    
    // Generate CSS for better styling
    const css = `
      .pdf-document {
        font-family: Arial, sans-serif;
        line-height: 1.2;
      }
      .pdf-page {
        background: white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        overflow: hidden;
      }
      .pdf-page span {
        display: inline-block;
        color: #333;
      }
    `
    
    const processingTime = Date.now() - startTime
    
    return new Response(JSON.stringify({
      success: true,
      html: htmlContent,
      css: css,
      metadata: {
        pages: pdf.numPages,
        pageDetails: pages,
        processingTime,
        fileSize: pdfBuffer.byteLength,
        engine: 'PDF.js',
        version: '3.11.174'
      }
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
    
  } catch (error) {
    console.error('PDF processing error:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
```

#### 2. Enhanced PDF.js with Layout Analysis

```typescript
// Advanced text extraction with layout analysis
async function extractTextWithLayout(page: any, viewport: any) {
  const textContent = await page.getTextContent()
  const textItems = []
  
  // Group text items by lines and blocks
  const lines = new Map()
  
  textContent.items.forEach((item: any) => {
    if (item.str && item.str.trim()) {
      const transform = item.transform
      const x = Math.round(transform[4])
      const y = Math.round(viewport.height - transform[5])
      const fontSize = Math.round(transform[0])
      
      // Group by Y coordinate (same line)
      const lineKey = Math.round(y / 5) * 5 // Group within 5px tolerance
      
      if (!lines.has(lineKey)) {
        lines.set(lineKey, [])
      }
      
      lines.get(lineKey).push({
        text: item.str,
        x,
        y,
        fontSize,
        fontName: item.fontName,
        width: item.width || 0
      })
    }
  })
  
  // Sort lines by Y coordinate and items within lines by X coordinate
  const sortedLines = Array.from(lines.entries())
    .sort(([a], [b]) => a - b)
    .map(([y, items]) => ({
      y,
      items: items.sort((a, b) => a.x - b.x)
    }))
  
  return sortedLines
}
```

#### 3. Integration with HybridPDFPipelineService

```typescript
// src/services/hybridPDFPipeline.ts - Modified integration
async function processWithPdfJs(pdfBuffer: ArrayBuffer): Promise<ProcessingResult> {
  const formData = new FormData()
  formData.append('pdf', new Blob([pdfBuffer], { type: 'application/pdf' }))
  formData.append('options', JSON.stringify({
    extractImages: false,
    preserveLayout: true,
    scale: 1.0
  }))
  
  const response = await fetch(
    `${supabaseUrl}/functions/v1/pdf-processor`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: formData
    }
  )
  
  if (!response.ok) {
    throw new Error(`PDF processing failed: ${response.statusText}`)
  }
  
  const result = await response.json()
  
  if (!result.success) {
    throw new Error(`PDF processing failed: ${result.error}`)
  }
  
  return {
    html: result.html,
    css: result.css,
    metadata: {
      pages: result.metadata.pages,
      processingTime: result.metadata.processingTime,
      engine: 'PDF.js',
      fileSize: result.metadata.fileSize
    }
  }
}
```

### Deployment Process

#### 1. Setup Supabase Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Create new function
supabase functions new pdf-processor

# Deploy function
supabase functions deploy pdf-processor --project-ref your-project-ref
```

#### 2. Environment Configuration

```bash
# Set environment variables (if needed)
supabase secrets set PDF_MAX_FILE_SIZE=52428800  # 50MB
supabase secrets set PDF_PROCESSING_TIMEOUT=30000  # 30 seconds
```

#### 3. Test Deployment

```bash
# Test the function locally
supabase functions serve pdf-processor

# Test with curl
curl -X POST http://localhost:54321/functions/v1/pdf-processor \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -F "pdf=@test.pdf"
```

## Alternative Solutions

### Option 1: Hybrid Approach with External Java Service

If PDF.js limitations become problematic, implement a hybrid solution:

#### 1. Primary: PDF.js for Simple PDFs
- Fast processing for standard documents
- Low latency, serverless benefits
- Handles 80% of use cases

#### 2. Fallback: External Java Service for Complex PDFs
- AWS Lambda with Java runtime
- Google Cloud Run with Java container
- Digital Ocean Droplet with pdf2html

```typescript
// Hybrid processing logic
async function processWithHybridApproach(pdfBuffer: ArrayBuffer) {
  try {
    // Try PDF.js first
    const result = await processWithPdfJs(pdfBuffer)
    
    // Quality check - if layout seems complex, use Java service
    if (result.metadata.pages > 10 || hasComplexLayout(result)) {
      console.log('Complex PDF detected, using Java service')
      return await processWithJavaService(pdfBuffer)
    }
    
    return result
  } catch (error) {
    console.log('PDF.js failed, falling back to Java service')
    return await processWithJavaService(pdfBuffer)
  }
}
```

### Option 2: AWS Lambda with Java Runtime

```java
// AWS Lambda Java function
package com.yourproject.pdf;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import org.apache.tika.Tika;
import java.util.Base64;
import java.util.Map;

public class PdfProcessor implements RequestHandler<Map<String, Object>, Map<String, Object>> {
    
    private final Tika tika = new Tika();
    
    @Override
    public Map<String, Object> handleRequest(Map<String, Object> input, Context context) {
        long startTime = System.currentTimeMillis();
        
        try {
            String pdfData = (String) input.get("pdfData");
            byte[] pdfBytes = Base64.getDecoder().decode(pdfData);
            
            // Process with Apache Tika
            String htmlContent = tika.parseToString(new ByteArrayInputStream(pdfBytes));
            
            return Map.of(
                "success", true,
                "html", htmlContent,
                "metadata", Map.of(
                    "processingTime", System.currentTimeMillis() - startTime,
                    "engine", "Apache Tika",
                    "fileSize", pdfBytes.length
                )
            );
        } catch (Exception e) {
            return Map.of(
                "success", false,
                "error", e.getMessage(),
                "processingTime", System.currentTimeMillis() - startTime
            );
        }
    }
}
```

## Comparison: PDF.js vs Apache Tika

| Feature | PDF.js (Recommended) | Apache Tika (pdf2html) |
|---------|---------------------|------------------------|
| **Runtime** | JavaScript/TypeScript | Java (JRE 8+) |
| **Serverless Compatible** | ✅ Yes (Supabase, Vercel) | ❌ No (JS environments) |
| **Cold Start** | ~500ms | ~2-5s (JVM startup) |
| **Memory Usage** | Low (50-100MB) | High (200-500MB) |
| **Text Extraction** | ✅ Excellent | ✅ Excellent |
| **Layout Preservation** | ✅ Good (with positioning) | ✅ Excellent |
| **Complex PDFs** | ⚠️ Limited | ✅ Excellent |
| **Image Extraction** | ⚠️ Requires additional work | ✅ Built-in |
| **Font Handling** | ✅ Good | ✅ Excellent |
| **Deployment Complexity** | ✅ Simple | ❌ Complex (Java setup) |
| **Cost** | ✅ Low | ⚠️ Higher (memory/compute) |

## Performance Expectations

### PDF.js Performance Targets
- **Small PDFs (< 1MB)**: < 2 seconds processing
- **Medium PDFs (1-10MB)**: < 10 seconds processing
- **Large PDFs (10-50MB)**: < 30 seconds processing
- **Memory Usage**: 50-150MB per function instance
- **Cold Start**: < 1 second
- **Concurrent Requests**: 100+ (auto-scaling)

### Quality Expectations
- **Text Extraction**: 95%+ accuracy for standard PDFs
- **Layout Preservation**: Good for simple layouts, adequate for complex
- **Font Rendering**: Basic font family mapping
- **Special Characters**: Full Unicode support

## Migration Strategy

### Phase 1: PDF.js Implementation (Week 1)
1. **Implement PDF.js Edge Function**
   - Basic text extraction
   - Layout positioning
   - Error handling

2. **Integration Testing**
   - Test with existing PDF samples
   - Validate output format compatibility
   - Performance benchmarking

### Phase 2: Production Deployment (Week 2)
1. **Deploy to Supabase**
   - Production environment setup
   - Monitoring configuration
   - Security validation

2. **Gradual Rollout**
   - A/B test with 10% traffic
   - Monitor quality metrics
   - Compare with ConvertAPI results

### Phase 3: Full Migration (Week 3)
1. **Complete Switchover**
   - 100% traffic to PDF.js solution
   - Remove ConvertAPI dependencies
   - Cost validation

2. **Optimization**
   - Performance tuning
   - Quality improvements
   - Documentation updates

## Conclusion

**Recommended Approach: PDF.js with Supabase Edge Functions**

This solution provides:
- ✅ **No Java Dependency**: Pure JavaScript/TypeScript
- ✅ **Serverless Compatibility**: Works with Supabase, Vercel, etc.
- ✅ **Cost Effective**: 80-95% cost reduction vs ConvertAPI
- ✅ **Fast Deployment**: Simple setup and deployment
- ✅ **Good Quality**: Adequate for most PDF processing needs
- ✅ **Scalable**: Auto-scaling serverless architecture

While PDF.js may not match Apache Tika's sophistication for complex PDFs, it provides a practical, cost-effective solution that eliminates infrastructure complexity and delivers significant cost savings for the majority of use cases.