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
    "embedding_types": ["visual_512", "color_512", "texture_512", "style_512", "material_512"],
    "prompts": {  // OPTIONAL: Text prompts to guide embedding generation
        "color": "Focus on color palette and dominant colors",
        "texture": "Focus on surface texture and material patterns",
        "style": "Focus on design style and aesthetic",
        "material": "Focus on material type and properties"
    }
}

Response:
{
    "embeddings": {
        "visual_512": [...],
        "color_512": [...],
        ...
    },
    "model_used": "siglip-so400m-patch14-384",
    "processing_time_ms": 150,
    "prompts_used": {
        "color": "Focus on color palette and dominant colors",
        ...
    }
}

POST /embed/batch
{
    "images": [
        {"id": "img1", "url": "https://..."},
        {"id": "img2", "url": "https://..."}
    ],
    "embedding_types": ["visual_512", "color_512"],
    "prompts": {  // OPTIONAL: Same prompts for all images in batch
        "color": "Focus on color palette",
        "texture": "Focus on surface texture"
    }
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

**1.3 Text-Guided CLIP Embeddings (Prompt Support)**

CLIP models support **text-guided image embeddings** using contrastive learning:

```python
# Standard visual embedding (no prompt)
image_features = model.get_image_features(image)

# Text-guided embedding (with prompt)
text_inputs = processor(text=["Focus on color palette"], return_tensors="pt")
text_features = model.get_text_features(**text_inputs)
image_inputs = processor(images=image, return_tensors="pt")
image_features = model.get_image_features(**image_inputs)

# Combine image and text features for guided embedding
guided_embedding = (image_features + text_features) / 2
```

**Prompt Configuration:**
- Store default prompts in database/config file
- Allow per-request prompt overrides via API
- Support multiple prompt strategies:
  - **Color:** "Focus on color palette, dominant colors, and color relationships"
  - **Texture:** "Focus on surface texture, material patterns, and tactile qualities"
  - **Style:** "Focus on design style, aesthetic, and visual composition"
  - **Material:** "Focus on material type, properties, and characteristics"

**Benefits:**
- ✅ More accurate specialized embeddings
- ✅ Better search results for specific aspects
- ✅ Configurable without code changes
- ✅ Can A/B test different prompts

**Implementation:**
```python
# app/config/clip_prompts.py
DEFAULT_PROMPTS = {
    "color": "Focus on color palette, dominant colors, and color relationships",
    "texture": "Focus on surface texture, material patterns, and tactile qualities",
    "style": "Focus on design style, aesthetic, and visual composition",
    "material": "Focus on material type, properties, and characteristics"
}

# Load from environment or database
def get_prompts():
    return os.getenv("CLIP_PROMPTS", DEFAULT_PROMPTS)
```

**1.4 Model Management**
- Load models on service startup
- Keep models in memory (persistent)
- Implement model unload/reload endpoints
- Health checks with model status
- Prompt configuration endpoint

**1.5 Error Handling**
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
        embedding_types: List[str],
        prompts: Optional[Dict[str, str]] = None  # NEW: Prompt support
    ) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {
                "image_url": image_url,
                "embedding_types": embedding_types
            }

            # Add prompts if provided
            if prompts:
                payload["prompts"] = prompts

            response = await client.post(
                f"{self.base_url}/embed",
                json=payload
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

# CLIP Prompts (optional - can override defaults)
CLIP_PROMPT_COLOR="Focus on color palette, dominant colors, and color relationships"
CLIP_PROMPT_TEXTURE="Focus on surface texture, material patterns, and tactile qualities"
CLIP_PROMPT_STYLE="Focus on design style, aesthetic, and visual composition"
CLIP_PROMPT_MATERIAL="Focus on material type, properties, and characteristics"
```

**2.4 Prompt Management**
```python
# app/services/clip_prompt_manager.py

class CLIPPromptManager:
    """Manages CLIP prompts for specialized embeddings."""

    def __init__(self):
        self.prompts = self._load_prompts()

    def _load_prompts(self) -> Dict[str, str]:
        """Load prompts from environment or use defaults."""
        return {
            "color": os.getenv("CLIP_PROMPT_COLOR",
                "Focus on color palette, dominant colors, and color relationships"),
            "texture": os.getenv("CLIP_PROMPT_TEXTURE",
                "Focus on surface texture, material patterns, and tactile qualities"),
            "style": os.getenv("CLIP_PROMPT_STYLE",
                "Focus on design style, aesthetic, and visual composition"),
            "material": os.getenv("CLIP_PROMPT_MATERIAL",
                "Focus on material type, properties, and characteristics")
        }

    def get_prompts(self, types: List[str]) -> Dict[str, str]:
        """Get prompts for specific embedding types."""
        return {t: self.prompts[t] for t in types if t in self.prompts}
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

## Important Considerations

### Prompt Configuration Strategy

**CLIP supports text-guided embeddings** using prompts to focus on specific aspects (color, texture, style, material).

**Configuration Options:**

**Option A: Environment Variables (Simple)**
```env
CLIP_PROMPT_COLOR="Focus on color palette and dominant colors"
CLIP_PROMPT_TEXTURE="Focus on surface texture and patterns"
```
- ✅ Easy to implement
- ✅ Can update via deployment
- ❌ Requires service restart to change

**Option B: Database/Config File (Flexible)**
```python
# Load from database or JSON config
prompts = load_prompts_from_db()
```
- ✅ Can update without restart
- ✅ Version history
- ❌ More complex implementation

**Option C: API Parameter (Most Flexible)**
```python
# Pass prompts per request
POST /embed {"prompts": {"color": "..."}}
```
- ✅ Can override per request
- ✅ A/B testing support
- ✅ No restart needed
- ❌ Requires MIVAA to manage prompts

**Recommended Approach: Hybrid**
1. **Default prompts:** Environment variables (Option A)
2. **Override support:** API parameters (Option C)
3. **Future:** Admin UI to manage defaults (Option B)

**Implementation Plan:**
- Phase 1: Environment variables with API override
- Phase 2: Database storage for defaults
- Phase 3: Admin UI for prompt management (optional)

**Note:** Unlike other MIVAA prompts, CLIP prompts are in a separate service, so admin panel integration requires additional work. For initial implementation, environment variables + API override is sufficient.

---

**Document Status:** Planning
**Created:** 2025-11-28
**Updated:** 2025-11-28 (Added admin control note)
**Author:** AI Assistant
**Next Review:** After Option 1 testing

```


