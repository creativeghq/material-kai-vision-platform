# Enhanced Implementation Plan: Category-Based Extraction with Admin Prompt Control

## Executive Summary

This enhanced plan incorporates critical requirements:
1. **Database Field Definitions** - Precise Supabase schema with all fields defined
2. **Process Preservation** - Ensure existing working processes aren't broken
3. **Admin Prompt Customization** - Admin can modify prompts at each pipeline stage
4. **Agent-Driven Prompts** - Agents send simple prompts (e.g., "extract products") that get enhanced by backend
5. **Prompt Engineering** - Backend adds clarifications, context, and details for accuracy

---

## Key Architectural Principles

### 1. **Prompt Enhancement Pipeline**
```
Agent Input: "extract products"
    ↓
Backend Enhancement Service
    ├─ Add context from workspace settings
    ├─ Add category-specific instructions
    ├─ Add quality thresholds
    ├─ Add output format requirements
    ↓
Enhanced Prompt: "Extract products with [detailed instructions]"
    ↓
AI Model (Claude/GPT)
    ↓
Structured Results
```

### 2. **Admin Prompt Configuration**
- Admin can customize prompts for each stage
- Prompts stored in database with versioning
- Fallback to defaults if custom prompts not set
- Audit trail of all prompt modifications

### 3. **Database-First Approach**
- All fields defined in Supabase before code
- Schema migrations tracked
- Field validation at API level
- Type safety throughout

---

## Phase 1: Database Schema & Admin Configuration

### 1.1 New Tables Required

**extraction_prompts** - Store customizable prompts
```sql
CREATE TABLE extraction_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  stage VARCHAR(50) NOT NULL,  -- 'discovery', 'chunking', 'image_analysis', 'entity_creation'
  category VARCHAR(50) NOT NULL,  -- 'products', 'certificates', 'logos', 'specifications'
  prompt_template TEXT NOT NULL,
  system_prompt TEXT,
  is_custom BOOLEAN DEFAULT false,
  version INT DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id, stage, category, version)
);

CREATE TABLE extraction_prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES extraction_prompts(id),
  old_prompt TEXT,
  new_prompt TEXT,
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  changed_at TIMESTAMP DEFAULT NOW()
);
```

**extraction_config** - Store extraction settings
```sql
CREATE TABLE extraction_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  enabled_categories TEXT[] DEFAULT ARRAY['products'],
  default_categories TEXT[] DEFAULT ARRAY['products'],
  discovery_model VARCHAR(50) DEFAULT 'claude',
  chunk_size INT DEFAULT 1000,
  chunk_overlap INT DEFAULT 200,
  enable_prompt_enhancement BOOLEAN DEFAULT true,
  quality_threshold FLOAT DEFAULT 0.7,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id)
);
```

**document_chunks** - Add category field
```sql
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS category VARCHAR(50);
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS extraction_stage VARCHAR(50);
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS prompt_version INT;
```

### 1.2 Admin Endpoints for Prompt Management

```python
# GET /api/admin/extraction-prompts
# List all prompts for workspace

# GET /api/admin/extraction-prompts/{stage}/{category}
# Get specific prompt

# PUT /api/admin/extraction-prompts/{stage}/{category}
# Update prompt with audit trail

# GET /api/admin/extraction-prompts/history/{prompt_id}
# View prompt change history

# POST /api/admin/extraction-config
# Update extraction configuration
```

---

## Phase 2: Prompt Enhancement Service

### 2.1 Backend Enhancement Architecture

**File**: `mivaa-pdf-extractor/app/services/prompt_enhancement_service.py`

```python
class PromptEnhancementService:
    """Enhance agent prompts with context and instructions"""
    
    async def enhance_prompt(
        self,
        agent_prompt: str,
        stage: str,
        category: str,
        workspace_id: str,
        context: Dict[str, Any]
    ) -> EnhancedPrompt:
        """
        Transform simple agent prompt into detailed extraction prompt
        
        Example:
        Input: "extract products"
        Output: "Extract products with [detailed instructions, format, quality checks]"
        """
        
        # 1. Get custom prompt from database
        custom_prompt = await self.get_custom_prompt(
            workspace_id, stage, category
        )
        
        # 2. Parse agent intent
        intent = await self.parse_agent_intent(agent_prompt)
        
        # 3. Build enhancement context
        enhancement_context = {
            'workspace_settings': await self.get_workspace_settings(workspace_id),
            'category_guidelines': self.get_category_guidelines(category),
            'quality_thresholds': await self.get_quality_thresholds(workspace_id),
            'previous_results': context.get('previous_results'),
            'document_context': context.get('document_context')
        }
        
        # 4. Enhance prompt
        enhanced = await self.build_enhanced_prompt(
            agent_prompt,
            custom_prompt or self.get_default_prompt(stage, category),
            enhancement_context
        )
        
        return enhanced
```

