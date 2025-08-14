# Supabase Functions MCP Sync Guide

## Overview

This guide demonstrates how to use the Model Context Protocol (MCP) with the Supabase MCP server to synchronize missing Edge Functions from your deployed Supabase project to your local environment.

## Current Status

**✅ MCP Connection Verified**: Successfully connected to Supabase project `bgbavxtjlbvgplozizxu` (KAI)

**📊 Function Count Analysis**:
- **Deployed Functions**: 21 functions (confirmed via MCP)
- **Local Functions**: 18 functions
- **Missing Locally**: 11 functions need to be synced

## Deployed Functions (Retrieved via MCP)

The following 21 functions are currently deployed and active in your Supabase project:

### Core Material Analysis Functions
1. **material-recognition** - Material identification and classification
2. **ai-material-analysis** - AI-powered material analysis with hybrid providers
3. **hybrid-material-analysis** - Multi-provider material analysis with validation
4. **material-properties-analysis** - Comprehensive material properties extraction
5. **style-analysis** - Material style and aesthetic analysis

### Search and Knowledge Functions
6. **vector-similarity-search** - Vector-based material similarity search
7. **voice-to-material** - Voice input processing for material descriptions
8. **rag-knowledge-search** - RAG-based knowledge retrieval
9. **enhanced-rag-search** - Enhanced RAG search with multiple sources

### 3D Generation and Processing
10. **crewai-3d-generation** - Multi-model 3D interior design generation
11. **huggingface-model-trainer** - ML model training with Hugging Face
12. **nerf-processor** - NeRF 3D reconstruction processing
13. **svbrdf-extractor** - SVBRDF material property extraction
14. **enhanced-crewai** - Advanced CrewAI agent orchestration
15. **spaceformer-analysis** - Spatial reasoning and layout optimization

### Document Processing Functions
16. **ocr-processing** - OCR text extraction from images
17. **pdf-processor** - Basic PDF processing and text extraction
18. **enhanced-pdf-processor** - Advanced PDF processing with image extraction
19. **azure-pdf-processor** - Azure Document Intelligence integration
20. **hybrid-pdf-processor** - Hybrid PDF processing with multiple methods
21. **html-pdf-processor** - PDF to HTML conversion processing

### Additional Processing Functions
22. **enhanced-pdf-html-processor** - Enhanced PDF-to-HTML with layout awareness
23. **hybrid-pdf-pipeline** - Comprehensive PDF processing pipeline
24. **convertapi-pdf-processor** - ConvertAPI-based PDF processing
25. **material-scraper** - Web scraping for material data
26. **scrape-session-manager** - Session management for scraping operations
27. **scrape-single-page** - Single page scraping functionality
28. **parse-sitemap** - Sitemap parsing for bulk scraping
29. **pdf-integration-health** - Health monitoring for PDF integrations
30. **pdf-extract** - PDF extraction service
31. **pdf-batch-process** - Batch PDF processing
32. **api-gateway** - API gateway and routing

## MCP-Based Sync Methods

### Method 1: Individual Function Download

Use the Supabase MCP server to download specific functions:

```typescript
// Example: Download a specific function
const functionData = await mcpClient.use_tool('supabase', 'get_edge_function', {
  project_id: 'bgbavxtjlbvgplozizxu',
  function_slug: 'hybrid-material-analysis'
});
```

### Method 2: Bulk Function Retrieval

Retrieve all functions and filter for missing ones:

```typescript
// Get all deployed functions
const allFunctions = await mcpClient.use_tool('supabase', 'list_edge_functions', {
  project_id: 'bgbavxtjlbvgplozizxu'
});

// Filter for missing functions
const missingFunctions = allFunctions.filter(func => 
  !localFunctions.includes(func.slug)
);
```

## Missing Functions to Sync

Based on our audit, the following 11 functions are deployed but missing locally:

1. **ai-material-analysis** (1 invocation)
2. **analyze-knowledge-content** (1 invocation) 
3. **document-vector-search** (1 invocation)
4. **extract-material-knowledge** (1 invocation)
5. **hybrid-material-analysis** (2 invocations) - **CONFIRMED DEPLOYED**
6. **material-properties-analysis** (3 invocations)
7. **pdf-processor** (1 invocation)
8. **style-analysis** (1 invocation)
9. **vector-similarity-search** (1 invocation)
10. **voice-to-material** (2 invocations)

## Next Steps

1. **Use MCP to Download Functions**: Leverage the Supabase MCP server to programmatically download the missing function code
2. **Verify Function Integrity**: Compare downloaded functions with deployment to ensure consistency
3. **Update Local Environment**: Add the downloaded functions to your local `supabase/functions/` directory
4. **Test Locally**: Verify that the functions work correctly in your local development environment
5. **Commit Changes**: Add the synced functions to your git repository

## Benefits of MCP Approach

- **Programmatic Access**: Direct API access to Supabase management functions
- **Automated Sync**: Can be scripted for regular synchronization
- **Version Control**: Ensures you get the exact deployed version
- **Metadata Preservation**: Maintains function configuration and settings
- **Batch Operations**: Can process multiple functions efficiently

## Alternative Methods

If MCP is not available, you can still use:
1. **Supabase CLI**: `supabase functions download --project-ref bgbavxtjlbvgplozizxu`
2. **Dashboard Download**: Manual download from Supabase dashboard
3. **Git-based Sync**: If functions are stored in a separate repository

## Verification Commands

After syncing, verify the functions:

```bash
# List local functions
ls -la supabase/functions/

# Check function count
find supabase/functions/ -name "index.ts" | wc -l

# Verify specific function exists
ls -la supabase/functions/hybrid-material-analysis/
```

## Troubleshooting

- **Authentication Issues**: Ensure MCP server has proper Supabase credentials
- **Network Connectivity**: Verify connection to Supabase services
- **Permission Errors**: Check that your account has access to the project
- **Function Conflicts**: Handle any naming conflicts with existing local files

---

*Generated on: 2025-08-14*
*Project: Material Kai Vision Platform*
*Supabase Project: bgbavxtjlbvgplozizxu (KAI)*