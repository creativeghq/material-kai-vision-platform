+++
id = "ARCH-DYNAMIC-MATERIAL-CATEGORIES-DB-SCHEMA-V1"
title = "Dynamic Material Categories Database Schema Design"
context_type = "architecture"
scope = "Database schema design for dynamic material categories refactoring"
target_audience = ["core-architect", "baas-supabase", "dev-core-web"]
granularity = "detailed"
status = "draft"
last_updated = "2025-09-04"
created_by = "core-architect"
parent_task = "TASK-ARCH-20250904-1610"
tags = ["database", "schema", "material-categories", "supabase", "hierarchy", "extensibility"]
related_context = [
    ".ruru/docs/architecture/dynamic-material-categories-refactoring-plan.md",
    "src/types/materials.ts",
    "supabase/functions/pdf-extract/index.ts"
]
validation_status = "pending"
implementation_priority = "critical"
+++

# Dynamic Material Categories Database Schema Design

## Overview

This document defines the database schema for migrating from hardcoded `MATERIAL_CATEGORIES` to a dynamic, database-backed configuration system. The schema supports hierarchical categories, extensible metadata, and AI extraction validation rules while maintaining optimal query performance.

## Current State Analysis

**Hardcoded Structure**: [`MATERIAL_CATEGORIES`](../../../src/types/materials.ts:783-1122) contains 35+ categories with rich metadata:
- **Base Materials**: CERAMICS, PORCELAIN, MARBLE, GRANITE, SLATE, etc.
- **Composite Materials**: GRANITE_COMPOSITE, MARBLE_COMPOSITE, etc.
- **Specialty Materials**: GLASS, METAL, CONCRETE, WOOD, VINYL, etc.

**Metadata Structure**: Each category contains:
- `name`: string identifier
- `finish`: array of finish options
- `size`: array of size specifications  
- `installationMethod`: array of installation approaches
- `application`: array of use cases

## Database Schema Design

### 1. material_categories Table

**Purpose**: Primary category definitions with hierarchical support

```sql
CREATE TABLE material_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic identification
  category_key VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'CERAMICS', 'GRANITE_COMPOSITE'
  name VARCHAR(255) NOT NULL,                -- e.g., 'ceramics', 'granite_composite'
  display_name VARCHAR(255) NOT NULL,       -- e.g., 'Ceramics', 'Granite Composite'
  description TEXT,
  
  -- Hierarchical structure
  parent_category_id UUID REFERENCES material_categories(id),
  category_path LTREE,                      -- Materialized path for efficient hierarchy queries
  hierarchy_level INTEGER DEFAULT 0,       -- 0=root, 1=child, 2=grandchild, etc.
  
  -- Ordering and organization
  sort_order INTEGER DEFAULT 0,
  display_group VARCHAR(100),               -- e.g., 'Natural Stone', 'Composites', 'Synthetic'
  
  -- Behavioral flags
  is_active BOOLEAN DEFAULT true,
  is_composite BOOLEAN DEFAULT false,       -- Identifies composite materials
  is_primary_category BOOLEAN DEFAULT true, -- For filtering in dropdowns
  
  -- AI and processing metadata
  ai_extraction_enabled BOOLEAN DEFAULT true,
  ai_confidence_threshold DECIMAL(3,2) DEFAULT 0.80,
  processing_priority INTEGER DEFAULT 5,   -- 1-10 scale for AI processing order
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  version INTEGER DEFAULT 1,
  
  -- Full-text search
  search_vector TSVECTOR,
  
  -- Constraints
  CONSTRAINT valid_hierarchy_level CHECK (hierarchy_level >= 0 AND hierarchy_level <= 3),
  CONSTRAINT valid_sort_order CHECK (sort_order >= 0),
  CONSTRAINT valid_processing_priority CHECK (processing_priority >= 1 AND processing_priority <= 10),
  CONSTRAINT valid_confidence_threshold CHECK (ai_confidence_threshold >= 0.0 AND ai_confidence_threshold <= 1.0)
);

-- Indexes for performance
CREATE INDEX idx_material_categories_category_key ON material_categories(category_key);
CREATE INDEX idx_material_categories_parent ON material_categories(parent_category_id);
CREATE INDEX idx_material_categories_path ON material_categories USING GIST(category_path);
CREATE INDEX idx_material_categories_active ON material_categories(is_active);
CREATE INDEX idx_material_categories_sort ON material_categories(sort_order);
CREATE INDEX idx_material_categories_search ON material_categories USING GIN(search_vector);
CREATE INDEX idx_material_categories_composite ON material_categories(is_composite);

-- Full-text search trigger
CREATE OR REPLACE FUNCTION update_material_categories_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', 
    COALESCE(NEW.name, '') || ' ' || 
    COALESCE(NEW.display_name, '') || ' ' || 
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.display_group, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER material_categories_search_vector_update
  BEFORE INSERT OR UPDATE ON material_categories
  FOR EACH ROW EXECUTE FUNCTION update_material_categories_search_vector();
```

