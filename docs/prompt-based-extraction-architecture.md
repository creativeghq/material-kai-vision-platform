# Prompt-Based Extraction Architecture

## Overview

All extraction services in the Material Kai Vision Platform follow a **prompt-based architecture** where extraction logic is controlled by AI prompts stored in the database, not hardcoded in services.

This document describes the standardized approach for building extraction services.

---

## Architecture Principles

### 1. Database-Driven Prompts

All extraction prompts are stored in the `prompts` table with:
- `prompt_type` = 'extraction'
- `stage` = extraction stage (discovery, entity_creation, image_analysis, etc.)
- `category` = what to extract (products, factory_documents, icon_metadata, etc.)
- `prompt_text` = detailed AI instructions (2000-10000 chars)
- `workspace_id` = workspace for custom prompts
- `is_active` = true/false
- `version` = version number for tracking changes

### 2. AI-Powered Extraction

Services use AI (Claude/GPT) to interpret data and extract information:
- Load prompt from database
- Pass data to AI with prompt
- Parse structured JSON response
- Store results with confidence scores

### 3. No Hardcoded Logic

**❌ WRONG:**
```python
# Hardcoded patterns
PATTERNS = {
    'slip_resistance': [r'\bR11\b', r'\bR12\b'],
    'fire_rating': [r'\bA1\b', r'\bA2\b']
}
```

**✅ CORRECT:**
```python
# Load prompt from database
prompt = load_prompt(stage='image_analysis', category='icon_metadata')
# Use AI to interpret
result = ai_extract(data, prompt)
```

---

## Current Extraction Prompts

### 1. Product Discovery
- **Stage:** `discovery`
- **Category:** `products`
- **Name:** Discovery - Products
- **Purpose:** Identify products in PDF catalogs with variants, colors, packaging

### 2. Product Entity Creation
- **Stage:** `entity_creation`
- **Category:** `products`
- **Name:** Product Entity Creation
- **Purpose:** Create structured product entities from discovered data

### 3. Material Properties
- **Stage:** `entity_creation`
- **Category:** `material_properties`
- **Name:** Material Properties Extraction
- **Purpose:** Extract technical specifications and material properties

### 4. Factory Documents
- **Stage:** `entity_creation`
- **Category:** `factory_documents`
- **Name:** Factory Document Extraction
- **Purpose:** Extract factory-level documents (regulations, cleaning, installation, warranty)

### 5. Factory Metadata
- **Stage:** `entity_creation`
- **Category:** `factory_metadata`
- **Name:** Factory Metadata Extraction
- **Purpose:** Extract global factory info (country, certifications, standards)

### 6. Icon Metadata
- **Stage:** `image_analysis`
- **Category:** `icon_metadata`
- **Name:** Icon-Based Metadata Extraction
- **Purpose:** Extract technical specs from icons (R11, A1, CE, PEI ratings)

### 7. Product Image Analysis
- **Stage:** `image_analysis`
- **Category:** `products`
- **Name:** Product Image Analysis
- **Purpose:** Analyze product images for visual characteristics

---

## How to Build a New Extraction Service

### Step 1: Create Database Prompt

```sql
INSERT INTO prompts (
  workspace_id,
  prompt_type,
  stage,
  category,
  name,
  prompt_text,
  status,
  is_active,
  version
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'extraction',
  'entity_creation',
  'my_category',
  'My Extraction Name',
  'Detailed AI instructions here...',
  'active',
  true,
  1
);
```

### Step 2: Create Service Class

```python
class MyExtractionService:
    def __init__(self, workspace_id: str):
        self.supabase = get_supabase_client()
        self.workspace_id = workspace_id
        self.ai_logger = AICallLogger()
        self._load_prompt()
    
    def _load_prompt(self):
        result = self.supabase.table('prompts') \\
            .select('prompt_text') \\
            .eq('workspace_id', self.workspace_id) \\
            .eq('prompt_type', 'extraction') \\
            .eq('stage', 'entity_creation') \\
            .eq('category', 'my_category') \\
            .eq('is_active', True) \\
            .order('version', desc=True) \\
            .limit(1) \\
            .execute()
        
        self.prompt = result.data[0]['prompt_text'] if result.data else None
    
    async def extract(self, data):
        # Build full prompt
        full_prompt = f"{self.prompt}\\n\\nData:\\n{data}"
        
        # Call AI
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2048,
            messages=[{"role": "user", "content": full_prompt}]
        )
        
        # Parse JSON response
        result = json.loads(response.content[0].text)
        return result
```

### Step 3: Integrate into Pipeline

Add service call to appropriate PDF processing stage.

---

## Benefits

1. **Flexibility:** Change extraction logic by updating prompts, no code changes
2. **Versioning:** Track prompt changes with version numbers
3. **Customization:** Workspace-specific prompts for different use cases
4. **Consistency:** All services follow same pattern
5. **Maintainability:** No scattered hardcoded logic
6. **Testability:** Easy to test with different prompts

---

## Admin Management

Prompts can be managed through:
- `/admin/ai-configs` - Extraction prompts tab
- Direct database updates
- API endpoints (future)

All changes are tracked in `prompt_history` table.

