+++
# --- Basic Metadata ---
id = "llama-visual-search-integration-guide"
title = "LLaMA Visual Search Platform Integration Guide"
context_type = "documentation"
scope = "Integration guide for connecting visual search system with existing platform components"
target_audience = ["dev-backend", "dev-frontend", "lead-backend", "lead-frontend"]
granularity = "detailed"
status = "active"
last_updated = "2025-08-28"
tags = ["integration", "llama", "visual-search", "platform", "existing-components", "migration"]
related_context = [
    "visual-search/docs/llama-visual-search-master-plan.md",
    "visual-search/docs/technical-architecture.md",
    "visual-search/docs/phase-task-breakdown.md",
    "src/config/embedding.config.ts",
    "src/services/integratedAIService.ts",
    "src/components/Admin/AITestingPanel.tsx"
]
template_schema_doc = ".ruru/templates/toml-md/06_technical_documentation.README.md"
relevance = "Critical: Defines how new visual search integrates with existing platform"
+++

# LLaMA Visual Search Platform Integration Guide

## Overview

This guide provides detailed instructions for integrating the new LLaMA 3.2 Vision + CLIP visual search system with the existing Material Kai Vision Platform. The integration is designed to be **non-disruptive** and **backward-compatible** while adding powerful new visual search capabilities.

## Integration Strategy

### 1. Incremental Integration Approach
- **Phase 1**: Add visual search as new capabilities alongside existing features
- **Phase 2**: Enhance existing components with visual search options
- **Phase 3**: Optimize unified experience across all search modalities

### 2. Backward Compatibility
- All existing search functionality remains intact
- Existing APIs continue to work unchanged
- New visual search is additive, not replacement

## Core Integration Points

### 1. Configuration Integration

#### Update Embedding Configuration
**File**: `src/config/embedding.config.ts`

**Required Changes**:
```typescript
// Add new visual search provider configurations
export const VISUAL_SEARCH_CONFIG = {
  providers: {
    llama_vision: {
      endpoint: 'https://api.together.xyz/v1/chat/completions',
      model: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      maxTokens: 4096,
      temperature: 0.1,
      rateLimit: {
        requests: 20,
        window: 60000 // 1 minute
      }
    },
    clip: {
      endpoint: 'https://api-inference.huggingface.co/models/openai/clip-vit-large-patch14',
      dimensions: 512,
      fallbackProvider: 'openai',
      rateLimit: {
        requests: 100,
        window: 60000
      }
    },
    openai_clip: {
      endpoint: 'https://api.openai.com/v1/embeddings',
      model: 'text-embedding-3-large',
      dimensions: 1536
    }
  },
  defaultProvider: 'llama_vision',
  enableFallback: true
};

// Extend existing embedding config
export const embeddingConfig = {
  ...existingConfig,
  visualSearch: VISUAL_SEARCH_CONFIG
};
```

#### Environment Variables
**File**: `.env.local`

**Required Additions**:
```bash
# Visual Search API Keys
TOGETHER_AI_API_KEY=your_together_ai_key
HUGGINGFACE_API_KEY=your_huggingface_key

# Visual Search Configuration
ENABLE_VISUAL_SEARCH=true
VISUAL_SEARCH_DEFAULT_PROVIDER=llama_vision
VISUAL_SEARCH_RATE_LIMIT=20

# Existing keys remain unchanged
OPENAI_API_KEY=your_existing_openai_key
SUPABASE_URL=your_existing_supabase_url
SUPABASE_ANON_KEY=your_existing_supabase_key
```

### 2. Service Integration

#### Enhance Integrated AI Service
**File**: `src/services/integratedAIService.ts`

**Integration Pattern**:
```typescript
import { VISUAL_SEARCH_CONFIG } from '../config/embedding.config';
import { VisualSearchService } from './visualSearchService';

export class IntegratedAIService {
  private visualSearchService: VisualSearchService;

  constructor() {
    // Existing initialization
    this.initializeExistingServices();
    
    // Add visual search service
    this.visualSearchService = new VisualSearchService(VISUAL_SEARCH_CONFIG);
  }

  // New method: Visual search capabilities
  async performVisualSearch(options: VisualSearchOptions): Promise<VisualSearchResult[]> {
    return this.visualSearchService.search(options);
  }

  // Enhanced method: Hybrid search combining existing + visual
  async performHybridSearch(query: HybridSearchQuery): Promise<SearchResult[]> {
    const textResults = await this.performTextSearch(query.text);
    const visualResults = query.image ? 
      await this.performVisualSearch({ image: query.image, query: query.text }) : 
      [];

    return this.mergeSearchResults(textResults, visualResults);
  }

  // Existing methods remain unchanged
  async performTextSearch(query: string): Promise<SearchResult[]> {
    // Existing implementation
  }
}
```

