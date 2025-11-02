# Prompt Enhancement System

## Overview

The **Prompt Enhancement System** transforms simple agent prompts (e.g., "Search for Nova") into detailed, comprehensive extraction prompts using admin-configured templates and contextual enrichment.

This system enables:
- **Admin Control**: Customize extraction prompts through admin panel
- **Agent Simplicity**: Agents send simple requests, backend handles complexity
- **Quality Assurance**: Consistent, high-quality extraction across all documents
- **Flexibility**: Easy to update prompts without code changes

---

## Architecture

```
┌─────────────────┐
│  Agent Request  │  "Search for Nova"
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  PromptEnhancementService               │
│  1. Parse agent intent                  │
│  2. Load admin template from database   │
│  3. Add workspace context               │
│  4. Build enhanced prompt               │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Enhanced Prompt                        │
│  "Analyze this PDF catalog and         │
│   identify ALL products...              │
│   SPECIAL: Focus on finding 'Nova'...  │
│   [Full detailed instructions]"         │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Claude/GPT AI  │  Processes with full context
└─────────────────┘
```

---

## How It Works

### 1. Agent Sends Simple Prompt

**Example Agent Requests:**
```
"extract products"
"search for NOVA"
"find certificates"
"get all logos"
```

### 2. System Enhances Prompt

The `PromptEnhancementService` enhances the prompt by:

1. **Parsing Intent**: Understands what the agent wants
   - "search for NOVA" → Find specific product named "NOVA"
   - "extract products" → Extract all products comprehensively

2. **Loading Admin Template**: Retrieves custom prompt from database
   - Stage: `discovery`
   - Category: `products`
   - Workspace: User's workspace ID

3. **Adding Context**: Enriches with workspace settings
   - Quality thresholds
   - Document metadata
   - Previous extraction results

4. **Building Final Prompt**: Combines everything
   - Admin template (detailed instructions)
   - Agent intent (specific focus)
   - Workspace context (quality requirements)
   - PDF content (actual data to analyze)

### 3. AI Processes Enhanced Prompt

Claude/GPT receives the full, detailed prompt and returns comprehensive results.

---

## Admin Prompt Management

### Database Schema

**Table: `extraction_prompts`**
```sql
CREATE TABLE extraction_prompts (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    stage TEXT NOT NULL,  -- 'discovery', 'chunking', 'image_analysis', 'entity_creation'
    category TEXT NOT NULL,  -- 'products', 'certificates', 'logos', 'specifications'
    name TEXT NOT NULL,
    template TEXT NOT NULL,  -- The actual prompt template
    description TEXT,
    quality_threshold FLOAT DEFAULT 0.7,
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by UUID,
    updated_by UUID
);
```

### Default Prompts

Default prompts are seeded using:
```bash
cd mivaa-pdf-extractor
python scripts/seed_default_prompts.py
```

**Default Prompts Include:**
- `discovery/products` - Comprehensive product extraction
- `discovery/certificates` - Certificate and compliance discovery
- `discovery/logos` - Logo and brand mark identification
- `discovery/specifications` - Technical specification extraction

### Customizing Prompts

**Via Admin API:**
```bash
# Get current prompt
GET /api/admin/extraction-prompts/discovery/products

# Update prompt
PUT /api/admin/extraction-prompts/discovery/products
{
  "template": "Your custom prompt template...",
  "quality_threshold": 0.8,
  "description": "Updated for better accuracy"
}

# View history
GET /api/admin/extraction-prompts/history/{prompt_id}
```

**Via Admin Panel:**
1. Navigate to Admin → Extraction Prompts
2. Select stage and category
3. Edit template in rich text editor
4. Test prompt before saving
5. Save and version automatically increments

---

## Example: "Search for Nova"

### Input
```json
{
  "agent_prompt": "search for NOVA",
  "categories": ["products"],
  "workspace_id": "ffafc28b-1b8b-4b0d-b226-9f9a6154004e"
}
```

### Enhancement Process

**Step 1: Parse Intent**
```python
{
  "action": "search",
  "target": "NOVA",
  "category": "products",
  "specificity": "high"
}
```

