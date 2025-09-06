+++
id = "ARCH-DYNAMIC-MATERIAL-CATEGORIES-API-DESIGN-V1"
title = "Dynamic Material Categories API Design Specification"
context_type = "architecture"
scope = "API design for dynamic material categories system"
target_audience = ["core-architect", "dev-core-web", "baas-supabase", "lead-backend"]
granularity = "detailed"
status = "draft"
last_updated = "2025-09-04"
created_by = "core-architect"
parent_task = "TASK-ARCH-20250904-1610"
tags = ["api", "rest", "graphql", "websocket", "material-categories", "caching", "authentication"]
related_context = [
    "docs/architecture/dynamic-material-categories-database-schema.md",
    ".ruru/docs/architecture/dynamic-material-categories-refactoring-plan.md",
    "src/types/materials.ts"
]
validation_status = "pending"
implementation_priority = "critical"
+++

# Dynamic Material Categories API Design Specification

## Overview

This document defines the comprehensive API design for the dynamic material categories system, supporting REST endpoints, GraphQL schema, WebSocket real-time updates, and caching strategies. The API provides secure, performant access to hierarchical material categories with extensible metadata.

## API Architecture Principles

### Core Design Principles
1. **RESTful Design**: Standard HTTP methods with resource-based URLs
2. **GraphQL Flexibility**: Complex queries and real-time subscriptions
3. **Caching First**: Aggressive caching with intelligent invalidation
4. **Real-time Updates**: WebSocket events for live configuration changes
5. **Security by Default**: Authentication, authorization, and rate limiting
6. **Backward Compatibility**: Legacy endpoint support during migration

### Technology Stack
- **REST**: Supabase Edge Functions + PostgreSQL
- **GraphQL**: PostGraphile + Custom resolvers
- **WebSocket**: Supabase Realtime
- **Caching**: Redis + CDN (Cloudflare)
- **Authentication**: Supabase Auth + RLS

## REST API Specification

### Base Configuration
```
Base URL: https://api.material-kai-vision.com/v1
API Version: v1.0.0
Content-Type: application/json
Authentication: Bearer JWT tokens
```

### 1. Category Management Endpoints

#### GET /material-config/categories
**Purpose**: Retrieve all material categories with filtering and pagination

```typescript
interface CategoryListRequest {
  // Filtering
  active?: boolean;
  composite?: boolean;
  parent_id?: string;
  hierarchy_level?: number;
  display_group?: string;
  
  // Search
  search?: string;
  
  // Pagination
  page?: number;
  limit?: number;
  cursor?: string;
  
  // Include relationships
  include_properties?: boolean;
  include_validation_rules?: boolean;
  include_children?: boolean;
  
  // Sorting
  sort_by?: 'name' | 'sort_order' | 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
}

interface CategoryListResponse {
  data: MaterialCategory[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
    has_next: boolean;
    has_prev: boolean;
    next_cursor?: string;
  };
  meta: {
    cache_key: string;
    cache_ttl: number;
    request_id: string;
  };
}
```

**Caching Strategy**: 
- TTL: 5 minutes for active categories, 1 hour for complete lists
- Cache Key: `categories:v1:${hash(params)}`
- Invalidation: On category updates via WebSocket

#### GET /material-config/categories/:id
**Purpose**: Retrieve a specific category with full details

```typescript
interface CategoryDetailResponse {
  data: MaterialCategory & {
    properties: MaterialProperty[];
    validation_rules: ValidationRule[];
    parent?: MaterialCategory;
    children?: MaterialCategory[];
    breadcrumb: CategoryBreadcrumb[];
  };
  meta: {
    cache_key: string;
    cache_ttl: number;
    last_modified: string;
  };
}
```

**Caching Strategy**:
- TTL: 10 minutes
- Cache Key: `category:${id}:${include_params}`
- ETag support for conditional requests

#### POST /material-config/categories
**Purpose**: Create a new material category (Admin only)

```typescript
interface CreateCategoryRequest {
  category_key: string;
  name: string;
  display_name: string;
  description?: string;
  parent_category_id?: string;
  display_group?: string;
  is_composite?: boolean;
  sort_order?: number;
  ai_extraction_enabled?: boolean;
  ai_confidence_threshold?: number;
}

interface CreateCategoryResponse {
  data: MaterialCategory;
  meta: {
    created_at: string;
    version: number;
  };
}
```

**Security**: Requires `admin` role or `category:create` permission

#### PUT /material-config/categories/:id
**Purpose**: Update existing category (Admin only)

