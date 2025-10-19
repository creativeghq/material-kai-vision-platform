# Automatic Categorization & Metadata Extraction

## 📋 Overview

The Material Kai Vision Platform automatically extracts and categorizes document content using AI-powered analysis, keyword matching, and pattern recognition. This guide explains how automatic categorization and metadata extraction work.

---

## 🎯 Automatic Categorization System

### How It Works

**Three-Method Extraction Pipeline:**

1. **AI-Powered Extraction** (Primary)
   - Uses MIVAA service for intelligent semantic analysis
   - Understands context and material properties
   - Highest accuracy for complex materials

2. **Keyword-Based Extraction** (Secondary)
   - Pattern matching against predefined keyword lists
   - Fast and reliable for known materials
   - Complements AI extraction

3. **Pattern-Based Extraction** (Tertiary)
   - Regex patterns for specific material/product types
   - Captures structured data (dimensions, specifications)
   - Handles standardized formats

### Automatic Process Flow

```
Document Upload
    ↓
Content Extraction (Text + Images)
    ↓
Category Analysis (AI + Keywords + Patterns)
    ↓
Confidence Scoring (0.0 - 1.0)
    ↓
High-Confidence Categories (>0.8)
    ↓
Auto-Create Missing Categories
    ↓
Update Document Metadata
    ↓
Index for Search & Filtering
```

---

## 🔧 Services & Implementation

### CategoryExtractionService

**Location:** `src/services/categoryExtractionService.ts`

**Key Methods:**
```typescript
// Extract categories from document content
extractCategories(
  content: string,
  documentId: string,
  options: CategoryExtractionOptions
): Promise<ExtractedCategoryData>

// AI-powered extraction
extractCategoriesWithAI(content: string, documentId: string)

// Keyword-based extraction
extractCategoriesWithKeywords(content: string, options)

// Pattern-based extraction
extractCategoriesWithPatterns(content: string)
```

**Configuration:**
```typescript
interface CategoryExtractionOptions {
  includeProductCategories?: boolean;      // Default: true
  includeMaterialCategories?: boolean;     // Default: true
  confidenceThreshold?: number;            // Default: 0.6
  maxCategories?: number;                  // Default: 10
  extractionMethods?: ('ai' | 'keyword' | 'pattern')[];
}
```

### DynamicCategoryManagementService

**Location:** `src/services/dynamicCategoryManagementService.ts`

**Key Methods:**
```typescript
// Auto-update categories from document processing
autoUpdateCategoriesFromDocument(
  documentId: string,
  extractedData: any
): Promise<void>

// Ensure category exists (create if needed)
ensureCategoryExists(extraction: CategoryExtractionResult): Promise<void>

// Update document with extracted categories
updateDocumentCategories(
  documentId: string,
  extractedCategories: CategoryExtractionResult[]
): Promise<void>
```

---

## 📊 Metadata Extraction

### What Metadata Is Extracted?

**Document-Level Metadata:**
- Title and description
- Source and file type
- Processing timestamp
- Extraction confidence scores
- Semantic tags and entities

**Material-Specific Metadata:**
- Material type (ceramic, wood, metal, etc.)
- Product category
- Functional properties (9 categories):
  1. Surface properties (texture, finish, color)
  2. Dimensional properties (size, weight)
  3. Mechanical properties (strength, hardness)
  4. Thermal properties (conductivity, expansion)
  5. Chemical properties (composition, reactivity)
  6. Electrical properties (conductivity, resistance)
  7. Optical properties (transparency, reflectance)
  8. Environmental properties (sustainability, recyclability)
  9. Safety properties (toxicity, flammability)

### Metadata Storage

**Database Location:** `documents` table

