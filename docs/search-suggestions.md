# Intelligent Search Suggestions & Auto-Complete

**Feature #49** - Comprehensive search suggestions system with auto-complete, trending searches, personalization, typo correction, query expansion, and analytics tracking.

## Overview

The MIVAA platform now includes an intelligent search suggestions system that enhances the user search experience through:

- **Auto-Complete**: Real-time suggestions as users type
- **Trending Searches**: Display of currently popular search queries
- **Typo Correction**: Automatic detection and correction of spelling errors
- **Query Expansion**: Synonym expansion and related term suggestions
- **Personalization**: User-specific suggestions based on search history
- **Analytics Tracking**: Comprehensive tracking of suggestion effectiveness

## Architecture

### Database Schema

Four new tables support the search suggestions system:

#### 1. search_suggestions
Stores auto-complete suggestions with popularity metrics.

```sql
CREATE TABLE search_suggestions (
  id UUID PRIMARY KEY,
  suggestion_text TEXT NOT NULL,
  suggestion_type VARCHAR(50) NOT NULL,  -- product, material, category, property, trending, recent
  category VARCHAR(100),
  popularity_score NUMERIC DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  impression_count INTEGER DEFAULT 0,
  ctr NUMERIC GENERATED ALWAYS AS (
    CASE WHEN impression_count > 0 
    THEN click_count::NUMERIC / impression_count 
    ELSE 0 END
  ) STORED,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
```

#### 2. search_query_corrections
Tracks typo corrections and their effectiveness.

```sql
CREATE TABLE search_query_corrections (
  id UUID PRIMARY KEY,
  original_query TEXT NOT NULL,
  corrected_query TEXT NOT NULL,
  correction_type VARCHAR(50) NOT NULL,  -- spelling, synonym, expansion, abbreviation
  confidence_score NUMERIC DEFAULT 0.8,
  auto_applied_count INTEGER DEFAULT 0,
  user_accepted_count INTEGER DEFAULT 0,
  user_rejected_count INTEGER DEFAULT 0,
  acceptance_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN (user_accepted_count + user_rejected_count) > 0
    THEN user_accepted_count::NUMERIC / (user_accepted_count + user_rejected_count)
    ELSE 0 END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(original_query, corrected_query)
);
```

#### 3. trending_searches
Tracks trending queries over time windows.

```sql
CREATE TABLE trending_searches (
  id UUID PRIMARY KEY,
  query_text TEXT NOT NULL,
  search_count INTEGER DEFAULT 1,
  unique_users_count INTEGER DEFAULT 1,
  time_window VARCHAR(20) NOT NULL,  -- hourly, daily, weekly, monthly
  trend_score NUMERIC DEFAULT 0,
  growth_rate NUMERIC DEFAULT 0,
  category VARCHAR(100),
  metadata JSONB DEFAULT '{}'::jsonb,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(query_text, time_window, window_start)
);
```

#### 4. search_suggestion_clicks
Tracks user interactions with suggestions.