```typescript
interface UpdateCategoryRequest {
  name?: string;
  display_name?: string;
  description?: string;
  parent_category_id?: string;
  display_group?: string;
  is_active?: boolean;
  sort_order?: number;
  ai_confidence_threshold?: number;
}
```

**Optimistic Locking**: Uses version field to prevent conflicts
**Cache Invalidation**: Triggers cache clear and WebSocket broadcast

#### DELETE /material-config/categories/:id
**Purpose**: Soft delete category (Admin only)

**Behavior**: Sets `is_active = false` rather than hard delete
**Cascade**: Updates dependent properties and validation rules

### 2. Property Management Endpoints

#### GET /material-config/categories/:id/properties
**Purpose**: Retrieve properties for a specific category

```typescript
interface PropertyListRequest {
  property_type?: 'finish' | 'size' | 'installationMethod' | 'application' | 'custom';
  active?: boolean;
  include_usage_stats?: boolean;
}

interface PropertyListResponse {
  data: MaterialProperty[];
  meta: {
    category_id: string;
    property_types: string[];
    total_by_type: Record<string, number>;
  };
}
```

#### POST /material-config/categories/:id/properties
**Purpose**: Add new property to category (Admin only)

```typescript
interface CreatePropertyRequest {
  property_type: string;
  property_key: string;
  property_value: string;
  property_description?: string;
  is_default?: boolean;
  sort_order?: number;
}
```

### 3. Validation Rules Endpoints

#### GET /material-config/categories/:id/validation-rules
**Purpose**: Retrieve AI validation rules for category

#### POST /material-config/categories/:id/validation-rules
**Purpose**: Add new validation rule (Admin only)

### 4. Legacy Compatibility Endpoints

#### GET /api/material-categories/legacy
**Purpose**: Backward compatibility with hardcoded MATERIAL_CATEGORIES format

```typescript
interface LegacyCategoryResponse {
  [key: string]: {
    name: string;
    finish: string[];
    size: string[];
    installationMethod: string[];
    application: string[];
  };
}
```

**Implementation**: Uses database view `v_material_categories_legacy`
**Caching**: Aggressive caching (1 hour TTL) since format is stable

## GraphQL Schema Design

### Schema Definition

