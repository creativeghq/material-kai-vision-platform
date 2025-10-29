# AI Model Tracking Testing Guide

## Overview

The platform now tracks comprehensive AI model usage during PDF processing. This guide explains how to test and validate the AI model tracking system.

---

## What Gets Tracked

### Per AI Model Call:
- **Model Name**: LLAMA, Anthropic, CLIP, OpenAI
- **Stage**: classification, boundary_detection, embedding, etc.
- **Task**: product_classification, image_embedding, etc.
- **Latency**: Response time in milliseconds
- **Confidence Score**: 0.0-1.0
- **Token Usage**: Input and output tokens
- **Items Processed**: Number of items processed
- **Success/Failure**: Whether call succeeded
- **Result Summary**: What was generated

### Per Stage Summary:
- Models used in that stage
- Total calls and success rate
- Average latency
- Total items processed
- Average confidence score
- Token usage

### Per Model Summary:
- Total calls and success rate
- Average latency
- Total items processed
- Stages where used
- Tasks performed

---

## Testing Workflow

### Step 1: Upload Harmony PDF

```bash
# From frontend or test script
POST /api/rag/upload
- File: harmony.pdf
- Title: "Harmony Material Catalog"
- Description: "Test PDF for AI tracking"
```

**Expected Response:**
```json
{
  "job_id": "9d264abe-39d4-42ee-a40b-7bd7aefd4c09",
  "document_id": "42c2d906-256c-418b-b174-832bc76599de",
  "status": "processing",
  "progress": 0
}
```

### Step 2: Monitor Job Progress

```bash
GET /api/rag/job/{job_id}/status
```

**Expected Response:**
```json
{
  "job_id": "9d264abe-39d4-42ee-a40b-7bd7aefd4c09",
  "status": "processing",
  "progress": 25,
  "metadata": {
    "current_step": "Processing images...",
    "ai_tracking": {
      "ai_models_used": ["LLAMA", "Embeddings", "CLIP"],
      "ai_total_calls": 45,
      "ai_success_rate": 98.5,
      "ai_total_latency_ms": 12500,
      "ai_total_tokens": 45000,
      "ai_stage_summary": {
        "classification": {
          "models": ["LLAMA"],
          "calls": 15,
          "success_rate": 100,
          "items_processed": 71,
          "avg_confidence": 0.92
        }
      }
    }
  }
}
```

### Step 3: Get Detailed AI Tracking

```bash
GET /api/rag/job/{job_id}/ai-tracking
```

**Expected Response:**
```json
{
  "job_id": "9d264abe-39d4-42ee-a40b-7bd7aefd4c09",
  "status": "processing",
  "progress": 25,
  "ai_tracking": {
    "total_ai_calls": 45,
    "successful_calls": 44,
    "failed_calls": 1,
    "success_rate_percent": 97.78,
    "models_used": ["LLAMA", "Embeddings", "CLIP"],
    "total_latency_ms": 12500,
    "avg_latency_ms": 277.78,
    "total_items_processed": 215,
    "total_input_tokens": 25000,
    "total_output_tokens": 20000,
    "total_tokens": 45000,
    "stage_summary": {
      "classification": {
        "models_used": ["LLAMA"],
        "total_calls": 15,
        "successful_calls": 15,
        "failed_calls": 0,
        "total_latency_ms": 3000,
        "avg_latency_ms": 200,
        "total_items_processed": 71,
        "avg_confidence": 0.92
      },
      "boundary_detection": {
        "models_used": ["Embeddings"],
        "total_calls": 10,
        "successful_calls": 10,
        "failed_calls": 0,
        "total_latency_ms": 2500,
        "avg_latency_ms": 250,
        "total_items_processed": 71,
        "avg_confidence": 0.88
      },
      "embedding": {
        "models_used": ["CLIP"],
        "total_calls": 20,
        "successful_calls": 19,
        "failed_calls": 1,
        "total_latency_ms": 7000,
        "avg_latency_ms": 350,
        "total_items_processed": 215,
        "avg_confidence": 0.85
      }
    }
  }
}
```

