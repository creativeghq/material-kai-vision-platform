# Chunk Management System

## Overview

The Chunk Management System provides tools for viewing, analyzing, and managing text chunks extracted from PDF documents. Chunks are the fundamental units of text that are processed, embedded, and used for semantic search and AI-powered material recommendations.

## What are Chunks?

**Chunks** are segments of text extracted from PDF documents during processing. Each chunk:
- Contains a portion of the document text (typically 500-2000 characters)
- Has a sequential index within its source document
- Is associated with embeddings for semantic search
- May be linked to images and products
- Contains metadata about quality, classification, and context

## Features

### 1. Chunk Detail Modal

**Component**: `src/components/Admin/ChunkDetailModal.tsx`

The Chunk Detail Modal provides a comprehensive view of individual chunks with all related information.

#### Sections

**Full Content**
- Complete chunk text
- Character count
- Formatted display with proper whitespace

**Metadata**
- Chunk ID
- Created date
- Additional metadata (JSON format)
- Quality scores
- Classification information

**Embedding Information**
- Embedding type (text, hybrid, etc.)
- Model name (e.g., text-embedding-3-small)
- Dimensions (e.g., 1536)
- Generation status
- Created timestamp

**Related Images**
- Thumbnail grid of associated images
- Image names/captions
- Page numbers
- Confidence scores

**Related Chunks**
- Nearby chunks from the same document
- Proximity information (distance in positions)
- Preview of related chunk content
- Chunk indices

**Source Document**
- Document name
- Catalog information
- File source

#### Usage

```typescript
<ChunkDetailModal
  open={chunkDetailOpen}
  onOpenChange={setChunkDetailOpen}
  chunk={selectedChunk}
  relatedChunks={getRelatedChunks(selectedChunk)}
  images={getImagesByChunk(selectedChunk.id)}
  embedding={getEmbeddingByChunk(selectedChunk.id)}
  documentName={getDocumentDisplayName(selectedChunk)}
/>
```

### 2. Chunk Data Model

```typescript
interface DocumentChunk {
  id: string;
  document_id: string;
  workspace_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
```

### 3. Chunk Metadata

Chunks contain rich metadata including:

```typescript
{
  quality_score: number;        // 0-1 quality rating
  classification: string;       // 'product', 'supporting', 'administrative', 'transitional'
  page_numbers: number[];       // Source pages
  has_images: boolean;          // Whether chunk has associated images
  product_indicators: string[]; // Detected product markers
  semantic_coherence: number;   // 0-1 coherence score
  // ... additional metadata
}
```

## User Interface

### Chunk List View

**Location**: Admin → Knowledge Base → Chunks Tab

**Features**:
- Paginated chunk list (20 per page)
- Chunk preview cards showing:
  - Chunk index badge
  - Source document badge
  - Image count badge (if applicable)
  - Embedding status badge
  - Content preview (first 200 characters)
  - Context information (position, size, quality, date)
- Click to open Chunk Detail Modal

**Example Card**:
```
┌─────────────────────────────────────────────┐
│ [Chunk 5] [Harmony Catalog] [3 images] [✓] │
│                                             │
│ FOLD is a modular acoustic panel system... │
│                                             │
│ Position: 6  Size: 1,234 chars             │
│ Quality: 95%  Date: 2024-01-15             │
└─────────────────────────────────────────────┘
```

### Chunk Detail Modal

**Opened by**: Clicking on a chunk card in the Chunks Tab

**Features**:
- Full-screen modal with scrollable content
- Organized sections with clear headings
- Visual hierarchy with cards and badges
- Related content displayed in grids
- Close button to return to list

## Chunk Relationships

### Chunks → Images
- Chunks can be associated with multiple images
- Images are linked based on:
  - Page proximity
  - Semantic similarity
  - Spatial layout analysis
  - Caption matching

### Chunks → Products
- Chunks can be source material for products
- Products aggregate information from multiple chunks
- Relationship tracked in `product_chunks` table

### Chunks → Embeddings
- Each chunk typically has one text embedding
- Embeddings enable semantic search
- Generated using OpenAI text-embedding-3-small model