```graphql
scalar UUID
scalar DateTime
scalar JSON

type Query {
  # Category queries
  materialCategories(
    filter: MaterialCategoryFilter
    sort: [MaterialCategorySort!]
    first: Int
    after: String
  ): MaterialCategoryConnection!
  
  materialCategory(id: UUID!): MaterialCategory
  materialCategoryByKey(key: String!): MaterialCategory
  
  # Search and filtering
  searchMaterialCategories(
    query: String!
    filters: SearchFilters
    limit: Int = 20
  ): MaterialCategorySearchResult!
  
  # Hierarchy queries
  materialCategoryHierarchy(
    rootId: UUID
    maxDepth: Int = 3
  ): [MaterialCategoryNode!]!
  
  # Properties and rules
  materialProperties(categoryId: UUID!): [MaterialProperty!]!
  validationRules(categoryId: UUID!): [ValidationRule!]!
}

type Mutation {
  # Category mutations (Admin only)
  createMaterialCategory(input: CreateMaterialCategoryInput!): CreateMaterialCategoryPayload!
  updateMaterialCategory(id: UUID!, input: UpdateMaterialCategoryInput!): UpdateMaterialCategoryPayload!
  deleteMaterialCategory(id: UUID!): DeleteMaterialCategoryPayload!
  
  # Property mutations
  createMaterialProperty(input: CreateMaterialPropertyInput!): CreateMaterialPropertyPayload!
  updateMaterialProperty(id: UUID!, input: UpdateMaterialPropertyInput!): UpdateMaterialPropertyPayload!
  
  # Validation rule mutations
  createValidationRule(input: CreateValidationRuleInput!): CreateValidationRulePayload!
  updateValidationRule(id: UUID!, input: UpdateValidationRuleInput!): UpdateValidationRulePayload!
}

type Subscription {
  # Real-time updates
  materialCategoryUpdated(categoryId: UUID): MaterialCategoryUpdatePayload!
  materialCategoryCreated: MaterialCategory!
  materialCategoryDeleted: MaterialCategoryDeletePayload!
  
  # Configuration changes
  materialConfigChanged: MaterialConfigChangePayload!
}

# Core Types
type MaterialCategory {
  id: UUID!
  categoryKey: String!
  name: String!
  displayName: String!
  description: String
  
  # Hierarchy
  parentCategoryId: UUID
  categoryPath: String!
  hierarchyLevel: Int!
  parent: MaterialCategory
  children: [MaterialCategory!]!
  
  # Organization
  sortOrder: Int!
  displayGroup: String
  
  # Behavior
  isActive: Boolean!
  isComposite: Boolean!
  isPrimaryCategory: Boolean!
  
  # AI Configuration
  aiExtractionEnabled: Boolean!
  aiConfidenceThreshold: Float!
  processingPriority: Int!
  
  # Relationships
  properties: [MaterialProperty!]!
  validationRules: [ValidationRule!]!
  
  # Metadata
  createdAt: DateTime!
  updatedAt: DateTime!
  version: Int!
  
  # Computed fields
  breadcrumb: [CategoryBreadcrumb!]!
  descendantCount: Int!
  propertyCount: Int!
}

type MaterialProperty {
  id: UUID!
  categoryId: UUID!
  category: MaterialCategory!
  
  propertyType: PropertyType!
  propertyKey: String!
  propertyValue: String!
  propertyDescription: String
  
  isDefault: Boolean!
  isActive: Boolean!
  sortOrder: Int!
  
  usageCount: Int!
  lastUsedAt: DateTime
  
  createdAt: DateTime!
  updatedAt: DateTime!
}

type ValidationRule {
  id: UUID!
  categoryId: UUID!
  category: MaterialCategory!
  
  ruleType: ValidationRuleType!
  ruleName: String!
  ruleContent: JSON!
  
  aiModelCompatibility: JSON
  confidenceThreshold: Float!
  trainingExamples: JSON
  
  isActive: Boolean!
  isPrimaryRule: Boolean!
  validationOrder: Int!
  
  # Performance metrics
  successRate: Float
  avgConfidence: Float
  totalValidations: Int!
  
  createdAt: DateTime!
  updatedAt: DateTime!
  lastValidatedAt: DateTime
}

# Enums
enum PropertyType {
  FINISH
  SIZE
  INSTALLATION_METHOD
  APPLICATION
  CUSTOM
}

enum ValidationRuleType {
  AI_PROMPT
  REGEX_PATTERN
  KEYWORD_MATCH
  IMAGE_FEATURE
  CUSTOM
}

# Input Types
input MaterialCategoryFilter {
  isActive: Boolean
  isComposite: Boolean
  hierarchyLevel: Int
  displayGroup: String
  parentCategoryId: UUID
  search: String
}

input MaterialCategorySort {
  field: MaterialCategorySortField!
  direction: SortDirection!
}

enum MaterialCategorySortField {
  NAME
  SORT_ORDER
  CREATED_AT
  UPDATED_AT
  HIERARCHY_LEVEL
}

enum SortDirection {
  ASC
  DESC
}

# Connection Types (Relay-style pagination)
type MaterialCategoryConnection {
  edges: [MaterialCategoryEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type MaterialCategoryEdge {
  node: MaterialCategory!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

### GraphQL Resolvers Strategy

```typescript
// Custom resolvers for complex queries
const resolvers = {
  Query: {
    materialCategoryHierarchy: async (parent, args, context) => {
      // Use LTREE queries for efficient hierarchy retrieval
      // Implement dataloader for N+1 prevention
    },
    
    searchMaterialCategories: async (parent, args, context) => {
      // Full-text search using PostgreSQL tsvector
      // Include faceted search results
    }
  },
  
  MaterialCategory: {
    breadcrumb: async (category, args, context) => {
      // Compute breadcrumb from category_path
      // Cache result for performance
    },
    
    descendantCount: async (category, args, context) => {
      // Count using LTREE path queries
      // Use dataloader for batching
    }
  },
  
  Subscription: {
    materialCategoryUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator('MATERIAL_CATEGORY_UPDATED'),
        (payload, variables) => {
          return !variables.categoryId || payload.categoryId === variables.categoryId;
        }
      )
    }
  }
};
```

## WebSocket Real-time Events

### Event Types

```typescript
interface MaterialCategoryUpdateEvent {
  type: 'MATERIAL_CATEGORY_UPDATED';
  data: {
    categoryId: string;
    action: 'created' | 'updated' | 'deleted' | 'activated' | 'deactivated';
    category: MaterialCategory;
    changes?: Record<string, any>;
    timestamp: string;
    userId: string;
  };
}