### 2.2 Prompt Templates by Stage

**Stage 0: Discovery**
```
Base: "Identify products in this PDF"
Enhanced: "Identify products with:
- Product name and variants
- Page ranges
- Designer/brand information
- Material and finish details
- Dimensions and specifications
- Related products
Return JSON with confidence scores"
```

**Stage 1: Chunking**
```
Base: "Create semantic chunks"
Enhanced: "Create semantic chunks of [size] with [overlap]:
- Preserve product context
- Keep related information together
- Extract key properties
- Maintain readability
Return chunks with metadata"
```

---

## Phase 3: Agent Integration

### 3.1 Agent Endpoint Enhancement

**File**: `src/api/agents.ts` (update)

```typescript
// Agent sends simple prompt
POST /api/agents/mivaa-search-agent/execute
{
  "task": "extract products",
  "context": {
    "documentId": "...",
    "categories": ["products"],
    "stage": "discovery"
  }
}

// Backend:
// 1. Receives "extract products"
// 2. Calls PromptEnhancementService
// 3. Gets enhanced prompt with admin customizations
// 4. Sends to AI model
// 5. Returns structured results
```

### 3.2 Prompt Enhancement Middleware

```typescript
// New middleware in API layer
async function enhanceAgentPrompt(req, res, next) {
  const { task, context } = req.body;
  
  // Call backend enhancement service
  const enhanced = await promptEnhancementService.enhance(
    task,
    context.stage,
    context.categories[0],
    context.workspaceId
  );
  
  // Attach to request
  req.enhancedPrompt = enhanced;
  next();
}
```

---

## Phase 4: Process Preservation

### 4.1 Backward Compatibility

- Keep existing endpoints working
- Add new endpoints alongside old ones
- Gradual migration path
- Feature flags for new behavior

### 4.2 Testing Strategy

- Test each stage independently
- Validate database operations
- Verify prompt enhancement
- Check admin customizations
- Ensure no data loss

---

## Implementation Checklist

### Database Setup
- [ ] Create extraction_prompts table
- [ ] Create extraction_prompt_history table
- [ ] Create extraction_config table
- [ ] Add category column to document_chunks
- [ ] Add extraction_stage column to document_chunks
- [ ] Add prompt_version column to document_chunks
- [ ] Create indexes for performance

### Backend Services
- [ ] Create PromptEnhancementService
- [ ] Create AdminPromptService
- [ ] Update ProductDiscoveryService
- [ ] Add prompt enhancement middleware
- [ ] Create prompt template library

### Admin Panel
- [ ] Create prompt editor UI
- [ ] Add prompt history viewer
- [ ] Create extraction config panel
- [ ] Add audit trail display
- [ ] Create prompt testing interface

### API Endpoints
- [ ] GET /api/admin/extraction-prompts
- [ ] PUT /api/admin/extraction-prompts/{stage}/{category}
- [ ] GET /api/admin/extraction-config
- [ ] PUT /api/admin/extraction-config
- [ ] POST /api/admin/extraction-prompts/test

### Testing
- [ ] Unit tests for PromptEnhancementService
- [ ] Integration tests for admin endpoints
- [ ] E2E tests for full workflow
- [ ] Backward compatibility tests

---

## Success Criteria

✅ Admin can customize prompts for each stage  
✅ Agent prompts are enhanced with context  
✅ Database fields properly defined  
✅ Existing processes continue working  
✅ Audit trail tracks all changes  
✅ Quality thresholds enforced  
✅ No data loss during migration  
✅ All tests passing  

---

## Timeline

- **Week 1**: Database schema + Admin endpoints
- **Week 2**: Prompt enhancement service
- **Week 3**: Agent integration + Testing
- **Week 4**: Admin UI + Documentation