```sql
CREATE TABLE search_suggestion_clicks (
  id UUID PRIMARY KEY,
  suggestion_id UUID REFERENCES search_suggestions(id) ON DELETE CASCADE,
  user_id UUID,
  session_id TEXT,
  original_query TEXT,
  suggestion_position INTEGER,
  action_type VARCHAR(50) NOT NULL,  -- clicked, dismissed, ignored, accepted
  result_count INTEGER,
  user_satisfied BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Database Functions

#### update_suggestion_metrics()
Trigger function that automatically updates click counts and impression counts when users interact with suggestions.

#### calculate_trending_searches(p_time_window, p_limit)
Calculates trending searches based on current vs previous period, returns trend scores and growth rates.

#### get_popular_searches(p_query_filter, p_limit, p_days)
Retrieves popular search queries with filtering options.

## API Endpoints

All endpoints are available under `/api/search/` prefix.

### 1. Auto-Complete Suggestions

**POST** `/api/search/autocomplete`

Get intelligent auto-complete suggestions as user types.

**Request:**
```json
{
  "query": "fire res",
  "limit": 10,
  "user_id": "user-123",
  "session_id": "session-456",
  "include_trending": true,
  "include_recent": true,
  "include_popular": true,
  "categories": ["ceramic", "tiles"]
}
```

**Response:**
```json
{
  "success": true,
  "query": "fire res",
  "suggestions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "suggestion_text": "fire resistant tiles",
      "suggestion_type": "trending",
      "category": "ceramic",
      "popularity_score": 0.85,
      "click_count": 142,
      "impression_count": 1250,
      "ctr": 0.1136,
      "metadata": {"related_terms": ["fireproof", "heat resistant"]},
      "confidence": 0.92
    }
  ],
  "total_suggestions": 8,
  "processing_time_ms": 45,
  "metadata": {
    "sources": ["database", "trending", "products"],
    "query_length": 8
  }
}
```

### 2. Trending Searches

**GET** `/api/search/trending`

Get currently trending search queries.

**Query Parameters:**
- `time_window`: hourly, daily, weekly, monthly (default: daily)
- `limit`: Maximum results (default: 20, max: 100)
- `category`: Filter by category (optional)
- `min_search_count`: Minimum search count threshold (default: 2)

**Response:**
```json
{
  "success": true,
  "trending_searches": [
    {
      "query_text": "marble flooring",
      "search_count": 156,
      "unique_users_count": 89,
      "trend_score": 87.5,
      "growth_rate": 45.2,
      "time_window": "daily",
      "category": "flooring"
    }
  ],
  "total_results": 15,
  "time_window": "daily",
  "window_start": "2025-01-08T00:00:00Z",
  "window_end": "2025-01-09T00:00:00Z"
}
```

### 3. Typo Correction

**POST** `/api/search/typo-correction`

Detect typos and suggest corrections.

**Request:**
```json
{
  "query": "waterprf tiles",
  "auto_apply_threshold": 0.9,
  "max_suggestions": 3
}
```

**Response:**
```json
{
  "success": true,
  "original_query": "waterprf tiles",
  "has_corrections": true,
  "corrections": [
    {
      "original_query": "waterprf tiles",
      "corrected_query": "waterproof tiles",
      "correction_type": "spelling",
      "confidence_score": 0.95,
      "auto_applied": true,
      "acceptance_rate": 0.87
    }
  ],
  "recommended_correction": {
    "original_query": "waterprf tiles",
    "corrected_query": "waterproof tiles",
    "correction_type": "spelling",
    "confidence_score": 0.95,
    "auto_applied": true,
    "acceptance_rate": 0.87
  }
}
```

### 4. Query Expansion

**POST** `/api/search/query-expansion`

Expand query with synonyms and related terms.

**Request:**
```json
{
  "query": "fire resistant",
  "max_synonyms_per_term": 3,
  "max_related_concepts": 5,
  "use_ai": true
}
```

**Response:**
```json
{
  "success": true,
  "expanded_query": {
    "original_query": "fire resistant",
    "expanded_terms": ["flame", "heat", "thermal", "proof", "repellent"],
    "synonyms": {
      "fire": ["flame", "heat", "thermal"],
      "resistant": ["proof", "repellent", "protective"]
    },
    "related_concepts": ["fireproof tiles", "heat resistant materials", "fire safety"],
    "confidence_score": 0.85
  },
  "suggested_searches": [
    "fire resistant flame",
    "fire resistant heat",
    "fire resistant thermal"
  ],
  "processing_time_ms": 78
}
```

### 5. Track Suggestion Click

**POST** `/api/search/track-click`

Track when user clicks on a suggestion for analytics.

**Request:**
```json
{
  "suggestion_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-123",
  "session_id": "session-456",
  "original_query": "fire res",
  "suggestion_position": 0,
  "action_type": "clicked",
  "result_count": 42,
  "user_satisfied": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Click tracked successfully"
}
```

## Frontend Integration

### SearchSuggestionsService

TypeScript service for interacting with search suggestions API:

```typescript
import { getSearchSuggestionsService } from '@/services/searchSuggestionsService';

const service = getSearchSuggestionsService();

// Get auto-complete suggestions
const response = await service.getAutoCompleteSuggestions({
  query: 'fire res',
  limit: 10,
  include_trending: true,
  include_recent: true,
  include_popular: true
});

// Get trending searches
const trending = await service.getTrendingSearches('daily', 20);

// Check typo correction
const correction = await service.checkTypoCorrection('waterprf', 0.9, 3);

// Expand query
const expanded = await service.expandQuery('fire resistant', 3, 5, true);

// Track suggestion click
await service.trackSuggestionClick(
  suggestionId,
  originalQuery,
  position,
  'clicked',
  userId
);
```

### SemanticSearchInput Component

Enhanced search input component with auto-complete and typo correction:

- Real-time auto-complete suggestions as user types
- Typo correction banner with "Did you mean?" suggestions
- Trending searches display
- Click tracking for analytics
- Keyboard navigation support

## Usage Examples

### Example 1: Basic Auto-Complete

User types "fire res" → System suggests:
- "fire resistant tiles"
- "fire resistant materials"
- "fire resistant coating"

### Example 2: Typo Correction

User types "waterprf" → System shows banner:
"Did you mean: waterproof?"

### Example 3: Trending Searches

Display top 10 trending searches on search page:
- "marble flooring" (↑ 45%)
- "ceramic tiles" (↑ 32%)
- "wood panels" (↑ 28%)

## Performance Considerations

- Auto-complete debounced to 300ms to reduce API calls
- Suggestions cached on frontend for 5 minutes
- Database indexes on frequently queried columns
- Computed columns for CTR and acceptance rates
- Trigger-based metric updates for real-time statistics

## Future Enhancements

- AI-powered semantic expansion using Claude/GPT-5
- Personalized suggestions based on user preferences
- Multi-language support for international users
- Voice search integration
- Image-based search suggestions
- Category-specific suggestion models

