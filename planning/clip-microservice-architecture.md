# CLIP Microservice Architecture - Option 2 Planning

## Overview

This document outlines the architecture for extracting CLIP/SigLIP embedding generation into a separate microservice to improve scalability, reduce memory pressure on the main MIVAA service, and enable GPU acceleration.

---

## Current Architecture (After Option 1)

```
┌─────────────────────────────────────────────────────────┐
│  MIVAA PDF Extractor (v1api.materialshub.gr)           │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  PDF Processing Pipeline                       │    │
│  │  - Stage 0: Product Discovery                  │    │
│  │  - Stage 1: Text Extraction                    │    │
│  │  - Stage 2: Chunking                           │    │
│  │  - Stage 3: Image Processing                   │    │
│  │    ├─ Image Extraction                         │    │
│  │    ├─ Llama Vision Classification              │    │
│  │    └─ CLIP Embedding Generation ⚠️             │    │
│  │       (Loads 2GB+ models into memory)          │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Memory Usage: 4-5GB (with CLIP models loaded)          │
│  Risk: OOM if processing large batches                  │
└─────────────────────────────────────────────────────────┘
```

**Problems:**
- ⚠️ CLIP/SigLIP models consume 2GB+ memory
- ⚠️ Memory pressure during batch processing
- ⚠️ Cannot scale CLIP independently
- ⚠️ CPU-only processing (slow)

---

## Proposed Architecture (Option 2)

```
┌─────────────────────────────────────────────────────────┐
│  MIVAA PDF Extractor (v1api.materialshub.gr)           │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  PDF Processing Pipeline                       │    │
│  │  - Stage 0: Product Discovery                  │    │
│  │  - Stage 1: Text Extraction                    │    │
│  │  - Stage 2: Chunking                           │    │
│  │  - Stage 3: Image Processing                   │    │
│  │    ├─ Image Extraction                         │    │
│  │    ├─ Llama Vision Classification              │    │
│  │    └─ HTTP Request to CLIP Service ✅          │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Memory Usage: 2-3GB (no CLIP models)                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ HTTP POST /embed
                       │ { "image_url": "...", "types": [...] }
                       ↓
┌─────────────────────────────────────────────────────────┐
│  CLIP Embedding Service (clip.materialshub.gr:8001)    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  FastAPI Service                               │    │
│  │  - POST /embed - Generate embeddings           │    │
│  │  - POST /embed/batch - Batch processing        │    │
│  │  - GET /health - Health check                  │    │
│  │  - GET /models - List loaded models            │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Models:                                                 │
│  - SigLIP ViT-SO400M (1.5GB)                            │
│  - CLIP ViT-B/32 (600MB)                                │
│                                                          │
│  Memory Usage: 3-4GB (dedicated to CLIP)                │
│  Optional: GPU acceleration (10x faster)                │
└─────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ MIVAA service memory reduced by 2GB+
- ✅ CLIP service can scale independently
- ✅ Can add GPU for 10x faster embeddings
- ✅ Can restart CLIP service without affecting MIVAA
- ✅ Can process multiple PDFs in parallel

---

## Implementation Plan

### Phase 1: Create CLIP Microservice (Week 1)

**1.1 Create Service Repository**
- Create `mivaa-clip-service` repository
- FastAPI application structure
- Docker configuration
- Environment variables

**1.2 Implement API Endpoints**
```python
POST /embed
{
    "image_url": "https://...",
    "embedding_types": ["visual_512", "color_512", "texture_512", "style_512", "material_512"]
}

Response:
{
    "embeddings": {
        "visual_512": [...],
        "color_512": [...],
        ...
    },
    "model_used": "siglip-so400m-patch14-384",
    "processing_time_ms": 150
}

POST /embed/batch
{
    "images": [
        {"id": "img1", "url": "https://..."},
        {"id": "img2", "url": "https://..."}
    ],
    "embedding_types": ["visual_512", "color_512"]
}

Response:
{
    "results": [
        {"id": "img1", "embeddings": {...}},
        {"id": "img2", "embeddings": {...}}
    ],
    "total_processing_time_ms": 450
}
```

**1.3 Model Management**
- Load models on service startup
- Keep models in memory (persistent)
- Implement model unload/reload endpoints
- Health checks with model status

**1.4 Error Handling**
- Timeout protection (30s per image)
- Retry logic for failed embeddings
- Fallback to CLIP if SigLIP fails
- Comprehensive logging

---

### Phase 2: Update MIVAA Service (Week 1)

**2.1 Create CLIP Client**
```python
# app/services/clip_client.py