### 2. material_properties Table

**Purpose**: Extensible metadata for categories (finish, size, installationMethod, application)

```sql
CREATE TABLE material_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign key relationship
  category_id UUID NOT NULL REFERENCES material_categories(id) ON DELETE CASCADE,
  
  -- Property definition
  property_type VARCHAR(50) NOT NULL,      -- 'finish', 'size', 'installationMethod', 'application'
  property_key VARCHAR(100) NOT NULL,      -- e.g., 'glossy', '12x12', 'thinset_mortar', 'floor'
  property_value VARCHAR(255) NOT NULL,    -- Display value
  property_description TEXT,
  
  -- Metadata
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  
  -- Constraints
  CONSTRAINT valid_property_type CHECK (
    property_type IN ('finish', 'size', 'installationMethod', 'application', 'custom')
  ),
  CONSTRAINT unique_category_property UNIQUE (category_id, property_type, property_key),
  CONSTRAINT valid_sort_order CHECK (sort_order >= 0),
  CONSTRAINT valid_usage_count CHECK (usage_count >= 0)
);

-- Indexes for performance
CREATE INDEX idx_material_properties_category ON material_properties(category_id);
CREATE INDEX idx_material_properties_type ON material_properties(property_type);
CREATE INDEX idx_material_properties_key ON material_properties(property_key);
CREATE INDEX idx_material_properties_active ON material_properties(is_active);
CREATE INDEX idx_material_properties_default ON material_properties(is_default);
CREATE INDEX idx_material_properties_usage ON material_properties(usage_count DESC);
```

### 3. category_validation_rules Table

**Purpose**: AI extraction and validation rules for each category

```sql
CREATE TABLE category_validation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign key relationship
  category_id UUID NOT NULL REFERENCES material_categories(id) ON DELETE CASCADE,
  
  -- Rule definition
  rule_type VARCHAR(50) NOT NULL,          -- 'ai_prompt', 'regex_pattern', 'keyword_match', 'image_feature'
  rule_name VARCHAR(100) NOT NULL,
  rule_content JSONB NOT NULL,             -- Flexible rule definition
  
  -- AI-specific fields
  ai_model_compatibility JSONB,            -- Compatible AI models/versions
  confidence_threshold DECIMAL(3,2) DEFAULT 0.75,
  training_examples JSONB,                 -- Sample training data
  
  -- Validation behavior
  is_active BOOLEAN DEFAULT true,
  is_primary_rule BOOLEAN DEFAULT false,   -- Primary rule for this category
  validation_order INTEGER DEFAULT 1,      -- Order of rule execution
  
  -- Performance tracking
  success_rate DECIMAL(5,4),               -- Success rate (0.0000-1.0000)
  avg_confidence DECIMAL(3,2),             -- Average confidence score
  total_validations INTEGER DEFAULT 0,
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  last_validated_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_rule_type CHECK (
    rule_type IN ('ai_prompt', 'regex_pattern', 'keyword_match', 'image_feature', 'custom')
  ),
  CONSTRAINT valid_confidence_threshold CHECK (confidence_threshold >= 0.0 AND confidence_threshold <= 1.0),
  CONSTRAINT valid_validation_order CHECK (validation_order >= 1),
  CONSTRAINT valid_success_rate CHECK (success_rate IS NULL OR (success_rate >= 0.0 AND success_rate <= 1.0))
);

-- Indexes for performance
CREATE INDEX idx_category_validation_rules_category ON category_validation_rules(category_id);
CREATE INDEX idx_category_validation_rules_type ON category_validation_rules(rule_type);
CREATE INDEX idx_category_validation_rules_active ON category_validation_rules(is_active);
CREATE INDEX idx_category_validation_rules_primary ON category_validation_rules(is_primary_rule);
CREATE INDEX idx_category_validation_rules_order ON category_validation_rules(validation_order);
CREATE INDEX idx_category_validation_rules_performance ON category_validation_rules(success_rate DESC, avg_confidence DESC);
```