**Step 2: Load Admin Template**
```
Analyze this PDF catalog and identify ALL products with complete metadata.

**REQUIRED INFORMATION:**
- Product name and all variants
- Page ranges where product appears
- Designer/brand/studio information
...
```

**Step 3: Add Context**
```python
{
  "workspace_settings": {
    "quality_threshold": 0.7,
    "preferred_models": ["claude-sonnet-4-5"]
  },
  "document_context": {
    "total_pages": 52,
    "pdf_preview": "HARMONY COLLECTION..."
  }
}
```

**Step 4: Build Enhanced Prompt**
```
You are analyzing a material/product catalog PDF with 52 pages.

**USER REQUEST:** "search for NOVA"

Your task is to identify and extract content across the following categories:

**PRODUCTS:**
Analyze this PDF catalog and identify ALL products with complete metadata.
[Full admin template...]

**SPECIAL HANDLING FOR USER REQUEST:**
- User mentioned specific product name: "NOVA"
- Prioritize finding this product
- Provide comprehensive results with high confidence scores
- Include all variants, dimensions, and metadata for NOVA

**OUTPUT FORMAT (JSON):**
{
  "products": [
    {
      "name": "NOVA",
      "designer": "...",
      ...
    }
  ],
  ...
}

**PDF CONTENT:**
[First 50,000 characters of PDF text]

Analyze the above content and return ONLY valid JSON...
```

### Output
```json
{
  "products": [
    {
      "name": "NOVA",
      "designer": "SG NY",
      "studio": "SG NY",
      "page_range": [12, 13, 14],
      "dimensions": ["15×38", "20×40"],
      "variants": [
        {"type": "color", "value": "beige"},
        {"type": "finish", "value": "matte"}
      ],
      "category": "tiles",
      "metafields": {
        "slip_resistance": "R11",
        "fire_rating": "A1",
        "thickness": "8mm"
      },
      "confidence": 0.95
    }
  ],
  "total_products": 1,
  "confidence_score": 0.95
}
```

---

## API Integration

### Upload with Agent Prompt

```bash
POST /api/rag/documents/upload
Content-Type: multipart/form-data

file: harmony.pdf
categories: products
agent_prompt: search for NOVA
enable_prompt_enhancement: true
workspace_id: ffafc28b-1b8b-4b0d-b226-9f9a6154004e
```

### Response
```json
{
  "job_id": "abc-123",
  "document_id": "doc-456",
  "status": "processing",
  "message": "Document upload started with products extraction",
  "status_url": "/api/rag/documents/job/abc-123",
  "categories": ["products"],
  "discovery_model": "claude",
  "prompt_enhancement_enabled": true
}
```

---

## Benefits

### For Admins
✅ **Full Control**: Customize extraction prompts without code changes  
✅ **Version History**: Track all prompt changes with audit trail  
✅ **Quality Tuning**: Adjust quality thresholds per category  
✅ **Testing**: Test prompts before deploying to production  

### For Agents
✅ **Simplicity**: Send simple requests like "search for Nova"  
✅ **Consistency**: Always get high-quality, detailed results  
✅ **Flexibility**: No need to know extraction details  

### For System
✅ **Maintainability**: Update prompts without code deployment  
✅ **Scalability**: Easy to add new categories and stages  
✅ **Quality**: Consistent extraction across all documents  
✅ **Auditability**: Full history of prompt changes  

---

## Best Practices

### Writing Good Prompts

1. **Be Specific**: Clearly define what to extract
2. **Provide Examples**: Show expected output format
3. **Set Quality Bars**: Define minimum confidence scores
4. **Handle Edge Cases**: Account for variations in documents
5. **Use Structured Output**: Request JSON for easy parsing

### Testing Prompts

```bash
POST /api/admin/extraction-prompts/test
{
  "stage": "discovery",
  "category": "products",
  "template": "Your test prompt...",
  "test_content": "Sample PDF text..."
}
```

### Monitoring Performance

- Track confidence scores per prompt version
- Monitor extraction accuracy
- Review failed extractions
- Iterate on prompts based on results

---

## Future Enhancements

- [ ] A/B testing for prompts
- [ ] Auto-optimization based on results
- [ ] Multi-language prompt support
- [ ] Prompt templates marketplace
- [ ] AI-assisted prompt generation

