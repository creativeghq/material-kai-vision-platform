# Search Services Documentation

## 🔍 Search Architecture

The Material Kai Vision Platform provides comprehensive search capabilities including semantic search, multi-modal search, and intelligent retrieval systems.

## 🔧 Core Search Services

### 1. MaterialSearchService

**Location**: `src/services/materialSearchService.ts`

**Purpose**: Specialized search service for material-related queries

**Key Features**:
- Material-specific search algorithms
- Property-based filtering
- Category-based search
- Advanced filtering options
- Export and sharing capabilities

**Search Capabilities**:
```typescript
interface MaterialSearchRequest {
  query: string;
  filters: {
    categories: string[];
    properties: PropertyFilters;
    date_range: DateRange;
    quality_threshold: number;
  };
  search_type: 'text' | 'semantic' | 'hybrid';
  workspace_id: string;
  limit: number;
}

interface MaterialSearchResult {
  materials: Material[];
  total_count: number;
  search_time: number;
  relevance_scores: number[];
  suggestions: string[];
}
```

### 2. EnhancedRAGService (Search Integration)

**Location**: `src/services/enhancedRAGService.ts`

**Purpose**: Advanced search with RAG capabilities

**Search Features**:
- Semantic document search
- Context-aware retrieval
- Multi-modal search (text + images)
- Conversation-aware search
- Source attribution

**RAG Search Pipeline**:
1. Query preprocessing and embedding
2. Vector similarity search
3. Context retrieval and ranking
4. Response generation
5. Source attribution and confidence scoring

### 3. MivaaSearchIntegration

**Location**: `src/services/mivaaSearchIntegration.ts`

**Purpose**: Integration with MIVAA search capabilities

**Integration Features**:
- Unified search interface
- Multi-source search coordination
- Result aggregation and ranking
- Performance optimization
- Error handling and fallbacks

## 🎯 Search Components

### 1. SearchHub (Dashboard)

**Location**: `src/components/Dashboard/SearchHub.tsx`

**Purpose**: Main search interface integrated into dashboard

**Features**:
- Unified search input
- Real-time suggestions
- Quick filters
- Recent searches
- Search analytics

### 2. UnifiedSearchInterface

**Location**: `src/components/Search/UnifiedSearchInterface.tsx`

**Purpose**: Comprehensive search interface

**Features**:
- Multi-modal search input
- Advanced filtering options
- Search result visualization
- Export capabilities
- Search history

### 3. SemanticSearch

**Location**: `src/components/Search/SemanticSearch.tsx`

**Purpose**: Semantic search interface

**Features**:
- Natural language queries
- Contextual search
- Intelligent suggestions
- Relevance scoring
- Result explanations

### 4. SemanticSearchInput

**Location**: `src/components/Search/SemanticSearchInput.tsx`

**Purpose**: Advanced search input component

**Features**:
- Auto-completion
- Query suggestions
- Search history
- Voice input support
- Multi-language support

## 📊 Search Result Components

### 1. SearchResultsGrid

**Location**: `src/components/Search/SearchResultsGrid.tsx`

**Purpose**: Grid layout for search results

**Features**:
- Responsive grid layout
- Image previews
- Quick actions
- Sorting options
- Pagination

### 2. SearchResultsList

**Location**: `src/components/Search/SearchResultsList.tsx`

**Purpose**: List layout for search results

**Features**:
- Detailed result information
- Relevance indicators
- Action buttons
- Metadata display
- Export options

### 3. SearchResultCard

**Location**: `src/components/Search/SearchResultCard.tsx`

**Purpose**: Individual search result display

**Features**:
- Rich content preview
- Relevance scoring
- Quick actions
- Metadata display
- Interaction tracking

## 🔍 Specialized Search Services

### 1. FunctionalPropertySearch

**Location**: `src/components/Search/FunctionalPropertySearch.tsx`

**Purpose**: Search based on functional properties

**Features**:
- Property-based queries
- Range filtering
- Comparison tools
- Visualization options
- Export capabilities

### 2. FunctionalCategoryFilters

**Location**: `src/components/Search/FunctionalCategoryFilters.tsx`

**Purpose**: Category-based filtering system

**Features**:
- Hierarchical categories
- Multi-select filtering
- Dynamic category updates
- Search within categories
- Filter persistence

## 🤖 AI-Powered Search

### 1. MaterialAgentSearchInterface

**Location**: `src/components/AI/MaterialAgentSearchInterface.tsx`

**Purpose**: AI agent-powered search interface

**Features**:
- Intelligent query understanding
- Context-aware suggestions
- Multi-agent search coordination
- Expert knowledge integration
- Learning from interactions

### 2. JinaAIService

**Location**: `src/services/jinaAIService.ts`

**Purpose**: Integration with Jina AI for advanced search

**Features**:
- Neural search capabilities
- Multi-modal embeddings
- Scalable search infrastructure
- Real-time indexing
- Performance optimization

## 📈 Search Analytics & Monitoring

### Search Performance Metrics