### 4. Supporting Tables

#### material_category_versions Table (Version Control)

```sql
CREATE TABLE material_category_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES material_categories(id) ON DELETE CASCADE,
  
  -- Version tracking
  version_number INTEGER NOT NULL,
  change_type VARCHAR(50) NOT NULL,        -- 'created', 'updated', 'property_added', 'rule_changed'
  change_description TEXT,
  changes_json JSONB,                      -- Detailed change tracking
  
  -- Migration support
  migration_required BOOLEAN DEFAULT false,
  rollback_data JSONB,                     -- Data needed for rollback
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  CONSTRAINT valid_change_type CHECK (
    change_type IN ('created', 'updated', 'property_added', 'property_removed', 'rule_changed', 'deactivated')
  )
);

CREATE INDEX idx_material_category_versions_category ON material_category_versions(category_id);
CREATE INDEX idx_material_category_versions_version ON material_category_versions(version_number DESC);
```

#### material_category_cache Table (Performance Optimization)

```sql
CREATE TABLE material_category_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Cache key and data
  cache_key VARCHAR(255) NOT NULL UNIQUE,
  cache_data JSONB NOT NULL,
  cache_version INTEGER NOT NULL,
  
  -- Cache metadata
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  
  -- Cache type
  cache_type VARCHAR(50) NOT NULL,         -- 'full_category', 'properties', 'hierarchy', 'ai_rules'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_cache_type CHECK (
    cache_type IN ('full_category', 'properties', 'hierarchy', 'ai_rules', 'api_response')
  )
);

CREATE INDEX idx_material_category_cache_key ON material_category_cache(cache_key);
CREATE INDEX idx_material_category_cache_expires ON material_category_cache(expires_at);
CREATE INDEX idx_material_category_cache_type ON material_category_cache(cache_type);
```

## Hierarchical Design Decision

**Decision**: Use LTREE for materialized path with parent_id for flexibility

**Rationale**:
- **LTREE**: Efficient hierarchy queries, supports complex path operations
- **parent_id**: Simple parent-child relationships, easy to understand
- **category_path**: Materialized path like 'Natural_Stone.Granite' for fast ancestor/descendant queries
- **hierarchy_level**: Quick depth filtering without path parsing

**Examples**:
```
GRANITE (id: 1, path: 'Natural_Stone.Granite', level: 1)
├── GRANITE_COMPOSITE (id: 2, path: 'Natural_Stone.Granite.Composite', level: 2, parent_id: 1)
└── GRANITE_ENGINEERED (id: 3, path: 'Natural_Stone.Granite.Engineered', level: 2, parent_id: 1)
```

## Migration Strategy

### Data Migration from Hardcoded Categories

```sql
-- Migration function to populate from current hardcoded structure
CREATE OR REPLACE FUNCTION migrate_hardcoded_categories()
RETURNS VOID AS $$
DECLARE
  category_record RECORD;
  category_id UUID;
  property_types TEXT[] := ARRAY['finish', 'size', 'installationMethod', 'application'];
  property_type TEXT;
  property_value TEXT;
BEGIN
  -- Insert main categories (from MATERIAL_CATEGORIES constant)
  -- This will be populated by migration script based on current hardcoded data
  
  -- Example for CERAMICS category:
  INSERT INTO material_categories (
    category_key, name, display_name, description,
    display_group, is_composite, category_path, hierarchy_level
  ) VALUES (
    'CERAMICS', 'ceramics', 'Ceramics', 'Ceramic tile materials for various applications',
    'Traditional Materials', false, 'Traditional_Materials.Ceramics', 1
  ) RETURNING id INTO category_id;
  
  -- Insert properties for CERAMICS
  INSERT INTO material_properties (category_id, property_type, property_key, property_value, sort_order)
  SELECT 
    category_id,
    'finish',
    finish_option,
    INITCAP(finish_option),
    ROW_NUMBER() OVER (ORDER BY finish_option)
  FROM UNNEST(ARRAY['glossy', 'matte', 'semi-gloss', 'textured']) AS finish_option;
  
  -- Repeat for other property types and categories...
END;
$$ LANGUAGE plpgsql;
```