#### Create New Visual Search Service
**File**: `src/services/visualSearchService.ts`

```typescript
export class VisualSearchService {
  private llamaVisionAPI: LlamaVisionAPI;
  private clipAPI: ClipAPI;
  private supabaseClient: SupabaseClient;

  constructor(config: VisualSearchConfig) {
    this.llamaVisionAPI = new LlamaVisionAPI(config.providers.llama_vision);
    this.clipAPI = new ClipAPI(config.providers.clip);
    this.supabaseClient = createClient(/* existing config */);
  }

  async search(options: VisualSearchOptions): Promise<VisualSearchResult[]> {
    // Implementation as per technical architecture
  }
}
```

### 3. Database Integration

#### Extend Existing Supabase Schema
**Migration**: `supabase/migrations/2025xxxx_add_visual_search.sql`

```sql
-- Add visual analysis tables (non-breaking additions)
CREATE TABLE IF NOT EXISTS material_visual_analysis (
  -- Schema as defined in database-schema.md
);

-- Extend existing materials table with visual search columns
ALTER TABLE materials ADD COLUMN IF NOT EXISTS visual_embedding_512 vector(512);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS visual_embedding_1536 vector(1536);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS llama_analysis jsonb;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS visual_analysis_confidence real;

-- Create indexes for visual search
CREATE INDEX CONCURRENTLY IF NOT EXISTS materials_visual_embedding_512_idx 
ON materials USING ivfflat (visual_embedding_512 vector_cosine_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS materials_visual_embedding_1536_idx 
ON materials USING ivfflat (visual_embedding_1536 vector_cosine_ops);
```

#### Enhance Existing Supabase Functions
**File**: `supabase/functions/vector-similarity-search/index.ts`

```typescript
// Extend existing function with visual search capabilities
export const handler = async (req: Request): Promise<Response> => {
  const { query, searchType = 'text', image, ...otherParams } = await req.json();

  switch (searchType) {
    case 'text':
      return handleTextSearch(query, otherParams);
    
    case 'visual':
      return handleVisualSearch(image, query, otherParams);
    
    case 'hybrid':
      return handleHybridSearch(query, image, otherParams);
    
    default:
      return handleTextSearch(query, otherParams); // Backward compatibility
  }
};

// Existing text search function unchanged
async function handleTextSearch(query: string, params: any) {
  // Existing implementation
}

// New visual search function
async function handleVisualSearch(image: string, query: string, params: any) {
  // Implementation using new visual search tables
}
```

### 4. Frontend Integration

#### Enhance Admin Testing Panel
**File**: `src/components/Admin/AITestingPanel.tsx`

**Integration Points**:
```typescript
import { VisualSearchInterface } from '../VisualSearch/VisualSearchInterface';

export const AITestingPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'text' | 'visual' | 'hybrid'>('text');

  return (
    <div className="ai-testing-panel">
      {/* Existing tab navigation */}
      <TabNavigation 
        tabs={['text', 'visual', 'hybrid']} 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />

      {/* Existing text search panel */}
      {activeTab === 'text' && (
        <ExistingTextSearchPanel />
      )}

      {/* New visual search panel */}
      {activeTab === 'visual' && (
        <VisualSearchInterface 
          onImageUpload={handleImageUpload}
          onTextSearch={handleTextSearch}
          onHybridSearch={handleHybridSearch}
        />
      )}

      {/* New hybrid search panel */}
      {activeTab === 'hybrid' && (
        <HybridSearchInterface />
      )}
    </div>
  );
};
```

#### Enhance Main Search Interface
**File**: `src/components/Search/SearchInterface.tsx`

