# Collaborative Filtering Recommendations System

Complete documentation for the collaborative filtering recommendation system that provides personalized material recommendations.

> **📚 Related Documentation:**
> - [System Architecture](./system-architecture.md) - Overall platform architecture
> - [API Endpoints](./api-endpoints.md) - Complete API reference

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Algorithms](#algorithms)
5. [API Endpoints](#api-endpoints)
6. [Frontend Integration](#frontend-integration)
7. [Performance & Caching](#performance--caching)
8. [Analytics](#analytics)

---

## Overview

The collaborative filtering system provides **personalized material recommendations** based on user behavior and interaction patterns.

### Key Features

✅ **User-User Collaborative Filtering** - "Users like you also liked..."
✅ **Item-Item Collaborative Filtering** - "Materials similar to this..."
✅ **Hybrid Recommendations** - Combining collaborative + content-based
✅ **Interaction Tracking** - Track views, clicks, saves, purchases, ratings
✅ **Smart Caching** - 7-day cache with automatic invalidation
✅ **Real-time Analytics** - Track recommendation performance

### Interaction Types

| Type | Weight | Description |
|------|--------|-------------|
| **view** | 1.0 | User viewed material page |
| **click** | 2.0 | User clicked on material |
| **save** | 3.0 | User saved material to favorites |
| **add_to_quote** | 4.0 | User added material to quote |
| **purchase** | 5.0 | User purchased material |
| **rate** | 1-5 | User rated material (uses actual rating value) |
| **share** | 3.0 | User shared material |

---

## Architecture

The system flow is as follows: user interactions are tracked and viewed recommendations are requested from the frontend. Both actions route through the `recommendations-api` Edge Function, which checks the cache. On a cache hit, cached recommendation_scores are returned. On a cache miss, recommendations are computed by querying the user_material_interactions table via a Python service that applies cosine similarity and matrix factorization algorithms, and the results are stored back in recommendation_scores before being returned.

---

## Database Schema

### 1. user_material_interactions

Tracks all user interactions with materials for collaborative filtering. Key fields: id (UUID primary key), user_id (references auth.users), workspace_id (references workspaces), material_id (references products), interaction_type (one of: view, click, save, purchase, rate, add_to_quote, share), interaction_value (float, default 1.0 — represents rating value, time spent, or weight), session_id (for grouping interactions), metadata (JSONB for additional context), created_at, and updated_at.

**Indexes:**
- `idx_user_interactions_user_id` - Fast user lookups
- `idx_user_interactions_material_id` - Fast material lookups
- `idx_user_interactions_workspace_id` - Workspace filtering
- `idx_user_interactions_user_material` - User-material composite
- `idx_user_interactions_workspace_material` - Workspace-material composite

---

### 2. recommendation_scores

Cached recommendation scores for fast retrieval. Key fields: id (UUID primary key), user_id (references auth.users), workspace_id (references workspaces), material_id (references products), score (float 0-1, normalized), algorithm (one of: collaborative, content, hybrid, user_user, item_item), confidence (float 0-1, default 0.5), metadata (JSONB for algorithm-specific data such as similar users or similar items), computed_at, expires_at (default 7 days from now), created_at, and updated_at. A unique constraint applies on (user_id, material_id, algorithm).

**Indexes:**
- `idx_recommendation_scores_user_score` - Fast user recommendations
- `idx_recommendation_scores_workspace_score` - Workspace recommendations
- `idx_recommendation_scores_expires_at` - Cache cleanup

---

## Algorithms

### 1. User-User Collaborative Filtering

**"Users like you also liked..."**

**How it works:**
1. Build interaction vector for target user
2. Find users with similar interaction patterns (cosine similarity)
3. Recommend materials liked by similar users
4. Weight by similarity score and interaction value

**Example:** If User A has interactions {material_1: 5.0, material_2: 3.0, material_3: 4.0} and User B has interactions {material_1: 4.0, material_2: 3.0, material_4: 5.0} with a similarity of 0.85, then material_4 is recommended to User A with a score of 0.85 × 5.0 = 4.25.

**Minimum Requirements:**
- Target user: 3+ interactions
- Similar users: 3+ interactions
- Similarity threshold: 0.3

---

### 2. Item-Item Collaborative Filtering

**"Materials similar to this..."**

**How it works:**
1. Find users who interacted with target material
2. Find other materials these users interacted with
3. Calculate similarity based on common users
4. Rank by weighted overlap

**Example:** If Material A is liked by [User1, User2, User3, User4] and Material B is liked by [User2, User3, User4, User5], the similarity is 3 common users divided by (4 + 4 - 3) = 0.6.

**Minimum Requirements:**
- Target material: 3+ interactions
- Similar materials: 3+ interactions
- Similarity threshold: 0.3

---

### 3. Cosine Similarity

Used to calculate similarity between interaction vectors.

**Formula:**

similarity = (A · B) / (||A|| × ||B||)

**Where:**
- A · B = dot product of vectors
- ||A|| = magnitude of vector A
- ||B|| = magnitude of vector B

**Range:** 0.0 (no similarity) to 1.0 (identical)

---

## API Endpoints

### POST /functions/recommendations-api/track-interaction

Track user interaction with a material.

**Request parameters:** workspace_id, material_id, interaction_type (one of: view, click, save, purchase, rate, add_to_quote, share), optional interaction_value (default 1.0), optional session_id, and optional metadata object.

**Response:** A data object containing id, user_id, workspace_id, material_id, interaction_type, interaction_value, and created_at. Also includes a success message "Interaction tracked successfully".

Call the endpoint via a POST request to `/functions/recommendations-api/track-interaction` with the Authorization header set to `Bearer ${token}`, Content-Type application/json, and the above body parameters.

---

### GET /functions/recommendations-api/for-user

Get personalized recommendations for the current user.

**Query Parameters:**
- `workspace_id` (required) - Workspace ID
- `limit` (optional) - Maximum number of recommendations (default: 20)
- `algorithm` (optional) - Algorithm to use: `user_user`, `item_item`, `hybrid` (default: `user_user`)

**Response:** A data array where each entry contains material_id, score (0-1), confidence (0-1), algorithm, and metadata (which may include similar_users_count and recommending_users). Also includes a cached boolean flag.

Call the endpoint via a GET request to `/functions/recommendations-api/for-user?workspace_id=...&limit=20&algorithm=user_user` with the Authorization header.

---

### GET /functions/recommendations-api/similar-materials/{material_id}

Get materials similar to a specific material.

**Path Parameters:**
- `material_id` (required) - Material ID

**Query Parameters:**
- `workspace_id` (required) - Workspace ID
- `limit` (optional) - Maximum number of recommendations (default: 10)

**Response:** A data array where each entry contains material_id, score (0-1), confidence (0-1), algorithm ('item_item'), and metadata (including source_material_id and common_users count).

Call the endpoint via a GET request to `/functions/recommendations-api/similar-materials/{material_id}?workspace_id=...&limit=10` with the Authorization header.

---

### GET /functions/recommendations-api/analytics/{workspace_id}

Get recommendation analytics for a workspace.

**Path Parameters:**
- `workspace_id` (required) - Workspace ID

**Query Parameters:**
- `days` (optional) - Number of days to analyze (default: 30)

**Response:** A data object containing workspace_id, period_days, total_interactions, interactions_by_type (object mapping type to count), cached_recommendations count, and recommendations_by_algorithm (object mapping algorithm name to count).

Call the endpoint via a GET request to `/functions/recommendations-api/analytics/{workspace_id}?days=30` with the Authorization header.

---

### DELETE /functions/recommendations-api/cache

Invalidate recommendation cache.

**Query Parameters:**
- `workspace_id` (optional) - Filter by workspace
- `material_id` (optional) - Filter by material

**Response:** A message confirming "Cache invalidated successfully".

Call the endpoint via a DELETE request to `/functions/recommendations-api/cache?workspace_id=...` with the Authorization header.

---

## Frontend Integration

### 1. Track Interactions

Create a `RecommendationsService` class (e.g., at `src/services/recommendationsService.ts`) with a private `trackInteraction` method that retrieves the current Supabase session and workspace ID, then POSTs to the track-interaction endpoint with the material ID, interaction type, interaction value, session ID, and optional metadata.

Expose convenience static methods from this service: `trackView` (value 1.0), `trackClick` (value 2.0), `trackSave` (value 3.0), `trackRating` (uses the actual rating value), and `trackAddToQuote` (value 4.0).

In material card components, call `RecommendationsService.trackClick()` on click events (with metadata such as source page and position), and call `RecommendationsService.trackView()` using an IntersectionObserver when the card enters the viewport.

---

### 2. Display Recommendations

Create a `RecommendedForYou` component that on mount fetches the current Supabase session and workspace ID, then calls the `for-user` endpoint with a limit of 20. Render a grid of MaterialCard components from the returned material IDs.

Create a `SimilarMaterials` component that accepts a `materialId` prop and on mount fetches from the `similar-materials/{materialId}` endpoint. Render a carousel of MaterialCard components from the returned material IDs.

---

## Performance & Caching

### Cache Strategy

**Cache TTL:** 7 days
**Cache Invalidation:** Automatic on new interactions
**Cache Key:** `(user_id, workspace_id, algorithm)`

### Performance Optimizations

1. **Indexed Lookups** - All queries use indexed columns
2. **Batch Processing** - Process multiple recommendations at once
3. **Lazy Loading** - Load recommendations only when needed
4. **Debouncing** - Debounce interaction tracking (1 second)
5. **Background Computation** - Compute recommendations asynchronously

### Scalability

- **User-User:** O(U * I) where U = users, I = interactions per user
- **Item-Item:** O(M * U) where M = materials, U = users per material
- **Cache Lookup:** O(1) with indexes

---

## Analytics

### Track Recommendation Performance

Fetch the analytics endpoint for your workspace with a `days` parameter. The response data includes total_interactions, interactions_by_type (broken down by each interaction type), cached_recommendations count, and recommendations_by_algorithm (broken down by each algorithm type).

### Metrics to Monitor

1. **Interaction Rate** - Interactions per user per day
2. **Click-Through Rate** - Clicks on recommendations / impressions
3. **Conversion Rate** - Purchases from recommendations / clicks
4. **Cache Hit Rate** - Cached responses / total requests
5. **Recommendation Coverage** - Users with recommendations / total users

---

## Summary

✅ **Database Schema Created** - 2 tables with proper indexes and RLS
✅ **Backend Service Built** - Python service with collaborative filtering
✅ **API Endpoints Created** - 5 endpoints for tracking and recommendations
✅ **Frontend Integration Ready** - Service and components documented
✅ **Caching Implemented** - 7-day cache with automatic invalidation
✅ **Analytics Available** - Track recommendation performance

**Next Steps:**
1. Build frontend components (RecommendedForYou, SimilarMaterials)
2. Integrate interaction tracking across platform
3. Test recommendation quality
4. Optimize algorithms based on analytics

**The collaborative filtering system is ready for integration!** 🚀