**Tracked Metrics**:
- Query response time
- Search accuracy and relevance
- User engagement metrics
- Click-through rates
- Search success rates

**Performance Indicators**:
```typescript
interface SearchMetrics {
  query_volume: number;
  average_response_time: number;
  relevance_score: number;
  click_through_rate: number;
  user_satisfaction: number;
  error_rate: number;
}
```

### Search Analytics

**Analytics Features**:
- Query pattern analysis
- Popular search terms
- User behavior tracking
- Performance trends
- A/B testing results

## 🔧 Search Configuration

### Search Settings

```typescript
interface SearchConfig {
  algorithms: {
    text_search: 'bm25' | 'tfidf' | 'neural';
    semantic_search: 'openai' | 'huggingface' | 'custom';
    hybrid_weight: number;
  };
  performance: {
    max_results: number;
    timeout: number;
    cache_duration: number;
  };
  quality: {
    relevance_threshold: number;
    confidence_threshold: number;
    enable_reranking: boolean;
  };
}
```

### Index Configuration

**Index Settings**:
- Document indexing strategies
- Vector embedding configurations
- Update frequencies
- Optimization parameters
- Storage settings

## 🔄 Search Workflows

### 1. Multi-Modal Search Workflow

**Search Process**:
1. **Query Processing**: Parse and understand user query
2. **Multi-Modal Analysis**: Process text and image inputs
3. **Vector Search**: Semantic similarity search
4. **Text Search**: Traditional keyword search
5. **Result Fusion**: Combine and rank results
6. **Post-Processing**: Filter and optimize results

### 2. Intelligent Search Workflow

**AI-Enhanced Process**:
1. **Intent Recognition**: Understand search intent
2. **Query Expansion**: Expand query with related terms
3. **Context Integration**: Use conversation context
4. **Multi-Source Search**: Search across multiple sources
5. **Result Synthesis**: Synthesize comprehensive results

## 📊 Supabase Edge Functions

### 1. Enhanced RAG Search Function

**Function**: `enhanced-rag-search`

**Purpose**: Advanced search with RAG capabilities

**Features**:
- Serverless search processing
- Vector similarity search
- Context-aware retrieval
- Real-time indexing
- Performance optimization

### 2. Material Scraper Function

**Function**: `material-scraper`

**Purpose**: Web scraping for material data

**Features**:
- Automated data collection
- Content extraction
- Data validation
- Search index integration
- Quality assurance

## 🎯 Advanced Search Features

### 1. Hybrid Search

**Features**:
- Text + semantic search combination
- Weighted result fusion
- Performance optimization
- Quality assurance
- User preference learning

### 2. Contextual Search

**Capabilities**:
- Conversation context awareness
- User history integration
- Personalized results
- Adaptive ranking
- Learning from interactions

### 3. Multi-Source Search

**Features**:
- Document search
- Material database search
- Knowledge base search
- Web search integration
- Result aggregation

## 🚨 Known Issues & Limitations

### Current Challenges

1. **Search Latency**: Performance optimization needed for complex queries
2. **Result Relevance**: Improving relevance scoring accuracy
3. **Multi-Modal Integration**: Better integration of text and image search
4. **Scalability**: Handling large-scale search operations

### Planned Improvements

1. **Performance Optimization**: Faster search algorithms and caching
2. **Relevance Enhancement**: Improved ranking algorithms
3. **Multi-Modal Enhancement**: Better cross-modal search capabilities
4. **Scalability Solutions**: Distributed search infrastructure

## 🔗 Integration Points

### Frontend Integration

- Search interfaces
- Result visualization
- Filter components
- Analytics dashboards

### Backend Integration

- RAG system integration
- Material recognition pipeline
- PDF processing workflow
- Knowledge base management

### External Services

- OpenAI embeddings
- HuggingFace models
- Elasticsearch/Vector databases
- Web scraping services

## 📋 Usage Examples

### Basic Material Search

```typescript
const searchService = new MaterialSearchService();
const results = await searchService.searchMaterials("steel properties", {
  filters: {
    categories: ["metals"],
    properties: { density: { min: 7000, max: 8000 } }
  },
  search_type: "hybrid",
  workspace_id: "workspace-123"
});
```

### Semantic Search with RAG

```typescript
const ragService = new EnhancedRAGService();
const response = await ragService.query("What are the best materials for high-temperature applications?", {
  workspace_id: "workspace-123",
  max_results: 10,
  similarity_threshold: 0.7,
  include_context: true
});
```

### Multi-Modal Search

```typescript
const searchInterface = new UnifiedSearchInterface();
const results = await searchInterface.search({
  text_query: "corrosion resistant materials",
  image_query: imageFile,
  search_mode: "hybrid",
  filters: { category: "coatings" }
});
```

## 🔗 Related Documentation

- [RAG & Knowledge Base Services](./services-rag-knowledge.md)
- [Material Recognition Services](./services-material-recognition.md)
- [AI/ML Services Documentation](./ai-ml-services.md)
- [PDF Processing Services](./services-pdf-processing.md)