interface MaterialPropertyUpdateEvent {
  type: 'MATERIAL_PROPERTY_UPDATED';
  data: {
    categoryId: string;
    propertyId: string;
    action: 'created' | 'updated' | 'deleted';
    property: MaterialProperty;
    timestamp: string;
  };
}

interface MaterialConfigSyncEvent {
  type: 'MATERIAL_CONFIG_SYNC';
  data: {
    version: number;
    checksum: string;
    affected_categories: string[];
    timestamp: string;
  };
}
```

### WebSocket Channels

```typescript
// Channel structure
const channels = {
  // Global configuration changes
  'material-config': 'Global configuration updates',
  
  // Category-specific updates
  'material-category:${categoryId}': 'Updates for specific category',
  
  // User-specific updates (for admin users)
  'material-admin:${userId}': 'Admin-only updates',
  
  // Hierarchy updates
  'material-hierarchy:${rootCategoryId}': 'Hierarchy branch updates'
};
```

### Client Integration

```typescript
// Frontend WebSocket client
class MaterialCategoryClient {
  private ws: WebSocket;
  private subscriptions: Map<string, Function[]> = new Map();
  
  subscribe(event: string, callback: Function) {
    // Subscribe to specific category updates
  }
  
  subscribeToCategory(categoryId: string, callback: Function) {
    // Subscribe to updates for a specific category
  }
  
  subscribeToHierarchy(rootId: string, callback: Function) {
    // Subscribe to hierarchy changes
  }
}
```

## Authentication & Authorization

### Authentication Strategy

```typescript
interface AuthContext {
  user: {
    id: string;
    email: string;
    role: 'admin' | 'editor' | 'viewer';
    permissions: string[];
  };
  token: string;
  session: string;
}

// Supabase RLS Policies
const rlsPolicies = {
  material_categories: {
    SELECT: 'true', // Public read access
    INSERT: 'auth.role() = admin OR has_permission(auth.uid(), "category:create")',
    UPDATE: 'auth.role() = admin OR has_permission(auth.uid(), "category:edit")',
    DELETE: 'auth.role() = admin OR has_permission(auth.uid(), "category:delete")'
  },
  
  material_properties: {
    SELECT: 'true',
    INSERT: 'auth.role() IN (admin, editor)',
    UPDATE: 'auth.role() IN (admin, editor)',
    DELETE: 'auth.role() = admin'
  },
  
  category_validation_rules: {
    SELECT: 'auth.role() IN (admin, editor, ai_trainer)',
    INSERT: 'auth.role() IN (admin, ai_trainer)',
    UPDATE: 'auth.role() IN (admin, ai_trainer)',
    DELETE: 'auth.role() = admin'
  }
};
```

### Permission System

```typescript
interface Permission {
  resource: 'category' | 'property' | 'validation_rule' | 'config';
  action: 'create' | 'read' | 'update' | 'delete' | 'publish';
  scope?: 'own' | 'team' | 'global';
}

const permissionMatrix = {
  admin: ['*:*:*'],
  editor: [
    'category:read:*',
    'category:update:*',
    'property:*:*',
    'validation_rule:read:*'
  ],
  viewer: [
    'category:read:*',
    'property:read:*'
  ],
  ai_trainer: [
    'category:read:*',
    'validation_rule:*:*'
  ]
};
```

## Rate Limiting & Throttling

### Rate Limiting Strategy

```typescript
interface RateLimitConfig {
  // Per-endpoint limits
  endpoints: {
    'GET /material-config/categories': {
      windowMs: 60000; // 1 minute
      maxRequests: 100; // per window
      skipSuccessfulRequests: true;
    };
    
    'POST /material-config/categories': {
      windowMs: 60000;
      maxRequests: 10; // Admin operations
      skipSuccessfulRequests: false;
    };
    
    'GraphQL /graphql': {
      windowMs: 60000;
      maxRequests: 200;
      complexityLimit: 1000; // Query complexity points
    };
  };
  
  // Per-user limits
  userLimits: {
    admin: { multiplier: 10 };
    editor: { multiplier: 5 };
    viewer: { multiplier: 1 };
    anonymous: { multiplier: 0.1 };
  };
}
```

### Implementation

```typescript
// Redis-based rate limiting
class RateLimiter {
  async checkLimit(
    userId: string, 
    endpoint: string, 
    userRole: string
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const key = `rate_limit:${userId}:${endpoint}`;
    const config = this.getConfig(endpoint, userRole);
    
    // Sliding window algorithm with Redis
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, config.windowMs / 1000);
    }
    
    return {
      allowed: current <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - current),
      resetTime: Date.now() + config.windowMs
    };
  }
}
```

## Error Handling & Response Formats

### Standard Error Response Format

```typescript
interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    trace_id: string;
    timestamp: string;
  };
  meta?: {
    request_id: string;
    endpoint: string;
    user_id?: string;
  };
}

