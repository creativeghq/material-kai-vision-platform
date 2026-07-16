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
  category: string,                          // Required for import mode — applied as material_category to every product
  xml_content: string,                       // Required - Base64 encoded XML
  source_name?: string,                      // Optional - Source identifier
  mapping_template_id?: string,              // Optional - Use existing template
  field_mappings?: Record<string, string>,   // Optional - operator-confirmed XML tag → target mappings
  preview_only?: boolean,                    // Optional - run dictionary + AI residual, return detected fields with coverage
  generate_preview?: boolean,                // Optional - apply mappings to one product, return sample + value sources
  manual_values?: Record<string, string>     // Optional - per-target job-level fallbacks applied when the mapped XML tag is empty.
                                             //   Any target name is accepted (name, factory_name, price, color, dimensions, etc.).
                                             //   Used by the Fill-the-Gaps UI to fill empty rows in sparse feeds — see Coverage Semantics below.
}
```

**Architecture note:** field detection uses a **dictionary-first** lookup ([_shared/xml-field-dictionary.ts](../../supabase/functions/_shared/xml-field-dictionary.ts), ~150 entries covering English/Spanish/French/German/Greek + ERP shorthand). Tags resolved with confidence ≥ 0.85 skip the AI call entirely; only the residual is sent to `claude-haiku-4-5` with the dictionary's low-confidence guesses as priors. Stable feeds typically resolve 70-100% via dictionary, dropping per-preview cost from ~$0.02 to ~$0.0001.

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
    xml_field: string,           // Field name in XML (lowercased by parser)
    sample_values: string[],     // Up to 3 sample values
    suggested_mapping: string,   // Dictionary or AI verdict
    confidence: number,          // 0.0-1.0; ≥0.85 means dictionary-confident, skipped AI
    data_type: string,           // 'string' | 'number' | 'url' | 'text'
    total_rows: number,          // Total product rows in the XML
    present_count: number,       // Rows where this field is non-empty
    coverage_pct: number,        // present_count / total_rows × 100 (1 decimal place)
    distinct_values: number      // Distinct value count (capped at 200)
  }>,
  suggested_mappings: {
    'xml_field_name': 'target_field_name',
    // ... more mappings
  },
  total_rows: number             // Mirror of detected_fields[].total_rows for convenience
}
```