```typescript
// Add visual search toggle to existing search
export const SearchInterface: React.FC = () => {
  const [searchMode, setSearchMode] = useState<'text' | 'visual'>('text');
  const [showVisualOptions, setShowVisualOptions] = useState(false);

  return (
    <div className="search-interface">
      {/* Existing search header with added visual toggle */}
      <SearchHeader>
        <SearchModeToggle 
          mode={searchMode} 
          onModeChange={setSearchMode}
          showVisualOptions={showVisualOptions}
          onToggleVisualOptions={setShowVisualOptions}
        />
      </SearchHeader>

      {/* Existing text search (unchanged) */}
      {searchMode === 'text' && (
        <ExistingTextSearchInterface />
      )}

      {/* New visual search interface */}
      {searchMode === 'visual' && (
        <VisualSearchInterface />
      )}

      {/* Enhanced search results with visual similarity */}
      <EnhancedSearchResults 
        includeVisualSimilarity={showVisualOptions}
      />
    </div>
  );
};
```

### 5. API Integration

#### Enhance Existing API Routes
**File**: `src/api/routes.ts`

```typescript
import { visualSearchController } from './controllers/visualSearchController';

// Existing routes remain unchanged
app.post('/api/search/text', existingTextSearchController);
app.post('/api/materials/analyze', existingMaterialAnalysisController);

// Add new visual search routes
app.post('/api/search/visual', visualSearchController.performVisualSearch);
app.post('/api/search/hybrid', visualSearchController.performHybridSearch);
app.post('/api/materials/visual-analysis', visualSearchController.analyzeVisualProperties);

// Enhanced existing route with visual options
app.post('/api/search/enhanced', enhancedSearchController);
```

#### Create Visual Search Controller
**File**: `src/api/controllers/visualSearchController.ts`

```typescript
export class VisualSearchController {
  private visualSearchService: VisualSearchService;
  private integratedAIService: IntegratedAIService;

  async performVisualSearch(req: Request, res: Response) {
    try {
      const { image, query, filters } = req.body;
      const results = await this.visualSearchService.search({
        image,
        query,
        filters
      });
      
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async performHybridSearch(req: Request, res: Response) {
    try {
      const results = await this.integratedAIService.performHybridSearch(req.body);
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
```

## Migration and Deployment Guide

### Phase 1: Backend Foundation (Week 1-2)

#### Step 1: Database Migration
```bash
# Apply visual search schema (non-breaking)
supabase db push

# Verify migration
supabase db diff
```

#### Step 2: Service Integration
```bash
# Install new dependencies
npm install @huggingface/inference together-ai

# Add environment variables
cp .env.example .env.local
# Add visual search API keys

# Test service integration
npm run test:integration:visual-search
```

#### Step 3: API Deployment
```bash
# Deploy new Supabase functions
supabase functions deploy visual-search

# Test API endpoints
npm run test:api:visual-search
```

### Phase 2: Frontend Integration (Week 3-4)

#### Step 1: Component Integration
```bash
# Install frontend dependencies
npm install lucide-react

# Build visual search components
npm run build:components:visual-search

# Test component integration
npm run test:components
```

#### Step 2: UI Enhancement
```bash
# Update existing components
npm run update:search-interface
npm run update:admin-panel

# Test enhanced UI
npm run test:e2e:visual-search
```

### Phase 3: Production Optimization (Week 5-6)

#### Step 1: Performance Optimization
```bash
# Optimize database indexes
supabase db optimize

# Enable caching
npm run setup:redis-cache

# Performance testing
npm run test:performance:visual-search
```

#### Step 2: Monitoring Setup
```bash
# Deploy monitoring
npm run deploy:monitoring

# Setup alerts
npm run setup:alerts:visual-search
```

## Integration Testing

### 1. Unit Tests
```typescript
// Test service integration
describe('IntegratedAIService', () => {
  it('should perform hybrid search combining text and visual', async () => {
    const service = new IntegratedAIService();
    const results = await service.performHybridSearch({
      text: 'marble texture',
      image: base64Image
    });
    
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
  });
});
```

### 2. Integration Tests
```typescript
// Test API integration
describe('Visual Search API', () => {
  it('should integrate with existing search API', async () => {
    const response = await fetch('/api/search/enhanced', {
      method: 'POST',
      body: JSON.stringify({
        query: 'stone texture',
        includeVisual: true,
        image: base64Image
      })
    });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toBeDefined();
  });
});
```