// Error codes
const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'AUTH_001',
  FORBIDDEN: 'AUTH_002',
  TOKEN_EXPIRED: 'AUTH_003',
  
  // Validation
  VALIDATION_ERROR: 'VAL_001',
  INVALID_CATEGORY_KEY: 'VAL_002',
  CIRCULAR_HIERARCHY: 'VAL_003',
  
  // Business Logic
  CATEGORY_NOT_FOUND: 'BIZ_001',
  CATEGORY_IN_USE: 'BIZ_002',
  PARENT_CATEGORY_INVALID: 'BIZ_003',
  
  // System
  RATE_LIMIT_EXCEEDED: 'SYS_001',
  CACHE_ERROR: 'SYS_002',
  DATABASE_ERROR: 'SYS_003',
  
  // External
  AI_SERVICE_UNAVAILABLE: 'EXT_001',
  CACHE_SERVICE_UNAVAILABLE: 'EXT_002'
} as const;
```

### HTTP Status Code Mapping

```typescript
const statusCodeMapping = {
  // 2xx Success
  200: 'OK - Request successful',
  201: 'Created - Resource created successfully',
  202: 'Accepted - Request accepted for processing',
  204: 'No Content - Successful request with no content',
  
  // 3xx Redirection
  304: 'Not Modified - Resource not modified (ETag match)',
  
  // 4xx Client Errors
  400: 'Bad Request - Invalid request format',
  401: 'Unauthorized - Authentication required',
  403: 'Forbidden - Insufficient permissions',
  404: 'Not Found - Resource not found',
  409: 'Conflict - Resource conflict (version mismatch)',
  422: 'Unprocessable Entity - Validation error',
  429: 'Too Many Requests - Rate limit exceeded',
  
  // 5xx Server Errors
  500: 'Internal Server Error - Unexpected server error',
  502: 'Bad Gateway - External service error',
  503: 'Service Unavailable - Service temporarily unavailable',
  504: 'Gateway Timeout - External service timeout'
};
```

### Validation Error Format

```typescript
interface ValidationError extends ApiError {
  error: {
    code: 'VAL_001';
    message: 'Validation failed';
    details: {
      field_errors: Array<{
        field: string;
        value: any;
        code: string;
        message: string;
      }>;
      constraint_violations: Array<{
        constraint: string;
        message: string;
      }>;
    };
  };
}

// Example validation error
const validationErrorExample = {
  error: {
    code: 'VAL_001',
    message: 'Validation failed',
    details: {
      field_errors: [
        {
          field: 'category_key',
          value: 'CERAMICS',
          code: 'DUPLICATE_KEY',
          message: 'Category key already exists'
        },
        {
          field: 'ai_confidence_threshold',
          value: 1.5,
          code: 'OUT_OF_RANGE',
          message: 'Value must be between 0.0 and 1.0'
        }
      ],
      constraint_violations: [
        {
          constraint: 'unique_category_key',
          message: 'Category key must be unique within the system'
        }
      ]
    },
    trace_id: 'req_12345',
    timestamp: '2025-09-04T16:20:08.814Z'
  },
  meta: {
    request_id: 'req_12345',
    endpoint: 'POST /material-config/categories',
    user_id: 'user_67890'
  }
};
```

## API Versioning Strategy

### Versioning Approach
- **URL Path Versioning**: `/v1/material-config/categories`
- **Header Versioning**: `API-Version: 1.0` (optional)
- **GraphQL Schema Versioning**: Field deprecation with `@deprecated`

### Version Management

```typescript
interface ApiVersion {
  version: string;
  status: 'active' | 'deprecated' | 'sunset';
  deprecation_date?: string;
  sunset_date?: string;
  migration_guide?: string;
  breaking_changes: string[];
}