### Step 4: Get Stage-Specific Tracking

```bash
GET /api/rag/job/{job_id}/ai-tracking/stage/classification
```

**Expected Response:**
```json
{
  "stage": "classification",
  "models_used": ["LLAMA"],
  "total_calls": 15,
  "successful_calls": 15,
  "failed_calls": 0,
  "success_rate_percent": 100,
  "total_latency_ms": 3000,
  "avg_latency_ms": 200,
  "total_items_processed": 71,
  "avg_confidence": 0.92,
  "total_input_tokens": 10000,
  "total_output_tokens": 8000,
  "calls": [
    {
      "model_name": "LLAMA",
      "stage": "classification",
      "task": "product_classification",
      "timestamp": "2025-10-29T05:00:00Z",
      "latency_ms": 200,
      "confidence_score": 0.95,
      "result_summary": "Classified as product content",
      "items_processed": 5,
      "success": true
    }
  ]
}
```

### Step 5: Get Model-Specific Tracking

```bash
GET /api/rag/job/{job_id}/ai-tracking/model/LLAMA
```

**Expected Response:**
```json
{
  "model": "LLAMA",
  "total_calls": 15,
  "successful_calls": 15,
  "failed_calls": 0,
  "success_rate_percent": 100,
  "total_latency_ms": 3000,
  "avg_latency_ms": 200,
  "total_items_processed": 71,
  "stages_used": ["classification"],
  "tasks": ["product_classification"]
}
```

---

## Expected Metrics for Harmony PDF

### Overall Job:
- **Total AI Calls**: 40-50
- **Success Rate**: 95%+
- **Total Latency**: 10-15 seconds
- **Total Tokens**: 40,000-50,000
- **Models Used**: LLAMA, Embeddings, CLIP

### Per Stage:
- **Classification**: 15 calls, 100% success, 0.92 avg confidence
- **Boundary Detection**: 10 calls, 100% success, 0.88 avg confidence
- **Embedding**: 20 calls, 95% success, 0.85 avg confidence

### Final Results:
- **Images Extracted**: 50-80 (after intelligent extraction)
- **Chunks Created**: 200-300
- **Products Identified**: 14
- **Embeddings Generated**: 200-300

---

## Validation Checklist

- [ ] Job uploads successfully
- [ ] Progress updates in real-time
- [ ] AI tracking data appears in job status
- [ ] `/ai-tracking` endpoint returns comprehensive metrics
- [ ] `/ai-tracking/stage/{stage}` returns stage-specific data
- [ ] `/ai-tracking/model/{model}` returns model-specific data
- [ ] All AI models tracked (LLAMA, Anthropic, CLIP, OpenAI)
- [ ] Confidence scores recorded (0.0-1.0)
- [ ] Token usage tracked
- [ ] Latency measured in milliseconds
- [ ] Success/failure rates calculated
- [ ] Per-stage summaries accurate
- [ ] Per-model summaries accurate
- [ ] Database persists AI tracking data
- [ ] UI displays AI model information

---

## Troubleshooting

### No AI tracking data appears
- Check if `ai_tracker` is initialized in job_storage
- Verify progress callbacks are being called
- Check server logs for AI model call logging

### Confidence scores are 0 or missing
- Ensure AI models are returning confidence scores
- Check if `confidence_score` is being passed in details

### Token usage not tracked
- Verify AI models are returning token counts
- Check if `input_tokens` and `output_tokens` are in details

### Latency seems wrong
- Ensure timestamps are accurate
- Check if latency_ms is being calculated correctly

---

## Next Steps

1. Deploy changes to server
2. Run Harmony PDF test
3. Validate all AI tracking metrics
4. Update frontend to display AI model information
5. Add AI tracking to admin dashboard

