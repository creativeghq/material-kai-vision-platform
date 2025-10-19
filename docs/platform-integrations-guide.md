# Platform Integrations & Architecture Guide

## 📋 Overview

This document provides comprehensive details about the Material Kai Vision Platform's key integrations, including multimodal capabilities, LlamaIndex RAG, OCR services, search architecture, and automatic categorization systems.

---

## 🎯 Multimodal Capabilities

### Purpose & Benefits

**What are multimodal capabilities good for?**

Multimodal capabilities enable the platform to analyze materials from multiple perspectives simultaneously:

- **Visual Analysis**: Color, texture, pattern, surface finish, structural details
- **Textual Context**: Specifications, descriptions, usage instructions, technical data
- **Cross-Validation**: Combine visual and textual information for higher accuracy (85%+ confidence)
- **Enhanced Search**: Find materials using both text queries and image references
- **Comprehensive Understanding**: Materials have both visual and textual characteristics that need to be understood together

### Implementation

**Technology Stack:**
- **LLaMA Vision**: Advanced visual understanding of material properties
- **CLIP**: Visual embeddings for similarity analysis (512-dimensional vectors)
- **Parallel Processing**: 40% reduction in processing time through concurrent model execution
- **Fallback Mechanisms**: If one model fails, others continue processing

**Key Components:**
- `CrossModalLearning.ts`: Multi-modal fusion for material analysis
- `multimodal-analysis.md`: Complete service documentation
- Attention-based feature weighting for optimal modality combination

**Supported Modalities:**
1. Visual (images)
2. Spectral (wavelength data)
3. Thermal (temperature data)
4. Textual (descriptions)

---

## 🔍 LlamaIndex Integration

### Current Status

**Is LlamaIndex running as a process?**

No. LlamaIndex is integrated as a **library service**, not a separate process:

- Initialized at application startup in `mivaa-pdf-extractor/app/main.py`
- Runs within the FastAPI application context
- Provides RAG (Retrieval-Augmented Generation) capabilities
- Manages document indexing and semantic search

### How It's Used

**Workflows:**
1. **Document Indexing**: PDFs are processed and indexed for semantic search
2. **Query Processing**: Natural language queries retrieve relevant document chunks
3. **Multi-Modal Analysis**: Combines text and image analysis for comprehensive understanding
4. **Conversation Management**: Maintains conversation context for multi-turn interactions

**Key Services:**
- `LlamaIndexService`: Core RAG service (`llamaindex_service.py`)
- `AdvancedSearchService`: MMR (Maximal Marginal Relevance) search
- `PDFProcessor`: Advanced PDF processing with image extraction

**Configuration:**
```python
# From config.py
llamaindex_embedding_model: "text-embedding-3-small"  # 768 dimensions
llamaindex_llm_model: "gpt-3.5-turbo"
llamaindex_chunk_size: 1024
llamaindex_chunk_overlap: 200
llamaindex_similarity_top_k: 5
```

---

## 🔎 Search & RAG Architecture

### How Search Works

**Current Implementation:**

1. **Semantic Search**: Vector-based similarity using embeddings
2. **Hybrid Search**: Combines semantic + keyword matching
3. **MMR Search**: Maximal Marginal Relevance for diverse results
4. **Multi-Modal Search**: Text + image queries with OCR support

**Data Retrieval Flow:**
```
Query → Embedding Generation → Vector Search → 
Chunk Retrieval → Response Synthesis → Results
```

**Recent Changes:**
- Unified embedding model: `text-embedding-3-small` (768 dimensions)
- Supabase pgvector integration for vector storage
- Caching layer for frequently accessed data
- Real-time search analytics

**Key Endpoints:**
- `/api/search/documents/{document_id}/query`: Query specific document
- `/api/search/semantic`: Semantic search across all documents
- `/api/search/multimodal`: Multi-modal search with images
- `/api/search/mmr`: Maximal Marginal Relevance search

---

## 🎨 OCR Services

### What OCR Services Are Used?

**Primary Services:**
1. **EasyOCR**: Local text extraction with multi-language support
2. **Pytesseract**: Fallback OCR engine for text-as-images PDFs
3. **Image Preprocessing**: Enhancement for better accuracy

**Configuration:**
```python
# From ocr_service.py
languages: ['en']  # Configurable
confidence_threshold: 0.5
preprocessing_enabled: True
fallback_to_tesseract: True
```

### Current Status

**Integration Points:**
- PDF processing with OCR for scanned documents
- Image text extraction during multi-modal analysis
- Automatic text detection in material images
- Confidence scoring for extracted text

**Processing Pipeline:**
```
Image → Preprocessing → EasyOCR → Tesseract (fallback) → 
Confidence Filtering → Structured Output
```

---

## 🏷️ Automatic Categorization & Metadata

### How It Works

**Three-Method Extraction:**

1. **AI-Powered**: MIVAA service for intelligent extraction
2. **Keyword-Based**: Pattern matching against predefined keywords
3. **Pattern-Based**: Regex patterns for specific material/product types

**Automatic Process:**
```
Document Upload → Content Extraction → Category Analysis →
High-Confidence Categories Auto-Created → Document Metadata Updated
```

**Services:**
- `CategoryExtractionService`: Multi-method extraction
- `DynamicCategoryManagementService`: Category management
- `ImageTextMapper`: Keyword and material reference extraction

**Metadata Extraction:**
- Material categories (ceramic, wood, metal, etc.)
- Product categories
- Functional metadata (9 categories of properties)
- Semantic tags and entities
- Confidence scores

---

## ⚠️ Backward Compatibility & Legacy Code

### Current Legacy Patterns

**Deprecated Endpoints (To Be Removed):**
- `/api/mivaa/extract` → Redirects to `/api/mivaa/gateway`
- `/api/mivaa/process` → Redirects to `/api/mivaa/gateway`
- `/api/mivaa/status/:id` → Redirects to `/api/mivaa/gateway`

**Fallback Mechanisms:**
- `fallbackDatabaseSearch()`: Basic text matching when semantic search fails
- `fallbackToClient`: Client-side processing if server unavailable
- Dual embedding model support during migration (ada-002 → text-embedding-3-small)

**Deprecated Patterns to Remove:**
- Pydantic v1 imports (use v2)
- Legacy MIVAA route redirects
- Fallback database search functions
- Dual embedding model support (complete migration)

---

## 📊 Integration Flow Diagram

```
User Input
    ↓
[Frontend] → [Supabase Edge Functions] → [MIVAA Gateway]
    ↓                                          ↓
[Search Interface]                    [LlamaIndex Service]
    ↓                                          ↓
[Semantic Search] ← [Vector Store] ← [Embeddings]
    ↓                                          ↓
[Multi-Modal Analysis] ← [OCR Service] ← [Image Processing]
    ↓
[Category Extraction] → [Metadata Storage]
    ↓
[Results to User]
```

---

## 🔧 Configuration & Environment

**Key Environment Variables:**
- `OPENAI_API_KEY`: OpenAI API access
- `LLAMAINDEX_EMBEDDING_MODEL`: Embedding model selection
- `ENABLE_MULTIMODAL`: Enable/disable multimodal features
- `MULTIMODAL_LLM_MODEL`: Vision model (gpt-4-vision or claude)

---

## 📚 Related Documentation

- `multimodal-analysis.md`: Detailed multimodal service guide
- `dynamic-category-system.md`: Category extraction details
- `complete-multimodal-rag-system.md`: Complete RAG architecture
- `mivaa-service.md`: MIVAA gateway documentation
- `database-schema.md`: Database structure and vectors