The coverage stats drive the **Fill-the-Gaps** panel — the UI uses `coverage_pct` to render per-target status (✅ full / 🟡 partial / 🔴 zero / 🟠 conflict) so the operator sees exactly which targets need a manual fallback.

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
    description?: string,
    factory_name: string,
    factory_group_name?: string,
    factory_address?, factory_city?, factory_country?, factory_postal_code?: string,
    factory_phone?, factory_email?, factory_website?: string,
    factory_country_of_origin?, factory_founded_year?, factory_employee_count?, factory_linkedin_url?: string,
    material_category: string,
    images: string[],
    metadata: Record<string, any>,
    // Attribute fields mirrored top-level when mapped (read directly by Python — see Downstream Contract):
    price?: string, color?: string, colors?: string, dimensions?: string, size?: string,
    designer?: string, collection?: string, finish?: string, material?: string,
    product_id?: string, sku?: string
  },
  preview_value_sources: Record<string, 'xml' | 'default'>,
                                              // Per-target provenance: 'xml' = value came from the mapped tag,
                                              // 'default' = filled from manual_values. UI uses this to render
                                              // "from XML" / "from default" badges on each rendered field.
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
    factory_name: 'ABC Manufacturing',     // Fallback applied per-row when <Manufacturer> is empty
    price: '0.00',                          // Fallback for sparse <PriceW> rows
    description: 'Imported from ABC catalog'
  }
}
```

**Coverage semantics:** `manual_values[target]` is applied **per row, only when the mapped XML tag for that target is missing or empty**. It is NEVER an override — rows that have a real value in the XML keep it. The Fill-the-Gaps UI shows the operator how many empty rows each fallback will fill before they submit.

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

`material_category` is **not in this list** — it's set at the upload screen (job-level), not mapped from the XML, and applied to every product the orchestrator emits.

| Target Field | Description | Required | Notes |
|-------------|-------------|----------|-------|
| `name` | Product name | Yes | Top-level on ProductData |
| `factory_name` | Manufacturer name | Yes | Top-level on ProductData |
| `description` | Product description | No | Top-level; chunker skips if < 50 chars |
| `factory_group_name` | Manufacturer group | No | Top-level |
| `factory_address` / `factory_city` / `factory_country` / `factory_postal_code` | Manufacturer location | No | All top-level; mirrored into `metadata.factory.{address,city,country,postal_code}` |
| `factory_phone` / `factory_email` / `factory_website` | Manufacturer contact | No | All top-level; mirrored into `metadata.factory.*` |
| `factory_country_of_origin` / `factory_founded_year` / `factory_employee_count` / `factory_linkedin_url` | Manufacturer profile | No | Mirrored into `metadata.factory.*` |
| `images` | Product image URLs | No | Top-level array; orchestrator splits comma-separated, falls back to `<image_link>`/`<img>`/`<picture>` |
| `external_sku` | SKU / product code | No | Writes to `metadata.product_id` + top-level `product_id` / `sku` (Python checks all three for re-import dedup) |
| `price` | Product price | No | Top-level + `metadata.price` (canonicalization whitelist) |
| `color` / `colors` | Color | No | Top-level + `metadata.color` |
| `dimensions` / `size` | Physical dimensions | No | Top-level + `metadata.dimensions` |
| `designer` / `collection` | Design metadata | No | Top-level + `metadata.designer` / `metadata.collection` |
| `finish` / `material` | Surface / composition | No | Top-level + `metadata.finish` / `metadata.material` (whitelisted for facet canonicalization) |

### Custom Metadata Fields

XML fields not mapped to a known target — or explicitly routed to `metadata` — are stored in the `metadata` JSONB blob under their lowercase XML tag name:

```typescript
{
  name: 'Oak Flooring',
  factory_name: 'ABC Manufacturing',
  metadata: {
    custom_field_1: 'value1',           // unmapped XML tag, lowercased
    barcode: '5206735027427',           // matched the regex rule → metadata
    // ... other unmapped fields
  }
}
```

## Field Detection: Dictionary-First, AI Residual

Field detection is a two-stage hybrid (see [_shared/xml-field-dictionary.ts](../../supabase/functions/_shared/xml-field-dictionary.ts) + the `suggestFieldMappings` function in the orchestrator):

1. **Dictionary lookup** — every detected tag is checked against ~150 multilingual entries + regex rules (image1/dim2/barcode13/etc.). Hits with confidence ≥ 0.85 are returned as-is, no API call.
2. **AI residual** — only fields the dictionary couldn't confidently match (ambiguous or unknown) are sent to `claude-haiku-4-5` in a single batched prompt, with the dictionary's low-confidence guesses passed as priors so the model can confirm or override.
3. **Graceful degradation** — if Anthropic API is unavailable, the residual falls back to the ambiguous dictionary guesses (better than nothing); fully unknown fields default to `metadata` at 0.5 confidence.

**Cost / latency** for a typical 17-field feed: dictionary alone resolves ~70-100% of tags. AI call hits 3-5 residual fields with Haiku → ~$0.0001 + ~1-2s. Compare to the previous all-fields-to-Opus path: ~$0.005-0.02 + ~2-4s.

**Extending coverage** for a new language or supplier: edit [_shared/xml-field-dictionary.ts](../../supabase/functions/_shared/xml-field-dictionary.ts), redeploy. No logic changes needed.

## Downstream Contract (Python `/api/import/process`)

The orchestrator writes products to `data_import_job_products.product_data` JSONB. The Python pipeline reads these keys directly with `product_data.get(key)`:

| Python read site | Source key | Used for |
|---|---|---|
| [data_import_service.py:551](../../mivaa-pdf-extractor/app/services/integrations/data_import_service.py) | `name`, `factory_name`, `material_category` | Stage 4 product insert |
| [data_import_service.py:599](../../mivaa-pdf-extractor/app/services/integrations/data_import_service.py) | `price`, `dimensions` | `properties` JSONB column |
| [data_import_service.py:628](../../mivaa-pdf-extractor/app/services/integrations/data_import_service.py) | `product_id` / `sku` / `metadata.product_id` | Re-import dedup key |
| [data_import_service.py:678](../../mivaa-pdf-extractor/app/services/integrations/data_import_service.py) | `color`, `designer`, `collection`, `finish`, `material` (top-level OR `metadata.*` fallback) | Voyage 1024D text embedding |
| [data_import_service.py:413](../../mivaa-pdf-extractor/app/services/integrations/data_import_service.py) | `images[]` | Image download → `document_images` |
| [facet_canonicalizer.py:142](../../mivaa-pdf-extractor/app/services/facets/facet_canonicalizer.py) | `metadata.color`, `metadata.material`, `metadata.finish`, etc. (whitelist) | Multilingual facet canonicalization |

If you add new attribute targets to the orchestrator, mirror them BOTH at the top level of `product_data` AND in `metadata` under the canonical target name — otherwise downstream consumers will silently skip them.

## AI-Powered Field Detection

The dictionary + AI residual provides:
1. **Field types** - Inferred from sample values (string / number / url / text)
2. **Suggested mappings** - Dictionary first, Haiku residual
3. **Confidence scores** - 0.0-1.0; ≥0.85 = dictionary-confident, lower = AI-confirmed or AI-fallback
4. **Sample values** - Up to 3 per field for operator verification
5. **Coverage stats** - Per-field `present_count` / `total_rows` / `coverage_pct` so the Fill-the-Gaps UI can show "mapped from `<Manufacturer>`, present in 312/418 rows (74%)"

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

1. **Always preview first** - Use `preview_only: true` to surface coverage stats + conflicts before committing
2. **Resolve conflicts explicitly** - When ≥2 XML tags map to the same target (e.g. `<PriceW>` + `<PriceRetail>` → `price`), the Fill-the-Gaps UI shows a picker; pick one rather than letting the orchestrator silently take the first
3. **Use manual_values for sparse fields** - For supplier feeds with partial `<Manufacturer>` coverage (e.g. Panagoulas at 74%), set `manual_values.factory_name` to the supplier name so the missing rows still import instead of being dropped
4. **Generate preview before import** - `generate_preview: true` returns `preview_value_sources` so you can see which fields will come from XML vs default
5. **Use templates** - Save confirmed mappings as `xml_mapping_templates` rows for reuse on next refresh of the same feed
6. **Pick category up front** - Operators set the job-level category on the upload screen; do not include `material_category` in `field_mappings`

## Related Documentation

- [XML Import Orchestrator](../xml-import-orchestrator.md)
- [Data Import System](../data-import-system.md)
- [Category Field Registry](../category-field-registry.md)

