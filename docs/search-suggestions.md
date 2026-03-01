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
Stores auto-complete suggestions with popularity metrics. Key columns: `suggestion_text`, `suggestion_type` (product, material, category, property, trending, recent), `category`, `popularity_score`, `click_count`, `impression_count`, `ctr` (computed), `metadata` (JSONB), `is_active`, timestamps.

#### 2. search_query_corrections
Tracks typo corrections and their effectiveness. Key columns: `original_query`, `corrected_query`, `correction_type` (spelling, synonym, expansion, abbreviation), `confidence_score`, `auto_applied_count`, `user_accepted_count`, `user_rejected_count`, `acceptance_rate` (computed). Has a unique constraint on `(original_query, corrected_query)`.

#### 3. trending_searches
Tracks trending queries over time windows. Key columns: `query_text`, `search_count`, `unique_users_count`, `time_window` (hourly, daily, weekly, monthly), `trend_score`, `growth_rate`, `category`, `metadata` (JSONB), `window_start`, `window_end`. Has a unique constraint on `(query_text, time_window, window_start)`.

#### 4. search_suggestion_clicks
Tracks user interactions with suggestions. Key columns: `suggestion_id` (FK to search_suggestions), `user_id`, `session_id`, `original_query`, `suggestion_position`, `action_type` (clicked, dismissed, ignored, accepted), `result_count`, `user_satisfied`.

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

Request body fields: `query` (string), `limit` (integer, default 10), `user_id` (optional), `session_id` (optional), `include_trending` (boolean), `include_recent` (boolean), `include_popular` (boolean), `categories` (array of strings).

Response includes: `success`, `query`, `suggestions` (array with id, suggestion_text, suggestion_type, category, popularity_score, click_count, impression_count, ctr, metadata, confidence), `total_suggestions`, `processing_time_ms`, `metadata` (sources used, query_length).

### 2. Trending Searches

**GET** `/api/search/trending`

Get currently trending search queries.

**Query Parameters:**
- `time_window`: hourly, daily, weekly, monthly (default: daily)
- `limit`: Maximum results (default: 20, max: 100)
- `category`: Filter by category (optional)
- `min_search_count`: Minimum search count threshold (default: 2)

Response includes: `success`, `trending_searches` (array with query_text, search_count, unique_users_count, trend_score, growth_rate, time_window, category), `total_results`, `time_window`, `window_start`, `window_end`.

### 3. Typo Correction

**POST** `/api/search/typo-correction`

Detect typos and suggest corrections.

Request body fields: `query` (string), `auto_apply_threshold` (float, e.g. 0.9), `max_suggestions` (integer).

Response includes: `success`, `original_query`, `has_corrections`, `corrections` (array with original_query, corrected_query, correction_type, confidence_score, auto_applied, acceptance_rate), `recommended_correction`.

### 4. Query Expansion

**POST** `/api/search/query-expansion`

Expand query with synonyms and related terms.

Request body fields: `query` (string), `max_synonyms_per_term` (integer), `max_related_concepts` (integer), `use_ai` (boolean).

Response includes: `success`, `expanded_query` (with original_query, expanded_terms, synonyms by term, related_concepts, confidence_score), `suggested_searches`, `processing_time_ms`.

### 5. Track Suggestion Click

**POST** `/api/search/track-click`

Track when user clicks on a suggestion for analytics.

Request body fields: `suggestion_id`, `user_id`, `session_id`, `original_query`, `suggestion_position`, `action_type`, `result_count`, `user_satisfied`.

Response: `{"success": true, "message": "Click tracked successfully"}`.

## Frontend Integration

### SearchSuggestionsService

TypeScript service (`src/services/searchSuggestionsService.ts`) provides methods:
- `getAutoCompleteSuggestions(params)` - Get auto-complete suggestions
- `getTrendingSearches(timeWindow, limit)` - Get trending searches
- `checkTypoCorrection(query, threshold, maxSuggestions)` - Check for typos
- `expandQuery(query, maxSynonyms, maxConcepts, useAi)` - Expand query terms
- `trackSuggestionClick(suggestionId, originalQuery, position, actionType, userId)` - Track interactions

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