**Metadata Structure:**
```json
{
  "extracted_categories": [
    {
      "categoryKey": "ceramic",
      "confidence": 0.95,
      "extractedFrom": "ai",
      "context": "High-quality ceramic material"
    }
  ],
  "category_extraction_metadata": {
    "extractionMethod": "ai",
    "processingTime": 1234,
    "documentId": "doc-123",
    "timestamp": "2025-01-15T10:30:00Z"
  },
  "semantic_tags": ["ceramic", "porcelain", "material"],
  "extracted_entities": [
    {
      "type": "MATERIAL",
      "text": "ceramic",
      "confidence": 0.92
    }
  ],
  "last_category_update": "2025-01-15T10:30:00Z"
}
```

---

## 🏷️ Material Keywords & Categories

### Predefined Material Keywords

**Ceramics:**
- ceramic, porcelain, stoneware, earthenware, tile, brick

**Metals:**
- steel, aluminum, copper, iron, brass, bronze, titanium

**Natural Materials:**
- wood, stone, marble, granite, slate, limestone

**Composites:**
- concrete, composite, fiberglass, carbon fiber

**Textiles:**
- fabric, cotton, wool, silk, polyester, linen

**Glass & Transparent:**
- glass, acrylic, polycarbonate, plexiglass

### Category Hierarchy

```
Material Categories
├── Ceramics
│   ├── Porcelain
│   ├── Stoneware
│   └── Earthenware
├── Metals
│   ├── Ferrous
│   ├── Non-Ferrous
│   └── Alloys
├── Natural Materials
│   ├── Stone
│   ├── Wood
│   └── Organic
└── Composites
    ├── Fiber-Reinforced
    ├── Concrete
    └── Hybrid
```

---

## 🔄 Integration Points

### During PDF Processing

```python
# From consolidatedPDFWorkflowService.ts
const extractedCategories = await categoryExtractionService.extractCategories(
  docData.content,
  documentId,
  {
    includeProductCategories: true,
    includeMaterialCategories: true,
    confidenceThreshold: 0.6,
    maxCategories: 8
  }
);

// Update document with extracted categories
await updateDocumentCategories(documentId, extractedCategories);

// Auto-update global categories if high confidence
await dynamicCategoryManagementService.autoUpdateCategoriesFromDocument(
  documentId,
  { content: docData.content }
);
```

### In Knowledge Base Management

```typescript
// From KnowledgeBaseManagement.tsx
const response = await extractEntities(documentId);

if (response.data?.entities) {
  const materialEntities = response.data.entities
    .filter(e => e.type === 'MATERIAL');
  
  // Auto-populate metadata fields
  await supabase
    .from('enhanced_knowledge_base')
    .update({
      semantic_tags: materialEntities.map(e => e.text),
      metadata: { extracted_entities: response.data.entities }
    })
    .eq('id', documentId);
}
```

---

## 📈 Confidence Scoring

**Confidence Levels:**
- **0.9 - 1.0**: Very High (Auto-create categories)
- **0.7 - 0.9**: High (Suggest to user)
- **0.5 - 0.7**: Medium (Include in results)
- **< 0.5**: Low (Filter out)

**Calculation:**
```
AI Extraction: 0.6 - 1.0 (based on model confidence)
Keyword Match: 0.5 + (matches.length * 0.1), max 0.9
Pattern Match: 0.4 - 0.8 (based on pattern specificity)
```

---

## 🔍 Search & Filtering

### Using Extracted Categories

**Search by Category:**
```typescript
const results = await supabase
  .from('documents')
  .select('*')
  .contains('metadata->extracted_categories', [
    { categoryKey: 'ceramic' }
  ]);
```

**Filter by Confidence:**
```typescript
const highConfidence = extractedCategories.filter(
  cat => cat.confidence > 0.8
);
```

---

## ⚙️ Configuration

**Environment Variables:**
```
ENABLE_CATEGORY_EXTRACTION=true
CATEGORY_CONFIDENCE_THRESHOLD=0.6
AUTO_CREATE_CATEGORIES=true
MAX_CATEGORIES_PER_DOCUMENT=10
```

---

## 📚 Related Documentation

- `dynamic-category-system.md`: Detailed category management
- `platform-integrations-guide.md`: Integration overview
- `complete-multimodal-rag-system.md`: RAG architecture
- `mivaa-service.md`: MIVAA service details


