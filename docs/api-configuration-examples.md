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

**Defaults Used**:
- Visual Embeddings: SLIG (SigLIP2) - HuggingFace endpoint (768D)
- Classification: Qwen3-VL-32B-Instruct - HuggingFace endpoint
- Discovery: Claude Opus 4.7
- Metadata: Claude
- Text Embeddings: Voyage AI voyage-4 (1024D) → OpenAI fallback (1024D)

### Custom Configuration

You can override specific models while keeping others as default by providing an `ai_config` object with only the fields you want to change.

---

## Pre-configured Profiles

### 1. DEFAULT_AI_CONFIG (Balanced)

Best overall accuracy and reliability.

**Use When**: You need the best balance of accuracy, reliability, and performance.

### 2. FAST_CONFIG (Speed Optimized)

Faster processing with good accuracy.

**Use When**: You need faster processing times and can accept slightly lower accuracy.

**Speed Improvements**:
- GPT-4o is ~2x faster than Claude Opus for discovery
- Claude Haiku is ~3x faster than Claude Opus for validation
- Reduced tokens = faster responses

### 3. HIGH_ACCURACY_CONFIG (Quality Optimized)

Maximum accuracy for critical processing.

**Use When**: Accuracy is critical and processing time is not a concern.

**Accuracy Improvements**:
- GPT-5 provides best-in-class discovery
- Higher confidence threshold (0.8) ensures better quality
- More tokens = better context understanding

### 4. COST_OPTIMIZED_CONFIG (Budget Friendly)

Minimize costs while maintaining acceptable quality.

**Use When**: You need to minimize API costs.

**Cost Savings**:
- GPT-4o is cheaper than Claude Opus
- Claude Haiku is ~20x cheaper than Claude Opus
- Lower threshold (0.6) = fewer validation calls
- Reduced tokens = lower costs

---

## Endpoint-Specific Examples

### Endpoint 10: classify-images

Customize image classification models and thresholds via the `ai_config` parameter.

### Endpoint 30: save-images-db

Customize visual embedding models (SigLIP/CLIP) via the `ai_config` parameter.

**Note**: 5 embeddings per image (visual, color, texture, style, material) = 65 × 5 = 325 total embeddings.

### Endpoint 40: extract-metadata

Customize metadata extraction model and parameters.

**Metadata Fields Extracted**:
- Dimensions (width, height, thickness)
- Colors and finishes
- Materials and composition
- Patterns and textures
- Applications and use cases
- Certifications and standards
- Designer/manufacturer info

### Endpoint 50: create-chunks

Customize chunking and text embedding models.

---

## Advanced Configurations

### High-Volume Processing

For processing large batches of PDFs, optimize for speed and cost:

**Benefits**:
- Lower threshold (0.65) = fewer validation calls
- GPT-4o for discovery = faster processing
- Claude Haiku for validation = 10x cheaper
- Reduced tokens = lower costs
- Slightly higher temperature (0.2) = more creative but faster

---

### Premium Quality Processing

For high-value catalogs requiring maximum accuracy:

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
- Discovery (Claude Opus): ~$2.50
- Classification (Qwen + Claude): ~$0.30
- Metadata (Claude): ~$0.40
- Visual Embeddings (SigLIP/CLIP): ~$0.10
- Text Embeddings (OpenAI): ~$0.20
- **Total**: ~$1.50 per PDF

**COST_OPTIMIZED_CONFIG**:
- Discovery (GPT-4o): ~$0.25
- Classification (Qwen + Haiku): ~$0.10
- Metadata (GPT): ~$0.20
- Visual Embeddings (SigLIP/CLIP): ~$0.10
- Text Embeddings (OpenAI): ~$0.20
- **Total**: ~$0.85 per PDF (43% savings)

**HIGH_ACCURACY_CONFIG**:
- Discovery (GPT-5): ~$1.00
- Classification (Qwen + Opus): ~$0.40
- Metadata (Claude): ~$0.60
- Visual Embeddings (SigLIP/CLIP): ~$0.10
- Text Embeddings (OpenAI): ~$0.20
- **Total**: ~$2.30 per PDF (53% more expensive)

---

## Performance Tuning

### Reduce Processing Time

**Speed Improvements**:
- Lower threshold = fewer validation calls = faster
- GPT-4o = 2x faster than Claude
- Haiku = 3x faster than Opus
- Reduced tokens = faster responses
- **Estimated**: 40-50% faster processing

### Balance Speed and Quality

**Benefits**:
- Standard threshold (0.7) = good balance
- Claude Opus = best quality
- Medium tokens = good context
- **Estimated**: Standard processing time with best quality

---

## Testing Different Configurations

### A/B Testing Example

Test two configurations side-by-side by submitting separate jobs with different `ai_config` values. Compare results to find the best configuration for your use case.

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

**Solution**: Increase confidence threshold and use Claude Opus for validation by setting `classification_confidence_threshold` to 0.8 and `classification_validation_model` to `claude-opus-4-7` in your `ai_config`.

### Slow Processing

**Problem**: Pipeline takes too long to complete.

**Solution**: Use FAST_CONFIG or reduce max tokens by switching to `gpt-4o` for discovery, `claude-haiku-4-20250514` for validation, and reducing `discovery_max_tokens` and `metadata_max_tokens` to 2048.

### High API Costs

**Problem**: API costs are too high.

**Solution**: Use COST_OPTIMIZED_CONFIG or lower threshold by reducing `classification_confidence_threshold` to 0.6, switching to `gpt-4o` for discovery, `gpt` for metadata extraction, and `claude-haiku-4-20250514` for validation.

### Poor Metadata Quality

**Problem**: Extracted metadata is incomplete or inaccurate.

**Solution**: Use Claude with higher max tokens by setting `metadata_extraction_model` to `claude`, `metadata_temperature` to 0.05, and `metadata_max_tokens` to 8192.

---

## Summary

The dynamic AI model configuration system gives you complete control over the PDF processing pipeline. Choose the right configuration based on your priorities:

- **Quality First**: HIGH_ACCURACY_CONFIG
- **Speed First**: FAST_CONFIG
- **Cost First**: COST_OPTIMIZED_CONFIG
- **Balanced**: DEFAULT_AI_CONFIG

All configurations are production-ready and tested with the NOVA end-to-end test script.
