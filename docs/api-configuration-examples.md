# API Configuration Examples - Dynamic AI Models

This document provides practical examples of how to use the dynamic AI model configuration system in the MIVAA PDF processing pipeline.

---

## Overview

All internal pipeline endpoints (`/api/internal/*`) accept an optional `ai_config` parameter that allows you to customize which AI models are used at each stage. If not provided, the system uses `DEFAULT_AI_CONFIG`.

---

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Pre-configured Profiles](#pre-configured-profiles)
3. [Endpoint-Specific Examples](#endpoint-specific-examples)
4. [Advanced Configurations](#advanced-configurations)
5. [Cost Optimization](#cost-optimization)
6. [Performance Tuning](#performance-tuning)

---

## Basic Usage

### Default Configuration (No ai_config)

If you don't provide `ai_config`, the system uses these defaults:

```json
{
  "job_id": "abc123",
  "extracted_images": [...]
}
```

**Defaults Used**:
- Visual Embeddings: SigLIP (primary) → CLIP (fallback)
- Classification: Llama Vision (primary) → Claude Sonnet (validation)
- Discovery: Claude Sonnet 4.5
- Metadata: Claude
- Text Embeddings: OpenAI text-embedding-3-small

### Custom Configuration

Override specific models while keeping others as default:

```json
{
  "job_id": "abc123",
  "extracted_images": [...],
  "ai_config": {
    "classification_confidence_threshold": 0.8,
    "discovery_model": "gpt-5"
  }
}
```

---

## Pre-configured Profiles

### 1. DEFAULT_AI_CONFIG (Balanced)

Best overall accuracy and reliability.

```json
{
  "ai_config": {
    "visual_embedding_primary": "google/siglip-so400m-patch14-384",
    "visual_embedding_fallback": "openai/clip-vit-base-patch32",
    "text_embedding_model": "text-embedding-3-small",
    "classification_primary_model": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    "classification_validation_model": "claude-sonnet-4-20250514",
    "classification_confidence_threshold": 0.7,
    "discovery_model": "claude-sonnet-4-20250514",
    "metadata_extraction_model": "claude",
    "chunking_model": "gpt-4o",
    "discovery_temperature": 0.1,
    "classification_temperature": 0.1,
    "metadata_temperature": 0.1,
    "discovery_max_tokens": 4096,
    "classification_max_tokens": 512,
    "metadata_max_tokens": 4096
  }
}
```

**Use When**: You need the best balance of accuracy, reliability, and performance.

### 2. FAST_CONFIG (Speed Optimized)

Faster processing with good accuracy.

```json
{
  "ai_config": {
    "discovery_model": "gpt-4o",
    "classification_validation_model": "claude-haiku-4-20250514",
    "metadata_extraction_model": "gpt",
    "discovery_max_tokens": 2048,
    "metadata_max_tokens": 2048
  }
}
```

**Use When**: You need faster processing times and can accept slightly lower accuracy.

**Speed Improvements**:
- GPT-4o is ~2x faster than Claude Sonnet for discovery
- Claude Haiku is ~3x faster than Claude Sonnet for validation
- Reduced tokens = faster responses

### 3. HIGH_ACCURACY_CONFIG (Quality Optimized)

Maximum accuracy for critical processing.

```json
{
  "ai_config": {
    "discovery_model": "gpt-5",
    "classification_validation_model": "claude-sonnet-4-20250514",
    "metadata_extraction_model": "claude",
    "classification_confidence_threshold": 0.8,
    "discovery_max_tokens": 8192,
    "metadata_max_tokens": 8192
  }
}
```

**Use When**: Accuracy is critical and processing time is not a concern.

**Accuracy Improvements**:
- GPT-5 provides best-in-class discovery
- Higher confidence threshold (0.8) ensures better quality
- More tokens = better context understanding

### 4. COST_OPTIMIZED_CONFIG (Budget Friendly)

Minimize costs while maintaining acceptable quality.

```json
{
  "ai_config": {
    "discovery_model": "gpt-4o",
    "classification_validation_model": "claude-haiku-4-20250514",
    "metadata_extraction_model": "gpt",
    "classification_confidence_threshold": 0.6,
    "discovery_max_tokens": 2048,
    "metadata_max_tokens": 2048
  }
}
```

**Use When**: You need to minimize API costs.

**Cost Savings**:
- GPT-4o is cheaper than Claude Sonnet
- Claude Haiku is ~10x cheaper than Claude Sonnet
- Lower threshold (0.6) = fewer validation calls
- Reduced tokens = lower costs

---

## Endpoint-Specific Examples

### Endpoint 10: classify-images

Customize image classification models and thresholds.

```bash
POST /api/internal/classify-images/abc123
```

```json
{
  "job_id": "abc123",
  "extracted_images": [
    {
      "filename": "image1.jpg",
      "path": "/tmp/image1.jpg",
      "page_number": 5,
      "width": 800,
      "height": 600
    }
  ],
  "ai_config": {
    "classification_primary_model": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    "classification_validation_model": "claude-sonnet-4-20250514",
    "classification_confidence_threshold": 0.75,
    "classification_temperature": 0.1,
    "classification_max_tokens": 512
  }
}
```

**Response**:
```json
{
  "success": true,
  "material_images": [...],
  "non_material_images": [...],
  "total_classified": 100,
  "material_count": 65,
  "non_material_count": 35
}
```

---

### Endpoint 30: save-images-db

Customize visual embedding models (SigLIP/CLIP).

```bash
POST /api/internal/save-images-db/abc123
```

```json
{
  "job_id": "abc123",
  "material_images": [
    {
      "filename": "material1.jpg",
      "storage_url": "https://...supabase.co/storage/v1/object/public/material-images/...",
      "page_number": 5
    }
  ],
  "document_id": "doc123",
  "workspace_id": "ws123",
  "ai_config": {
    "visual_embedding_primary": "google/siglip-so400m-patch14-384",
    "visual_embedding_fallback": "openai/clip-vit-base-patch32"
  }
}
```

**Response**:
```json
{
  "success": true,
  "images_saved": 65,
  "clip_embeddings_generated": 325
}
```

**Note**: 5 embeddings per image (visual, color, texture, style, material) = 65 × 5 = 325 total embeddings.

---

### Endpoint 40: extract-metadata

Customize metadata extraction model and parameters.

```bash
POST /api/internal/extract-metadata/abc123
```

```json
{
  "job_id": "abc123",
  "document_id": "doc123",
  "product_ids": ["prod1", "prod2", "prod3"],
  "pdf_text": "Full PDF text content...",
  "ai_config": {
    "metadata_extraction_model": "claude",
    "metadata_temperature": 0.1,
    "metadata_max_tokens": 4096
  }
}
```

**Response**:
```json
{
  "success": true,
  "products_enriched": 3,
  "metadata_fields_extracted": 42,
  "extraction_method": "ai_dynamic_claude",
  "model_used": "claude"
}
```

**Metadata Fields Extracted**:
- Dimensions (width, height, thickness)
- Colors and finishes
- Materials and composition
- Patterns and textures
- Applications and use cases
- Certifications and standards
- Designer/manufacturer info

---

### Endpoint 50: create-chunks

Customize chunking and text embedding models.

```bash
POST /api/internal/create-chunks/abc123
```

```json
{
  "job_id": "abc123",
  "document_id": "doc123",
  "workspace_id": "ws123",
  "extracted_text": "Full PDF text content...",
  "product_ids": ["prod1", "prod2"],
  "chunk_size": 1024,
  "chunk_overlap": 128,
  "ai_config": {
    "text_embedding_model": "text-embedding-3-small",
    "chunking_model": "gpt-4o"
  }
}
```

**Response**:
```json
{
  "success": true,
  "chunks_created": 107,
  "embeddings_generated": 107,
  "relationships_created": 163
}
```

---

## Advanced Configurations

### High-Volume Processing

For processing large batches of PDFs, optimize for speed and cost:

```json
{
  "ai_config": {
    "classification_primary_model": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    "classification_validation_model": "claude-haiku-4-20250514",
    "classification_confidence_threshold": 0.65,
    "discovery_model": "gpt-4o",
    "metadata_extraction_model": "gpt",
    "discovery_temperature": 0.2,
    "discovery_max_tokens": 2048,
    "metadata_max_tokens": 2048
  }
}
```

**Benefits**:
- Lower threshold (0.65) = fewer validation calls
- GPT-4o for discovery = faster processing
- Claude Haiku for validation = 10x cheaper
- Reduced tokens = lower costs
- Slightly higher temperature (0.2) = more creative but faster

---

### Premium Quality Processing

For high-value catalogs requiring maximum accuracy:

```json
{
  "ai_config": {
    "classification_primary_model": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    "classification_validation_model": "claude-sonnet-4-20250514",
    "classification_confidence_threshold": 0.85,
    "discovery_model": "gpt-5",
    "metadata_extraction_model": "claude",
    "visual_embedding_primary": "google/siglip-so400m-patch14-384",
    "discovery_temperature": 0.05,
    "metadata_temperature": 0.05,
    "discovery_max_tokens": 8192,
    "metadata_max_tokens": 8192
  }
}
```

**Benefits**:
- GPT-5 for discovery = best accuracy
- High threshold (0.85) = only best classifications
- SigLIP for embeddings = +19-29% accuracy over CLIP
- Low temperature (0.05) = most deterministic
- High max tokens = better context understanding

---

## Cost Optimization

### Estimated Costs Per PDF (100 pages, 50 images)

**DEFAULT_AI_CONFIG**:
- Discovery (Claude Sonnet): ~$0.50
- Classification (Llama + Claude): ~$0.30
- Metadata (Claude): ~$0.40
- Visual Embeddings (SigLIP/CLIP): ~$0.10
- Text Embeddings (OpenAI): ~$0.20
- **Total**: ~$1.50 per PDF

**COST_OPTIMIZED_CONFIG**:
- Discovery (GPT-4o): ~$0.25
- Classification (Llama + Haiku): ~$0.10
- Metadata (GPT): ~$0.20
- Visual Embeddings (SigLIP/CLIP): ~$0.10
- Text Embeddings (OpenAI): ~$0.20
- **Total**: ~$0.85 per PDF (43% savings)

**HIGH_ACCURACY_CONFIG**:
- Discovery (GPT-5): ~$1.00
- Classification (Llama + Sonnet): ~$0.40
- Metadata (Claude): ~$0.60
- Visual Embeddings (SigLIP/CLIP): ~$0.10
- Text Embeddings (OpenAI): ~$0.20
- **Total**: ~$2.30 per PDF (53% more expensive)

---

## Performance Tuning

### Reduce Processing Time

```json
{
  "ai_config": {
    "classification_confidence_threshold": 0.6,
    "discovery_model": "gpt-4o",
    "metadata_extraction_model": "gpt",
    "classification_validation_model": "claude-haiku-4-20250514",
    "discovery_max_tokens": 1024,
    "metadata_max_tokens": 1024,
    "classification_max_tokens": 256
  }
}
```

**Speed Improvements**:
- Lower threshold = fewer validation calls = faster
- GPT-4o = 2x faster than Claude
- Haiku = 3x faster than Sonnet
- Reduced tokens = faster responses
- **Estimated**: 40-50% faster processing

### Balance Speed and Quality

```json
{
  "ai_config": {
    "classification_confidence_threshold": 0.7,
    "discovery_model": "claude-sonnet-4-20250514",
    "metadata_extraction_model": "claude",
    "classification_validation_model": "claude-sonnet-4-20250514",
    "discovery_max_tokens": 3072,
    "metadata_max_tokens": 3072
  }
}
```

**Benefits**:
- Standard threshold (0.7) = good balance
- Claude Sonnet = best quality
- Medium tokens = good context
- **Estimated**: Standard processing time with best quality

---

## Testing Different Configurations

### A/B Testing Example

Test two configurations side-by-side:

**Configuration A (Speed)**:
```bash
curl -X POST https://v1api.materialshub.gr/api/internal/classify-images/job_a \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_a",
    "extracted_images": [...],
    "ai_config": {
      "classification_confidence_threshold": 0.6,
      "classification_validation_model": "claude-haiku-4-20250514"
    }
  }'
```

**Configuration B (Quality)**:
```bash
curl -X POST https://v1api.materialshub.gr/api/internal/classify-images/job_b \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_b",
    "extracted_images": [...],
    "ai_config": {
      "classification_confidence_threshold": 0.8,
      "classification_validation_model": "claude-sonnet-4-20250514"
    }
  }'
```

Compare results to find the best configuration for your use case.

---

## Best Practices

1. **Start with DEFAULT_AI_CONFIG**: It provides the best balance for most use cases.

2. **Test Before Production**: Use NOVA test script to validate configurations.

3. **Monitor Costs**: Track API usage and costs for different configurations.

4. **Optimize Iteratively**: Start with quality, then optimize for speed/cost.

5. **Use Pre-configured Profiles**: They're tested and optimized for specific scenarios.

6. **Document Your Choices**: Keep track of which configurations work best for different PDF types.

7. **Consider PDF Complexity**:
   - Simple catalogs → FAST_CONFIG or COST_OPTIMIZED_CONFIG
   - Complex technical docs → HIGH_ACCURACY_CONFIG
   - Mixed content → DEFAULT_AI_CONFIG

---

## Troubleshooting

### Low Classification Accuracy

**Problem**: Too many false positives/negatives in image classification.

**Solution**: Increase confidence threshold and use Claude Sonnet for validation:
```json
{
  "ai_config": {
    "classification_confidence_threshold": 0.8,
    "classification_validation_model": "claude-sonnet-4-20250514"
  }
}
```

### Slow Processing

**Problem**: Pipeline takes too long to complete.

**Solution**: Use FAST_CONFIG or reduce max tokens:
```json
{
  "ai_config": {
    "discovery_model": "gpt-4o",
    "classification_validation_model": "claude-haiku-4-20250514",
    "discovery_max_tokens": 2048,
    "metadata_max_tokens": 2048
  }
}
```

### High API Costs

**Problem**: API costs are too high.

**Solution**: Use COST_OPTIMIZED_CONFIG or lower threshold:
```json
{
  "ai_config": {
    "classification_confidence_threshold": 0.6,
    "discovery_model": "gpt-4o",
    "metadata_extraction_model": "gpt",
    "classification_validation_model": "claude-haiku-4-20250514"
  }
}
```

### Poor Metadata Quality

**Problem**: Extracted metadata is incomplete or inaccurate.

**Solution**: Use Claude with higher max tokens:
```json
{
  "ai_config": {
    "metadata_extraction_model": "claude",
    "metadata_temperature": 0.05,
    "metadata_max_tokens": 8192
  }
}
```

---

## Summary

The dynamic AI model configuration system gives you complete control over the PDF processing pipeline. Choose the right configuration based on your priorities:

- **Quality First**: HIGH_ACCURACY_CONFIG
- **Speed First**: FAST_CONFIG
- **Cost First**: COST_OPTIMIZED_CONFIG
- **Balanced**: DEFAULT_AI_CONFIG

All configurations are production-ready and tested with the NOVA end-to-end test script
```


