# XML Import Orchestrator Edge Function

## Overview

Edge Function for parsing XML files and orchestrating product imports into Material-KAI platform. This function handles the initial XML parsing, validation, and job creation, then delegates to the Python API for batch processing.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: DATA INGESTION (EDGE FUNCTION)                    │
│ ├─ Parse XML file (Deno XML parser)                        │
│ ├─ Validate structure                                      │
│ ├─ Extract product elements                                │
│ ├─ Create data_import_jobs record                          │
│ └─ Return job_id to frontend                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: DATA PROCESSING (PYTHON API)                      │
│ ├─ Batch process products (10 at a time)                   │
│ ├─ Download images (5 concurrent)                          │
│ ├─ Extract metadata (AI-based)                             │
│ ├─ Normalize to NormalizedProductData                      │
│ ├─ Queue for product creation                              │
│ └─ Update job status in real-time                          │
└─────────────────────────────────────────────────────────────┘
```

## Supported XML Formats

The function supports multiple common XML schemas:

### Format 1: Products
```xml
<products>
  <product>
    <name>Product Name</name>
    <factory>Manufacturer Inc</factory>
    <category>tiles</category>
    <description>Product description</description>
    <price>$50</price>
    <image>https://example.com/image1.jpg</image>
    <image>https://example.com/image2.jpg</image>
  </product>
</products>
```

### Format 2: Items
```xml
<items>
  <item>
    <title>Product Name</title>
    <manufacturer>Manufacturer Inc</manufacturer>
    <material_type>tiles</material_type>
    <desc>Product description</desc>
  </item>
</items>
```

### Format 3: Materials
```xml
<materials>
  <material>
    <name>Product Name</name>
    <supplier>Manufacturer Inc</supplier>
    <type>tiles</type>
  </material>
</materials>
```

## Required Fields

Each product must have:
- **name** (or title, product_name)
- **factory_name** (or manufacturer, supplier, factory)
- **material_category** (or category, material_type, type)

## Optional Fields

- description (or desc)
- factory_group_name (or factory_group, group)
- images (image, img, picture tags)
- price
- color/colors
- dimensions/size
- designer
- collection
- finish
- material

## API Endpoint

```
POST /functions/v1/xml-import-orchestrator
```

## Request Format

```typescript
{
  "workspace_id": "uuid",
  "category": "materials",
  "xml_content": "base64-encoded-xml-string",
  "source_name": "supplier_catalog.xml" // optional
}
```

## Response Format

### Success
```json
{
  "success": true,
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Import job created, processing started",
  "total_products": 50
}
```

### Error
```json
{
  "success": false,
  "error": "Product validation failed: Product 1: Missing factory_name"
}
```

## Usage Example

### JavaScript/TypeScript
```typescript
import { supabase } from '@/integrations/supabase/client';

async function importXMLFile(file: File, workspaceId: string, category: string) {
  // Read file as text
  const xmlText = await file.text();
  
  // Encode to base64
  const xmlBase64 = btoa(xmlText);
  
  // Call Edge Function
  const { data, error } = await supabase.functions.invoke('xml-import-orchestrator', {
    body: {
      workspace_id: workspaceId,
      category: category,
      xml_content: xmlBase64,
      source_name: file.name,
    },
  });
  
  if (error) {
    console.error('Import failed:', error);
    return null;
  }
  
  console.log('Import started:', data);
  return data.job_id;
}
```

### cURL
```bash
# Encode XML file to base64
XML_BASE64=$(base64 -w 0 catalog.xml)

# Call Edge Function
curl -X POST \
  "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/xml-import-orchestrator" \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"workspace_id\": \"your-workspace-id\",
    \"category\": \"materials\",
    \"xml_content\": \"$XML_BASE64\",
    \"source_name\": \"catalog.xml\"
  }"
```

## Job Status Tracking

After receiving the job_id, track progress using:

```typescript
// Poll for job status
const { data: job } = await supabase
  .from('data_import_jobs')
  .select('*')
  .eq('id', jobId)
  .single();

console.log('Job status:', job.status);
console.log('Progress:', `${job.processed_products}/${job.total_products}`);
```

## Database Tables

### data_import_jobs
Tracks import job status and progress.

```sql
SELECT 
  id,
  status,
  total_products,
  processed_products,
  failed_products,
  created_at,
  completed_at
FROM data_import_jobs
WHERE workspace_id = 'your-workspace-id'
ORDER BY created_at DESC;
```

### data_import_history
Tracks individual product imports.

```sql
SELECT 
  id,
  job_id,
  product_id,
  processing_status,
  source_data,
  normalized_data
FROM data_import_history
WHERE job_id = 'your-job-id';
```

## Error Handling

The function validates:
1. Required parameters (workspace_id, category, xml_content)
2. Authentication (valid JWT token)
3. XML structure (valid XML format)
4. Product data (required fields present)

Common errors:
- `Missing required parameters` - Check request body
- `Authentication failed` - Check authorization header
- `XML parsing error` - Invalid XML format
- `Product validation failed` - Missing required fields
- `No product elements found` - Unsupported XML schema

## Performance

- **Timeout**: 600 seconds (Edge Function limit)
- **Memory**: 128MB (Edge Function limit)
- **Recommended file size**: < 10MB
- **Recommended product count**: < 1000 products per file

For larger files, split into multiple smaller files.

## Environment Variables

Required in Supabase Edge Function settings:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access
- `PYTHON_API_URL` - Python API endpoint (default: https://v1api.materialshub.gr)

## Next Steps

After job creation:
1. Python API processes products in batches
2. Downloads images from URLs
3. Extracts metadata using AI
4. Creates product records
5. Updates job status to 'completed'

See Python API documentation for details on batch processing.

## Related Documentation

- [Data Import Hub Architecture](../../../docs/data-import-hub.md)
- [Python API Import Endpoints](../../../mivaa-pdf-extractor/docs/import-api.md)
- [Database Schema](../../../supabase/migrations/20251110_create_data_import_tables.sql)