const versionHistory = {
  'v1.0': {
    version: '1.0.0',
    status: 'active',
    description: 'Initial API version with full CRUD operations',
    breaking_changes: []
  },
  
  'v1.1': {
    version: '1.1.0',
    status: 'active',
    description: 'Added GraphQL subscriptions and enhanced search',
    breaking_changes: [
      'Property type enum values changed to SCREAMING_SNAKE_CASE',
      'Removed deprecated legacy_format field from category response'
    ]
  }
};
```

### Backward Compatibility

```typescript
// Legacy endpoint support
app.get('/api/material-categories/legacy', async (req, res) => {
  // Redirect with deprecation warning
  res.setHeader('Warning', '299 - "Deprecated API. Please use /v1/material-config/categories"');
  res.setHeader('Link', '</v1/material-config/categories>; rel="successor-version"');
  
  // Return legacy format
  const categories = await getLegacyCategories();
  res.json(categories);
});
```

## Caching Strategy

### Multi-tier Caching Architecture

```typescript
interface CachingStrategy {
  tiers: {
    // L1: Application cache (in-memory)
    application: {
      ttl: 60; // 1 minute
      maxSize: '100MB';
      evictionPolicy: 'LRU';
    };
    
    // L2: Redis cache (distributed)
    redis: {
      ttl: 300; // 5 minutes
      keyPrefix: 'material_api_v1:';
      cluster: true;
    };
    
    // L3: CDN cache (edge)
    cdn: {
      ttl: 3600; // 1 hour
      purgeOnUpdate: true;
      staleWhileRevalidate: 86400; // 1 day
    };
  };
}
```

### Cache Key Strategy

```typescript
class CacheKeyGenerator {
  static categoryList(params: CategoryListRequest): string {
    const sortedParams = this.sortObject(params);
    const hash = this.hash(JSON.stringify(sortedParams));
    return `categories:list:${hash}`;
  }
  
  static categoryDetail(id: string, include: string[]): string {
    const includeHash = this.hash(include.sort().join(','));
    return `category:${id}:${includeHash}`;
  }
  
  static categoryHierarchy(rootId?: string, maxDepth?: number): string {
    return `hierarchy:${rootId || 'root'}:depth_${maxDepth || 'all'}`;
  }
}
```

### Cache Invalidation

```typescript
class CacheInvalidator {
  async invalidateCategory(categoryId: string) {
    const patterns = [
      `category:${categoryId}:*`,
      `categories:list:*`,
      `hierarchy:*`,
      `legacy:*`
    ];
    
    // Invalidate all cache tiers
    await Promise.all([
      this.redis.deleteByPattern(patterns),
      this.cdn.purgeByTags([`category-${categoryId}`, 'categories']),
      this.websocket.broadcast('cache:invalidate', { categoryId, patterns })
    ]);
  }
  
  async invalidateHierarchy(rootCategoryId: string) {
    // Invalidate hierarchy caches when structure changes
    await this.redis.deleteByPattern(`hierarchy:${rootCategoryId}:*`);
    await this.cdn.purgeByTags([`hierarchy-${rootCategoryId}`]);
  }
}
```

## Performance Optimizations

### Database Query Optimization

```sql
-- Materialized view for common category queries
CREATE MATERIALIZED VIEW mv_category_summary AS
SELECT 
  mc.id,
  mc.category_key,
  mc.name,
  mc.display_name,
  mc.hierarchy_level,
  mc.sort_order,
  mc.is_active,
  mc.is_composite,
  COUNT(mp.id) as property_count,
  COUNT(cvr.id) as rule_count,
  mc.updated_at
FROM material_categories mc
LEFT JOIN material_properties mp ON mc.id = mp.category_id AND mp.is_active = true
LEFT JOIN category_validation_rules cvr ON mc.id = cvr.category_id AND cvr.is_active = true
WHERE mc.is_active = true
GROUP BY mc.id, mc.category_key, mc.name, mc.display_name, 
         mc.hierarchy_level, mc.sort_order, mc.is_active, 
         mc.is_composite, mc.updated_at;

-- Refresh strategy
CREATE OR REPLACE FUNCTION refresh_category_summary()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_summary;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic refresh
CREATE TRIGGER refresh_category_summary_on_category_change
  AFTER INSERT OR UPDATE OR DELETE ON material_categories
  FOR EACH STATEMENT EXECUTE FUNCTION refresh_category_summary();
```

### API Response Optimization

```typescript
// Response compression and streaming
app.get('/material-config/categories', async (req, res) => {
  // Enable compression
  res.setHeader('Content-Encoding', 'gzip');
  
  // Stream large responses
  if (req.query.stream === 'true') {
    res.setHeader('Content-Type', 'application/x-ndjson');
    const stream = getCategoryStream(req.query);
    stream.pipe(res);
  } else