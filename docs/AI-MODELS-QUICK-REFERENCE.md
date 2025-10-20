# AI Models Quick Reference

## 🎯 By Service/Feature

### Content Classification
| Model | Provider | Version | Speed | Cost | Status |
|-------|----------|---------|-------|------|--------|
| Claude 4.5 Haiku | Anthropic | 20250514 | ⚡⚡⚡ | 💰 | ✅ |

### PDF Processing & Chunking
| Model | Provider | Version | Speed | Cost | Status |
|-------|----------|---------|-------|------|--------|
| GPT-4o | OpenAI | Latest | ⚡⚡ | 💰💰 | ✅ |

### Embeddings (1536D)
| Model | Provider | Version | Speed | Cost | Status |
|-------|----------|---------|-------|------|--------|
| text-embedding-3-small | OpenAI | Latest | ⚡⚡⚡ | 💰 | ✅ |
| text-embedding-ada-002 | OpenAI | Latest | ⚡⚡⚡ | 💰 | ✅ |

### Vision Analysis
| Model | Provider | Version | Speed | Cost | Status |
|-------|----------|---------|-------|------|--------|
| Llama 3.2 90B Vision | Meta/Together | Turbo | ⚡⚡ | 💰💰 | ✅ |
| Llama 3.2 11B Vision | Meta/Together | Turbo | ⚡⚡⚡ | 💰 | ✅ |
| GPT-4o | OpenAI | Latest | ⚡⚡ | 💰💰 | ✅ |

### Image Validation
| Model | Provider | Version | Speed | Cost | Status |
|-------|----------|---------|-------|------|--------|
| Claude 4.5 Sonnet | Anthropic | 20250514 | ⚡⚡ | 💰💰 | ✅ |
| Claude 3.5 Sonnet | Anthropic | 20241022 | ⚡⚡ | 💰💰 | ✅ |

### Product Enrichment
| Model | Provider | Version | Speed | Cost | Status |
|-------|----------|---------|-------|------|--------|
| Claude 4.5 Sonnet | Anthropic | 20250514 | ⚡⚡ | 💰💰 | ✅ |
| Claude 3.5 Sonnet | Anthropic | 20241022 | ⚡⚡ | 💰💰 | ✅ |

### 3D Interior Design Generation
| Model | Provider | Type | Speed | Cost | Status |
|-------|----------|------|-------|------|--------|
| Stable Diffusion XL | Stability AI | Text-to-Image | ⚡⚡ | 💰💰 | ✅ |
| FLUX-Schnell | Black Forest Labs | Text-to-Image | ⚡⚡ | 💰💰 | ✅ |
| Interior Design AI | Replicate | Text-to-Image | ⚡⚡ | 💰💰 | ✅ |
| Designer Architecture | Replicate | Text-to-Image | ⚡⚡ | 💰💰 | ✅ |

---

## 🔧 Configuration Files

### Backend (Python)
**File**: `mivaa-pdf-extractor/app/config.py`

```python
# Anthropic
anthropic_model_classification = "claude-4-5-haiku-20250514"
anthropic_model_validation = "claude-4-5-sonnet-20250514"
anthropic_model_enrichment = "claude-4-5-sonnet-20250514"

# OpenAI
openai_model = "gpt-4o"
openai_embedding_model = "text-embedding-3-small"

# LlamaIndex
llamaindex_llm_model = "gpt-4o"
llamaindex_embedding_model = "text-embedding-3-small"

# Multimodal
multimodal_llm_model = "gpt-4o"
```

### Frontend (TypeScript)
**Files**: 
- `src/config/apis/openaiConfig.ts`
- `src/config/apis/replicateConfig.ts`

### Services
**Files**:
- `src/services/ContentClassificationService.ts`
- `src/services/AnthropicImageValidationService.ts`
- `src/services/AnthropicProductEnrichmentService.ts`
- `mivaa-pdf-extractor/app/services/llamaindex_service.py`
- `mivaa-pdf-extractor/app/services/together_ai_service.py`

---

## 🔐 Environment Variables

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
OPENAI_API_KEY=sk-...

# Together AI (for Llama models)
TOGETHER_API_KEY=...

# Replicate (for image generation)
REPLICATE_API_TOKEN=...

# Hugging Face
HUGGINGFACE_API_KEY=...
```

---

## 📊 Model Capabilities Matrix

| Model | Text | Vision | Multimodal | Streaming | Batch |
|-------|------|--------|------------|-----------|-------|
| Claude 4.5 Haiku | ✅ | ❌ | ❌ | ✅ | ✅ |
| Claude 4.5 Sonnet | ✅ | ✅ | ✅ | ✅ | ✅ |
| Claude 3.5 Sonnet | ✅ | ✅ | ✅ | ✅ | ✅ |
| GPT-4o | ✅ | ✅ | ✅ | ✅ | ✅ |
| text-embedding-3-small | ✅ | ❌ | ❌ | ❌ | ✅ |
| Llama 3.2 90B Vision | ✅ | ✅ | ✅ | ✅ | ✅ |
| Llama 3.2 11B Vision | ✅ | ✅ | ✅ | ✅ | ✅ |
| Stable Diffusion XL | ❌ | ❌ | ❌ | ❌ | ✅ |
| FLUX-Schnell | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 🚀 Performance Benchmarks

### Speed (Lower is Better)
- **Fastest**: Claude 4.5 Haiku, text-embedding-3-small
- **Fast**: Llama 3.2 11B, Stable Diffusion XL
- **Medium**: Claude 4.5 Sonnet, GPT-4o, FLUX-Schnell
- **Slowest**: Llama 3.2 90B, Specialized models

### Cost (Lower is Better)
- **Cheapest**: Claude 4.5 Haiku, text-embedding-3-small
- **Low**: Llama 3.2 11B, Stable Diffusion
- **Medium**: Claude 4.5 Sonnet, GPT-4o, FLUX
- **High**: Llama 3.2 90B, Specialized models

### Quality (Higher is Better)
- **Highest**: Claude 4.5 Sonnet, GPT-4o, FLUX-Schnell
- **High**: Claude 4.5 Haiku, Llama 3.2 90B
- **Good**: Llama 3.2 11B, Stable Diffusion XL
- **Adequate**: Specialized models (domain-specific)

---

## 🔄 Fallback Strategy

### Content Classification
1. Primary: Claude 4.5 Haiku
2. Fallback: Llama 3.2 11B

### Image Validation
1. Primary: Claude 4.5 Sonnet (Vision)
2. Fallback: Claude 3.5 Sonnet (Vision)
3. Fallback: Llama 3.2 90B (Vision)

### Product Enrichment
1. Primary: Claude 4.5 Sonnet
2. Fallback: Claude 3.5 Sonnet
3. Fallback: GPT-4o

### Embeddings
1. Primary: text-embedding-3-small
2. Fallback: text-embedding-ada-002

### 3D Generation
1. Primary: FLUX-Schnell
2. Fallback: Stable Diffusion XL
3. Fallback: Specialized models

---

## 📈 Usage Recommendations

### For Speed
Use: Claude 4.5 Haiku, Llama 3.2 11B, text-embedding-3-small

### For Quality
Use: Claude 4.5 Sonnet, GPT-4o, FLUX-Schnell

### For Cost
Use: Claude 4.5 Haiku, text-embedding-3-small, Stable Diffusion XL

### For Balanced Performance
Use: Claude 4.5 Sonnet, GPT-4o, Stable Diffusion XL

---

## ✅ All Models Status: ACTIVE & CONFIGURED