### Backward Compatibility Views

```sql
-- Compatibility view that mimics the original MATERIAL_CATEGORIES structure
CREATE OR REPLACE VIEW v_material_categories_legacy AS
SELECT 
  mc.category_key,
  jsonb_build_object(
    'name', mc.name,
    'finish', COALESCE(
      (SELECT jsonb_agg(mp.property_key ORDER BY mp.sort_order)
       FROM material_properties mp 
       WHERE mp.category_id = mc.id AND mp.property_type = 'finish' AND mp.is_active = true),
      '[]'::jsonb
    ),
    'size', COALESCE(
      (SELECT jsonb_agg(mp.property_key ORDER BY mp.sort_order)
       FROM material_properties mp 
       WHERE mp.category_id = mc.id AND mp.property_type = 'size' AND mp.is_active = true),
      '[]'::jsonb
    ),
    'installationMethod', COALESCE(
      (SELECT jsonb_agg(mp.property_key ORDER BY mp.sort_order)
       FROM material_properties mp 
       WHERE mp.category_id = mc.id AND mp.property_type = 'installationMethod' AND mp.is_active = true),
      '[]'::jsonb
    ),
    'application', COALESCE(
      (SELECT jsonb_agg(mp.property_key ORDER BY mp.sort_order)
       FROM material_properties mp 
       WHERE mp.category_id = mc.id AND mp.property_type = 'application' AND mp.is_active = true),
      '[]'::jsonb
    )
  ) AS category_data
FROM material_categories mc
WHERE mc.is_active = true
ORDER BY mc.sort_order, mc.display_name;
```

## Performance Optimizations

### Indexing Strategy

1. **Primary Lookups**: category_key, parent_id, active status
2. **Hierarchy Queries**: LTREE path with GiST index
3. **Search Operations**: Full-text search with GIN index
4. **Property Filtering**: Composite indexes on (category_id, property_type, is_active)
5. **API Caching**: cache table for materialized query results

### Query Patterns

```sql
-- Get all root categories
SELECT * FROM material_categories WHERE parent_category_id IS NULL AND is_active = true;

-- Get category hierarchy
SELECT * FROM material_categories WHERE category_path <@ 'Natural_Stone' AND is_active = true;

-- Get category with all properties
SELECT 
  mc.*,
  jsonb_object_agg(mp.property_type, mp.properties) as properties
FROM material_categories mc
LEFT JOIN (
  SELECT 
    category_id,
    property_type,
    jsonb_agg(
      jsonb_build_object(
        'key', property_key,
        'value', property_value,
        'is_default', is_default
      ) ORDER BY sort_order
    ) as properties
  FROM material_properties
  WHERE is_active = true
  GROUP BY category_id, property_type
) mp ON mc.id = mp.category_id
WHERE mc.category_key = $1
GROUP BY mc.id;

-- Search categories
SELECT * FROM material_categories 
WHERE search_vector @@ plainto_tsquery('english', $1) 
  AND is_active = true
ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC;
```

## Constraints and Validation

### Business Rules

1. **Unique Category Keys**: No duplicate category_key values
2. **Hierarchical Integrity**: parent_category_id must exist, no circular references
3. **Property Consistency**: Properties must belong to active categories
4. **AI Rule Validation**: At least one primary validation rule per AI-enabled category

### Data Integrity Functions

