# Technical Specifications: Category-Based Extraction with Admin Prompts

## Database Schema Specifications

### Table: extraction_prompts

```sql
CREATE TABLE extraction_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  stage VARCHAR(50) NOT NULL CHECK (stage IN ('discovery', 'chunking', 'image_analysis', 'entity_creation')),
  category VARCHAR(50) NOT NULL CHECK (category IN ('products', 'certificates', 'logos', 'specifications', 'global')),
  prompt_template TEXT NOT NULL,
  system_prompt TEXT,
  is_custom BOOLEAN DEFAULT false,
  version INT DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id, stage, category, version),
  INDEX idx_workspace_stage_category (workspace_id, stage, category)
);
```

### Table: extraction_prompt_history

```sql
CREATE TABLE extraction_prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES extraction_prompts(id) ON DELETE CASCADE,
  old_prompt TEXT,
  new_prompt TEXT,
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  changed_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_prompt_id (prompt_id),
  INDEX idx_changed_at (changed_at)
);
```

### Table: extraction_config

```sql
CREATE TABLE extraction_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled_categories TEXT[] DEFAULT ARRAY['products'],
  default_categories TEXT[] DEFAULT ARRAY['products'],
  discovery_model VARCHAR(50) DEFAULT 'claude' CHECK (discovery_model IN ('claude', 'gpt')),
  chunk_size INT DEFAULT 1000 CHECK (chunk_size >= 100 AND chunk_size <= 4000),
  chunk_overlap INT DEFAULT 200 CHECK (chunk_overlap >= 0 AND chunk_overlap <= 1000),
  enable_prompt_enhancement BOOLEAN DEFAULT true,
  quality_threshold FLOAT DEFAULT 0.7 CHECK (quality_threshold >= 0 AND quality_threshold <= 1),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Updated: document_chunks

```sql
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS category VARCHAR(50),
ADD COLUMN IF NOT EXISTS extraction_stage VARCHAR(50),
ADD COLUMN IF NOT EXISTS prompt_version INT,
ADD COLUMN IF NOT EXISTS confidence_score FLOAT,
ADD INDEX idx_category (category),
ADD INDEX idx_extraction_stage (extraction_stage);
```

---

## API Specifications

### Admin Endpoints

#### GET /api/admin/extraction-prompts
List all prompts for workspace
```json
Response: {
  "prompts": [
    {
      "id": "uuid",
      "stage": "discovery",
      "category": "products",
      "prompt_template": "...",
      "is_custom": true,
      "version": 2,
      "created_by": "user_id",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### PUT /api/admin/extraction-prompts/{stage}/{category}
Update prompt with audit trail
```json
Request: {
  "prompt_template": "...",
  "system_prompt": "...",
  "change_reason": "Improved accuracy for product discovery"
}

Response: {
  "id": "uuid",
  "version": 3,
  "updated_at": "2024-01-01T00:00:00Z"
}
```

#### GET /api/admin/extraction-prompts/history/{prompt_id}
View change history
```json
Response: {
  "history": [
    {
      "version": 2,
      "old_prompt": "...",
      "new_prompt": "...",
      "changed_by": "user_id",
      "change_reason": "...",
      "changed_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/admin/extraction-prompts/test
Test prompt before saving
```json
Request: {
  "stage": "discovery",
  "category": "products",
  "prompt_template": "...",
  "test_content": "Sample PDF text..."
}

Response: {
  "success": true,
  "result": "...",
  "execution_time_ms": 1234
}
```

---

## Service Specifications

### PromptEnhancementService

```python
class PromptEnhancementService:
    async def enhance_prompt(
        self,
        agent_prompt: str,
        stage: str,
        category: str,
        workspace_id: str,
        context: Dict[str, Any]
    ) -> EnhancedPrompt:
        """
        Enhance agent prompt with context and admin customizations
        
        Returns:
            EnhancedPrompt with:
            - original_prompt: str
            - enhanced_prompt: str
            - template_used: str
            - context_added: Dict
            - confidence_score: float
        """
        
    async def get_custom_prompt(
        self,
        workspace_id: str,
        stage: str,
        category: str
    ) -> Optional[str]:
        """Get custom prompt from database"""
        
    def get_default_prompt(
        self,
        stage: str,
        category: str
    ) -> str:
        """Get default prompt template"""
        
    async def parse_agent_intent(
        self,
        agent_prompt: str
    ) -> Dict[str, Any]:
        """Parse agent intent from natural language"""
        
    async def build_enhanced_prompt(
        self,
        agent_prompt: str,
        template: str,
        context: Dict[str, Any]
    ) -> str:
        """Build final enhanced prompt"""
```

---

## Data Flow Specifications

### Extraction Flow with Prompt Enhancement

```
1. Agent sends: POST /api/agents/mivaa-search-agent/execute
   {
     "task": "extract products",
     "context": {
       "documentId": "...",
       "categories": ["products"],
       "stage": "discovery"
     }
   }

2. Middleware: PromptEnhancementMiddleware
   - Extract task, stage, category
   - Call PromptEnhancementService.enhance_prompt()
   - Attach enhanced_prompt to request

3. Backend Enhancement:
   - Get custom prompt from extraction_prompts table
   - Parse agent intent
   - Load workspace settings from extraction_config
   - Build enhancement context
   - Combine template + context
   - Return enhanced prompt

4. AI Model Processing:
   - Receive enhanced prompt
   - Process with Claude/GPT
   - Return structured results

5. Result Storage:
   - Save chunks with category, extraction_stage, prompt_version
   - Store confidence scores
   - Create audit trail
```

---

## Backward Compatibility Strategy

### Feature Flags

```python
FEATURE_FLAGS = {
    'use_prompt_enhancement': True,  # Enable new system
    'keep_old_endpoints': True,      # Keep old endpoints active
    'gradual_migration': True,       # Gradual user migration
    'fallback_to_default': True      # Use defaults if custom not set
}
```

### Endpoint Mapping

```
Old Endpoint                    → New Endpoint
/documents/upload-with-discovery → /documents/upload (with categories)
/documents/upload-focused       → /documents/upload (with focused_extraction)
```

---

## Testing Specifications

### Unit Tests
- PromptEnhancementService methods
- Prompt template rendering
- Context enrichment logic
- Database CRUD operations

### Integration Tests
- Admin endpoints
- Database operations with transactions
- Agent integration
- Prompt enhancement pipeline

### E2E Tests
- Full extraction workflow
- Real PDF processing
- Admin UI interactions
- Audit trail verification

---

## Deployment Specifications

### Database Migration
1. Create new tables
2. Add columns to existing tables
3. Create indexes
4. Verify data integrity
5. Backup existing data

### Code Deployment
1. Deploy backend services
2. Deploy API endpoints
3. Deploy admin UI
4. Enable feature flags
5. Monitor for errors

### Rollback Plan
1. Disable feature flags
2. Revert database changes
3. Restore from backup
4. Verify system stability