class CLIPClient:
    def __init__(self, base_url: str):
        self.base_url = base_url

    async def generate_embeddings(
        self,
        image_url: str,
        embedding_types: List[str]
    ) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/embed",
                json={
                    "image_url": image_url,
                    "embedding_types": embedding_types
                }
            )
            return response.json()
```

**2.2 Update RealEmbeddingsService**
- Add CLIP client integration
- Fallback to local models if service unavailable
- Update `generate_all_embeddings()` to use HTTP API
- Remove local model loading (optional)

**2.3 Configuration**
```env
CLIP_SERVICE_URL=http://clip.materialshub.gr:8001
CLIP_SERVICE_ENABLED=true
CLIP_SERVICE_TIMEOUT=60
```

---

### Phase 3: Deployment (Week 2)

**3.1 Infrastructure Setup**
- Deploy CLIP service to separate server/container
- Configure networking (internal/external access)
- Set up monitoring (Sentry, health checks)
- Configure auto-restart on failure

**3.2 Testing**
- Unit tests for CLIP service
- Integration tests with MIVAA
- Load testing (100+ concurrent requests)
- Failover testing (service down scenarios)

**3.3 Deployment Strategy**
```
1. Deploy CLIP service to staging
2. Test with MIVAA staging
3. Deploy CLIP service to production
4. Update MIVAA to use CLIP service (feature flag)
5. Monitor for 24 hours
6. Remove local CLIP models from MIVAA (optional)
```

---

### Phase 4: GPU Acceleration (Optional - Week 3)

**4.1 GPU Server Setup**
- Provision GPU-enabled server (NVIDIA T4/A10)
- Install CUDA drivers
- Configure PyTorch with GPU support

**4.2 Update CLIP Service**
- Detect GPU availability
- Move models to GPU
- Batch processing optimization
- Memory management for GPU

**4.3 Performance Gains**
- CPU: ~30s per batch (5 images)
- GPU: ~3s per batch (5 images)
- **10x faster processing**

---

## Cost Analysis

### Option 2A: Self-Hosted Microservice

**Infrastructure:**
- Server: $20-50/month (2-4GB RAM, 2 vCPU)
- GPU (optional): $200-500/month (NVIDIA T4)
- Total: $20-550/month

**Pros:**
- ✅ Full control
- ✅ No per-request costs
- ✅ Data privacy
- ✅ Can optimize for our use case

**Cons:**
- ❌ Infrastructure management
- ❌ Monitoring/maintenance overhead

---

### Option 2B: Third-Party API

**API Costs:**
- Replicate: ~$0.0005 per embedding
- HuggingFace: ~$0.0001 per embedding
- Together AI: ~$0.0002 per embedding

**Example:**
- 200 images × 5 embeddings = 1000 embeddings per PDF
- Cost per PDF: $0.10 - $0.50
- 100 PDFs/month: $10 - $50/month

**Pros:**
- ✅ Zero infrastructure
- ✅ Instant deployment
- ✅ Highly scalable

**Cons:**
- ❌ Per-request costs
- ❌ Data privacy concerns
- ❌ Network dependency

---

## Recommendation

**Start with Option 2A (Self-Hosted Microservice)**

**Reasoning:**
1. ✅ Better cost for high volume (100+ PDFs/month)
2. ✅ Full control over models and optimization
3. ✅ Data privacy (images stay on our servers)
4. ✅ Can add GPU later for 10x speedup
5. ✅ No vendor lock-in

**Timeline:**
- Week 1: Create service + integrate with MIVAA
- Week 2: Deploy and test
- Week 3 (optional): Add GPU acceleration

---

## Success Metrics

**Memory:**
- MIVAA service: <3GB (down from 5GB)
- CLIP service: 3-4GB (isolated)

**Performance:**
- CPU: 20-30 minutes per PDF (same as Option 1)
- GPU: 5-10 minutes per PDF (10x faster)

**Stability:**
- Zero OOM crashes on MIVAA service
- 99.9% uptime for CLIP service
- Automatic failover to local models

---

## Next Steps

1. ✅ **Implement Option 1** (DONE - load models once per batch)
2. ⏳ **Test Option 1** with NOVA PDF
3. 📋 **Review this plan** and approve Option 2
4. 🚀 **Start Phase 1** when ready (create CLIP microservice)

---

## Questions to Answer

1. **Server preference?** Separate VM, Docker container, or Kubernetes pod?
2. **GPU budget?** Worth $200-500/month for 10x speedup?
3. **Deployment timeline?** Urgent or can wait 1-2 weeks?
4. **Fallback strategy?** Keep local models or rely 100% on service?

---

**Document Status:** Planning
**Created:** 2025-11-28
**Author:** AI Assistant
**Next Review:** After Option 1 testing

```


