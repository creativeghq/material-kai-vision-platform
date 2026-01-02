# XML Import Orchestrator API

## Overview

The XML Import Orchestrator API handles intelligent XML file imports with automatic field detection, AI-powered mapping suggestions, and product creation.

**Edge Function:** `xml-import-orchestrator`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/xml-import-orchestrator`

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

## Request Format

**Method:** `POST`  
**Path:** `/`

**Request:**
```typescript
{
  workspace_id: string,                      // Required
  category: string,                          // Required - Product category
  xml_content: string,                       // Required - Base64 encoded XML
  source_name?: string,                      // Optional - Source identifier
  mapping_template_id?: string,              // Optional - Use existing template
  field_mappings?: Record<string, string>,   // Optional - Custom mappings
  preview_only?: boolean,                    // Optional - Only detect fields
  generate_preview?: boolean,                // Optional - Generate sample product
  manual_values?: {                          // Optional - Manual field values
    factory_name?: string,
    name?: string,
    material_category?: string
  }
}
```

## Modes of Operation

### 1. Preview Mode (Field Detection)

Detect all fields in the XML without creating products.

**Request:**
```typescript
{
  workspace_id: 'workspace-123',
  category: 'flooring',
  xml_content: '<base64-encoded-xml>',
  preview_only: true
}
```

**Response:**
```typescript
{
  success: true,
  detected_fields: Array<{
    xml_field: string,           // Field name in XML
    sample_values: string[],     // Sample values from XML
    suggested_mapping: string,   // AI-suggested target field
    confidence: number,          // Confidence score (0-1)
    data_type: string           // Detected data type
  }>,
  suggested_mappings: {
    'xml_field_name': 'target_field_name',
    // ... more mappings
  },
  total_products: number
}
```

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('xml-import-orchestrator', {
  body: {
    workspace_id: 'workspace-123',
    category: 'flooring',
    xml_content: btoa(xmlString),  // Base64 encode
    preview_only: true
  }
});

console.log('Detected fields:', data.detected_fields);
console.log('Suggested mappings:', data.suggested_mappings);
```

### 2. Preview Product Mode

Generate a sample product with applied mappings.

**Request:**
```typescript
{
  workspace_id: 'workspace-123',
  category: 'flooring',
  xml_content: '<base64-encoded-xml>',
  field_mappings: {
    'product_name': 'name',
    'product_description': 'description',
    'manufacturer': 'factory_name',
    'category': 'material_category'
  },
  generate_preview: true
}
```

**Response:**
```typescript
{
  success: true,
  preview_product: {
    name: string,
    description: string,
    factory_name: string,
    factory_group_name?: string,
    material_category: string,
    images?: string[],
    metadata: Record<string, any>
  },
  total_products: number
}
```

### 3. Full Import Mode

Create products from XML with specified mappings.

**Request:**
```typescript
{
  workspace_id: 'workspace-123',
  category: 'flooring',
  xml_content: '<base64-encoded-xml>',
  source_name: 'Supplier ABC',
  field_mappings: {
    'product_name': 'name',
    'product_description': 'description',
    'manufacturer': 'factory_name',
    'category': 'material_category',
    'image_url': 'images'
  },
  manual_values: {
    factory_name: 'ABC Manufacturing',
    material_category: 'Wood Flooring'
  }
}
```

**Response:**
```typescript
{
  success: true,
  job_id: string,              // Import job ID for tracking
  message: string,
  total_products: number
}
```

## Field Mappings

### Standard Target Fields

| Target Field | Description | Required |
|-------------|-------------|----------|
| `name` | Product name | Yes |
| `description` | Product description | No |
| `factory_name` | Manufacturer name | Yes |
| `factory_group_name` | Manufacturer group | No |
| `material_category` | Material category | Yes |
| `images` | Product images (URLs) | No |
| `price` | Product price | No |
| `sku` | SKU/Product code | No |
| `dimensions` | Product dimensions | No |
| `weight` | Product weight | No |
| `color` | Product color | No |
| `finish` | Surface finish | No |
| `material` | Material composition | No |

### Custom Metadata Fields

Any unmapped fields are stored in the `metadata` object:

```typescript
{
  name: 'Oak Flooring',
  factory_name: 'ABC Manufacturing',
  metadata: {
    custom_field_1: 'value1',
    custom_field_2: 'value2',
    // ... other unmapped fields
  }
}
```

## AI-Powered Field Detection

The system uses AI to:
1. **Detect field types** - Identify data types (string, number, URL, etc.)
2. **Suggest mappings** - Match XML fields to standard fields
3. **Calculate confidence** - Provide confidence scores for suggestions
4. **Extract sample values** - Show sample data for verification

## Supported XML Formats

The system supports multiple XML structures:

```xml
<!-- Format 1: Standard product elements -->
<products>
  <product>
    <name>Product Name</name>
    <description>Description</description>
  </product>
</products>

<!-- Format 2: Item elements -->
<catalog>
  <item>
    <title>Product Name</title>
    <details>Description</details>
  </item>
</catalog>

<!-- Format 3: Material elements -->
<materials>
  <material>
    <product_name>Product Name</product_name>
    <product_desc>Description</product_desc>
  </material>
</materials>
```

## Import Job Tracking

After creating an import job, track its progress:

```typescript
// Get job status
const { data: job } = await supabase
  .from('data_import_jobs')
  .select('*')
  .eq('id', jobId)
  .single();

console.log('Status:', job.status);
console.log('Progress:', job.processed_count, '/', job.total_count);
```

## Error Handling

```typescript
{
  success: false,
  error: string,
  details?: object
}
```

**Common Errors:**
- `400` - Invalid XML format, missing required parameters
- `401` - Unauthorized
- `422` - XML parsing error
- `500` - Internal server error

## Best Practices

1. **Always preview first** - Use `preview_only: true` to verify field detection
2. **Review mappings** - Check AI suggestions before full import
3. **Test with sample** - Use `generate_preview: true` to see a sample product
4. **Provide manual values** - Supply required fields if not in XML
5. **Use templates** - Save successful mappings as templates for reuse

## Related Documentation

- [XML Import Orchestrator](../xml-import-orchestrator.md)
- [Data Import System](../data-import-system.md)
- [Field Templates](../field-templates.md)

