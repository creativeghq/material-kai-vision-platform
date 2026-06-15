# API Configuration Examples - Dynamic AI Models

**Last Updated**: 2026-05-03

This document provides practical examples of how to use the dynamic AI model configuration system in the MIVAA PDF processing pipeline. All cost figures use current Anthropic pricing (Opus 4.7 at $5/$25 per 1M, Haiku 4.5 at $1/$5 per 1M, Sonnet 4.6 at $3/$15 per 1M). Per-PDF totals are reconciled against the canonical 100-page / 50-image workload in [AI Models Architecture](./ai-models-architecture.md).

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
- Visual Embeddings: SLIG (SigLIP2 base, `siglip2-base-patch16-512`, native 768D) — Modal endpoint (768D)
- Classification (primary): Claude Opus 4.7 via Anthropic tool use (schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL`). Pre-2026-05-01 attempted Qwen3-VL on HuggingFace with Claude fallback; the Qwen endpoint had been 404-ing for months and was retired 2026-05-01 — vision is now Anthropic-only.
- Classification (validation pass): same as primary in DEFAULT_AI_CONFIG (`claude-opus-4-7`); fires when primary confidence < `classification_confidence_threshold` (default 0.7) OR primary fails. FAST_CONFIG and COST_OPTIMIZED_CONFIG override this to `claude-haiku-4-5`.
- Discovery: Claude Opus 4.7
- Metadata: Claude (claude-opus-4-7)
- Text Embeddings: Voyage AI voyage-4 (1024D, sole production embedder) → in-code 1024D-pinned legacy fallback (not invoked on the understanding path)

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

The numbers below (10/30/40/50) are internal endpoint identifiers under `/api/internal/*` — they are NOT pipeline-stage numbers. The named pipeline stages (Discovery → Layout+OCR → Chunking → Vision → Phase 3 OCR → Visual Embeddings → Understanding → Text Embeddings) are documented in [AI Models Architecture](./ai-models-architecture.md).

### `/api/internal/classify-images` (endpoint 10)

Customize image classification (primary + validation models, threshold) via the `ai_config` parameter.

### `/api/internal/save-images-db` (endpoint 30)

Customize visual embedding models (SLIG specialized types) via the `ai_config` parameter.

**Note**: 5 embeddings per image (visual, color, texture, style, material) = 65 × 5 = 325 total embeddings.

### `/api/internal/extract-metadata` (endpoint 40)

Customize metadata extraction model and parameters.

**Metadata Fields Extracted**:
- Dimensions (width, height, thickness)
- Colors and finishes
- Materials and composition
- Patterns and textures
- Applications and use cases
- Certifications and standards
- Designer/manufacturer info

### `/api/internal/create-chunks` (endpoint 50)

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

### Estimated Costs Per PDF (canonical workload: 100 pages, 50 images)

These align with the [AI Models Architecture](./ai-models-architecture.md) cost table — same workload, same assumptions, single source of truth.

**DEFAULT_AI_CONFIG**:
- Discovery (Claude Opus 4.7, 1 call): ~$0.08
- Classification primary (Claude Opus 4.7 tool use, 50 images): ~$0.13
- Classification validation pass (Claude Opus 4.7, fires only on low-conf primary): ~$0.03
- Metadata (Claude Opus 4.7, inline with vision): rolled into classification line
- Chunking (Claude Sonnet 4.6, ~500 chunks): ~$0.10
- Visual Embeddings (SLIG endpoint): endpoint-metered (Modal, scale-to-zero)
- Phase 3 OCR (PaddleOCR-VL on Modal): runtime-metered (scale-to-zero)
- Text + Understanding Embeddings (Voyage voyage-4): ~$0.05
- **Total**: ~$0.39 per PDF

**FAST_CONFIG** (Haiku for discovery + validation; smaller token caps):
- Discovery (Claude Haiku 4.5): ~$0.02
- Classification primary (Claude Opus 4.7): ~$0.13
- Classification validation pass (Claude Haiku 4.5): ~$0.01
- Chunking (Claude Sonnet 4.6): ~$0.10
- Visual + OCR + Voyage: same as above
- **Total**: ~$0.31 per PDF (≈20% saving over DEFAULT)

**HIGH_ACCURACY_CONFIG** (Opus everywhere, threshold raised to 0.8 → more validation calls fire):
- Discovery (Claude Opus 4.7, more tokens): ~$0.13
- Classification primary (Claude Opus 4.7): ~$0.13
- Classification validation pass (Claude Opus 4.7, fires more often at threshold 0.8): ~$0.10
- Chunking (Claude Sonnet 4.6): ~$0.10
- Visual + OCR + Voyage: same as above
- **Total**: ~$0.51 per PDF (≈30% more than DEFAULT)

**COST_OPTIMIZED_CONFIG** (Haiku for discovery + validation; threshold lowered to 0.6 → fewer validation calls fire):
- Discovery (Claude Haiku 4.5): ~$0.02
- Classification primary (Claude Opus 4.7 — primary stays Opus by default): ~$0.13
- Classification validation pass (Claude Haiku 4.5, threshold 0.6 → rare): ~$0.01
- Chunking (Claude Sonnet 4.6): ~$0.10
- Visual + OCR + Voyage: same as above
- **Total**: ~$0.31 per PDF (≈20% saving over DEFAULT)

> **Note on the cost-optimized profile**: at current Anthropic pricing (Opus 4.7 = $5/$25, Haiku 4.5 = $1/$5), COST_OPTIMIZED only saves ≈20% over DEFAULT versus the ≈45% it saved at pre-correction pricing. If you want a meaningful cost reduction beyond this, the lever is swapping the **primary** classification model — not just validation. That tradeoff is not currently exposed as a profile because the primary-model swap has direct implications for the understanding-embedding space's schema-version provenance.

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

2. **Test Before Production**: stage configuration changes against a non-production batch and compare per-PDF cost + classification confidence distributions before promoting.

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

**Solution**: Use FAST_CONFIG or reduce max tokens by switching to `gpt-4o` for discovery, `claude-haiku-4-5` for validation, and reducing `discovery_max_tokens` and `metadata_max_tokens` to 2048.

### High API Costs

**Problem**: API costs are too high.

**Solution**: Use COST_OPTIMIZED_CONFIG or lower threshold by reducing `classification_confidence_threshold` to 0.6, switching to `gpt-4o` for discovery, `gpt-4o` for metadata extraction, and `claude-haiku-4-5` for validation.

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

All configurations are production-ready.