### Chunks → Related Chunks
- Chunks are related by:
  - Sequential proximity (same document)
  - Semantic similarity (embedding distance)
  - Shared product associations

## Chunk Processing Pipeline

### 1. Extraction
- PDF documents are split into chunks
- Chunk boundaries determined by:
  - Semantic coherence
  - Token limits
  - Structural markers (headings, sections)

### 2. Classification
- Chunks classified into types:
  - **Product**: Contains product information
  - **Supporting**: Provides context (moodboards, collections)
  - **Administrative**: Company info, contacts
  - **Transitional**: Navigation, headers, footers

### 3. Embedding Generation
- Text embeddings created for semantic search
- Model: OpenAI text-embedding-3-small
- Dimensions: 1536
- Stored in `embeddings` table

### 4. Image Association
- Images linked to chunks based on:
  - Page numbers
  - Spatial proximity
  - Caption analysis
  - Visual-text similarity (CLIP)

### 5. Product Creation
- Product chunks aggregated into products
- Metadata extracted and consolidated
- Product records created in `products` table

## API Integration

### Get Chunks

```typescript
// Get all chunks for a workspace
const { data, error } = await supabase
  .from('document_chunks')
  .select('*')
  .eq('workspace_id', workspaceId)
  .order('created_at', { ascending: false });

// Get chunks for a specific document
const { data, error } = await supabase
  .from('document_chunks')
  .select('*')
  .eq('document_id', documentId)
  .order('chunk_index', { ascending: true });
```

### Get Related Data

```typescript
// Get images for a chunk
const { data, error } = await supabase
  .from('document_images')
  .select('*')
  .contains('metadata', { chunk_ids: [chunkId] });

// Get embedding for a chunk
const { data, error } = await supabase
  .from('embeddings')
  .select('*')
  .eq('entity_id', chunkId)
  .eq('entity_type', 'chunk')
  .single();

// Get related chunks (by proximity)
const { data, error } = await supabase
  .from('document_chunks')
  .select('*')
  .eq('document_id', documentId)
  .gte('chunk_index', chunkIndex - 2)
  .lte('chunk_index', chunkIndex + 2)
  .order('chunk_index', { ascending: true });
```

## Quality Metrics

### Chunk Quality Score
- **Range**: 0-1
- **Factors**:
  - Text coherence
  - Completeness (no truncation)
  - Information density
  - Structural integrity

### Classification Confidence
- **Range**: 0-1
- **Indicates**: Confidence in chunk type classification
- **Threshold**: 0.7 for high confidence

### Semantic Coherence
- **Range**: 0-1
- **Measures**: Internal consistency of chunk content
- **Used for**: Chunk boundary optimization

## Best Practices

### Viewing Chunks
1. Use the Chunks Tab for overview and browsing
2. Click on chunks to view full details
3. Check related chunks for context
4. Review associated images for visual context
5. Verify embedding status for search functionality

### Analyzing Chunk Quality
1. Check quality score (aim for >0.7)
2. Review classification accuracy
3. Verify related chunks make sense
4. Ensure images are properly associated
5. Confirm embeddings are generated

### Troubleshooting
- **Low quality scores**: May indicate poor PDF quality or complex layouts
- **Missing embeddings**: Check embedding generation service
- **No related images**: Verify image extraction and association logic
- **Incorrect classification**: Review classification prompts and thresholds

## Integration with Other Features

### Search
- Chunks are the primary search units
- Embeddings enable semantic search
- Results ranked by relevance

### Products
- Products built from chunk aggregation
- Chunk metadata informs product properties
- Product-chunk relationships maintained

### AI Agent
- Agent uses chunks for context
- Retrieves relevant chunks for queries
- Synthesizes information from multiple chunks

## Related Documentation

- [Product Management](./product-management.md) - Managing products built from chunks
- [Knowledge Base](./knowledge-base.md) - Admin knowledge base overview
- [PDF Processing](./pdf-processing.md) - How chunks are created
- [Search System](./search-system.md) - How chunks are searched

