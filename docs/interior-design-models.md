# Interior Design AI Models - Complete List

## 📊 Model Inventory

### Text-to-Image Models (7 models)
Used when user provides **only a text prompt** (no reference image)

| Model ID | Name | Provider | Status |
|----------|------|----------|--------|
| `flux-dev` | FLUX.1-dev | Replicate | ✅ Working |
| `flux-schnell` | FLUX.1-schnell | Replicate | ✅ Working |
| `sdxl` | SDXL | Replicate | ✅ Working |
| `playground-v2.5` | Playground v2.5 | Replicate | ✅ Working |
| `stable-diffusion-3` | Stable Diffusion 3 | Replicate | ✅ Working |
| `kandinsky-2.2` | Kandinsky 2.2 | Replicate | ✅ Working |
| `proteus-v0.2` | Proteus v0.2 | Replicate | ✅ Working |

### Image-to-Image Models (7 models)
Used when user provides **reference image + prompt** for interior transformation

| Model ID | Name | Provider | Status |
|----------|------|----------|--------|
| `jschoormans/comfyui-interior-remodel` | ComfyUI Interior Remodel | Replicate | ✅ Working |
| `julian-at/interiorly-gen1-dev` | Interiorly Gen1 Dev | Replicate | ✅ Working |
| `davisbrown/designer-architecture` | Designer Architecture | Replicate | ✅ Working |
| `erayyavuz/interior-ai` | Interior AI | Replicate | ❌ Failing |
| `jschoormans/interior-v2` | Interior V2 | Replicate | ❌ Failing |
| `adirik/interior-design` | Adirik Interior Design | Replicate | ❌ Failing |
| `rocketdigitalai/interior-design-sdxl` | Interior Design SDXL | Replicate | ❌ Failing |

## 🎯 Smart Model Selection Logic

### Scenario 1: Text-to-Image Request
**User Input:**
```
"Generate a modern minimalist bedroom with oak flooring"
```

**Models Used:** All 7 text-to-image models
- FLUX.1-dev
- FLUX.1-schnell
- SDXL
- Playground v2.5
- Stable Diffusion 3
- Kandinsky 2.2
- Proteus v0.2

**Result:** 7 different variations

### Scenario 2: Image-to-Image Request
**User Input:**
```
Image: [bedroom.jpg]
Prompt: "Transform this into a modern minimalist style"
```

**Models Used:** Only 3 working image-to-image models
- ComfyUI Interior Remodel
- Interiorly Gen1 Dev
- Designer Architecture

**Result:** 3 transformed variations

### Scenario 3: Custom Model Selection
**User Input:**
```
{
  "prompt": "Modern bedroom",
  "models": ["flux-dev", "sdxl"]
}
```

**Models Used:** Only specified models
- FLUX.1-dev
- SDXL

**Result:** 2 variations

## 🔧 API Behavior

### Default Behavior (No Models Specified)

```python
# Text-to-image (no reference image)
if not request.image:
    models_to_use = TEXT_TO_IMAGE_MODELS  # All 7 text-to-image models

# Image-to-image (with reference image)
if request.image:
    models_to_use = [m for m in IMAGE_TO_IMAGE_MODELS if m.get("status") != "failing"]
    # Only 3 working models
```

### Custom Model Selection

```python
if request.models:
    models_to_use = [m for m in ALL_MODELS if m["id"] in request.models]
```

## 📈 Expected Results

| Request Type | Models Used | Expected Images |
|--------------|-------------|-----------------|
| Text-to-image (default) | 7 | 7 variations |
| Image-to-image (default) | 3 | 3 transformations |
| Custom selection | Variable | As specified |

## ✅ Complete Model Count: 14 Total
- 7 Text-to-Image
- 7 Image-to-Image (3 working, 4 failing)