### 3. E2E Tests
```typescript
// Test UI integration
describe('Search Interface Integration', () => {
  it('should toggle between text and visual search modes', async () => {
    await page.goto('/search');
    await page.click('[data-testid="visual-search-toggle"]');
    await page.waitForSelector('[data-testid="image-upload-area"]');
    
    const uploadArea = await page.$('[data-testid="image-upload-area"]');
    expect(uploadArea).toBeTruthy();
  });
});
```

## Rollback Strategy

### 1. Feature Flags
```typescript
// Environment-based feature flags
export const FEATURE_FLAGS = {
  VISUAL_SEARCH_ENABLED: process.env.ENABLE_VISUAL_SEARCH === 'true',
  HYBRID_SEARCH_ENABLED: process.env.ENABLE_HYBRID_SEARCH === 'true',
  VISUAL_SEARCH_UI_ENABLED: process.env.ENABLE_VISUAL_SEARCH_UI === 'true'
};
```

### 2. Gradual Rollout
```typescript
// Progressive rollout by user percentage
export const shouldEnableVisualSearch = (userId: string): boolean => {
  if (!FEATURE_FLAGS.VISUAL_SEARCH_ENABLED) return false;
  
  const rolloutPercentage = parseInt(process.env.VISUAL_SEARCH_ROLLOUT_PERCENT || '10');
  const userHash = hashUserId(userId);
  
  return userHash % 100 < rolloutPercentage;
};
```

### 3. Monitoring & Alerts
```typescript
// Monitor integration health
export const monitorVisualSearchHealth = () => {
  setInterval(async () => {
    try {
      await visualSearchService.healthCheck();
      metrics.increment('visual_search.health_check.success');
    } catch (error) {
      metrics.increment('visual_search.health_check.failure');
      logger.error('Visual search health check failed', error);
    }
  }, 30000); // Every 30 seconds
};
```

## Post-Integration Validation

### 1. Performance Metrics
- **API Response Time**: < 2 seconds for visual search
- **Search Accuracy**: > 95% for material matching
- **System Reliability**: > 99.9% uptime
- **Cost Efficiency**: < $50/month operational costs

### 2. User Experience Metrics
- **Search Success Rate**: > 85% of visual searches return relevant results
- **User Adoption**: > 20% of searches use visual search within first month
- **Performance Satisfaction**: < 3 second perceived search time

### 3. Technical Health Metrics
- **Error Rate**: < 1% of visual search requests fail
- **Fallback Success**: 100% fallback to text search when visual search fails
- **Cache Hit Rate**: > 70% for repeated visual searches

## Troubleshooting Guide

### Common Integration Issues

#### 1. API Key Configuration
**Problem**: Visual search not working
**Solution**: Verify API keys in environment variables
```bash
# Check environment variables
echo $TOGETHER_AI_API_KEY
echo $HUGGINGFACE_API_KEY

# Test API connectivity
curl -H "Authorization: Bearer $TOGETHER_AI_API_KEY" \
  https://api.together.xyz/v1/models
```

#### 2. Database Migration Issues
**Problem**: Vector indexes not created
**Solution**: Manually create indexes
```sql
-- Create vector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Create indexes manually
CREATE INDEX CONCURRENTLY materials_visual_embedding_512_idx 
ON materials USING ivfflat (visual_embedding_512 vector_cosine_ops);
```

#### 3. Component Integration Issues
**Problem**: Visual search components not rendering
**Solution**: Check feature flags and imports
```typescript
// Verify feature flag
console.log('Visual search enabled:', FEATURE_FLAGS.VISUAL_SEARCH_ENABLED);

// Check component imports
import { VisualSearchInterface } from '../VisualSearch/VisualSearchInterface';
```

## Support and Documentation

### Additional Resources
- **API Documentation**: `/visual-search/docs/api-integration-requirements.md`
- **Component Library**: `/visual-search/frontend/src/components/README.md`
- **Database Schema**: `/visual-search/docs/database-schema.md`
- **Technical Architecture**: `/visual-search/docs/technical-architecture.md`

### Contact Points
- **Backend Integration**: Backend Lead
- **Frontend Integration**: Frontend Lead  
- **Database Changes**: DevOps Engineer
- **Performance Issues**: Site Reliability Engineer

This integration guide ensures that the new LLaMA Visual Search system seamlessly enhances the existing Material Kai Vision Platform while maintaining backward compatibility and system reliability.