```sql
-- Prevent circular hierarchy references
CREATE OR REPLACE FUNCTION check_hierarchy_circular()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_category_id IS NOT NULL THEN
    -- Check if new parent would create circular reference
    IF EXISTS (
      SELECT 1 FROM material_categories 
      WHERE category_path @> (
        SELECT category_path FROM material_categories WHERE id = NEW.parent_category_id
      ) AND id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Circular hierarchy reference detected';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER material_categories_hierarchy_check
  BEFORE UPDATE ON material_categories
  FOR EACH ROW EXECUTE FUNCTION check_hierarchy_circular();
```

## API Integration Support

### Database Functions for API Layer

```sql
-- Get complete category configuration for API responses
CREATE OR REPLACE FUNCTION get_category_config(p_category_key VARCHAR DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'categories', jsonb_agg(
      jsonb_build_object(
        'id', mc.id,
        'key', mc.category_key,
        'name', mc.name,
        'displayName', mc.display_name,
        'description', mc.description,
        'parentId', mc.parent_category_id,
        'path', mc.category_path::text,
        'level', mc.hierarchy_level,
        'isComposite', mc.is_composite,
        'properties', COALESCE(props.properties, '{}'::jsonb),
        'validationRules', COALESCE(rules.rules, '[]'::jsonb),
        'metadata', jsonb_build_object(
          'sortOrder', mc.sort_order,
          'displayGroup', mc.display_group,
          'aiEnabled', mc.ai_extraction_enabled,
          'version', mc.version,
          'updatedAt', mc.updated_at
        )
      ) ORDER BY mc.sort_order, mc.display_name
    ),
    'lastUpdated', MAX(mc.updated_at),
    'totalCategories', COUNT(*)
  ) INTO result
  FROM material_categories mc
  LEFT JOIN (
    SELECT 
      mp.category_id,
      jsonb_object_agg(mp.property_type, 
        jsonb_agg(
          jsonb_build_object(
            'key', mp.property_key,
            'value', mp.property_value,
            'isDefault', mp.is_default
          ) ORDER BY mp.sort_order
        )
      ) as properties
    FROM material_properties mp
    WHERE mp.is_active = true
    GROUP BY mp.category_id
  ) props ON mc.id = props.category_id
  LEFT JOIN (
    SELECT 
      cvr.category_id,
      jsonb_agg(
        jsonb_build_object(
          'type', cvr.rule_type,
          'name', cvr.rule_name,
          'content', cvr.rule_content,
          'confidenceThreshold', cvr.confidence_threshold,
          'isPrimary', cvr.is_primary_rule
        ) ORDER BY cvr.validation_order
      ) as rules
    FROM category_validation_rules cvr
    WHERE cvr.is_active = true
    GROUP BY cvr.category_id
  ) rules ON mc.id = rules.category_id
  WHERE mc.is_active = true
    AND (p_category_key IS NULL OR mc.category_key = p_category_key);
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

## Row Level Security (RLS)

```sql
-- Enable RLS
ALTER TABLE material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_validation_rules ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY material_categories_read ON material_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY material_properties_read ON material_properties
  FOR SELECT USING (
    is_active = true AND 
    EXISTS (SELECT 1 FROM material_categories WHERE id = category_id AND is_active = true)
  );

-- Admin access for category management
CREATE POLICY material_categories_admin ON material_categories
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR 
    auth.jwt() ->> 'role' = 'material_manager'
  );

CREATE POLICY material_properties_admin ON material_properties
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR 
    auth.jwt() ->> 'role' = 'material_manager'
  );
```

## Key Architectural Decisions

1. **Hierarchical Model**: LTREE + parent_id for flexible hierarchy support
2. **Property Storage**: Separate table for extensible metadata
3. **Versioning**: Full audit trail with rollback capability
4. **AI Integration**: Dedicated validation rules table with performance tracking
5. **Caching Support**: Built-in cache table for API response optimization
6. **Search Capability**: Full-text search with PostgreSQL's native features

## Next Phase Handoff

This schema design provides the foundation for:
- **Phase 2**: Configuration service implementation
- **Phase 3**: Backend AI module integration 
- **Phase 4**: Frontend dynamic category loading
- **Phase 5**: Testing and validation

The design balances flexibility, performance, and maintainability while supporting all current hardcoded category features and enabling future extensibility.