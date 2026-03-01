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

When the user provides only a text prompt (e.g., "Generate a modern minimalist bedroom with oak flooring"), all 7 text-to-image models are used: FLUX.1-dev, FLUX.1-schnell, SDXL, Playground v2.5, Stable Diffusion 3, Kandinsky 2.2, and Proteus v0.2. This produces 7 different variations.

### Scenario 2: Image-to-Image Request

When the user provides a reference image along with a prompt (e.g., "Transform this into a modern minimalist style"), only the 3 working image-to-image models are used: ComfyUI Interior Remodel, Interiorly Gen1 Dev, and Designer Architecture. This produces 3 transformed variations.

### Scenario 3: Custom Model Selection

When the user specifies particular models in the request (e.g., `"models": ["flux-dev", "sdxl"]`), only those specified models are used, producing the corresponding number of variations.

## 🔧 API Behavior

### Default Behavior (No Models Specified)

When no models are specified in the request:
- If there is no reference image, all text-to-image models are used (all 7 models).
- If a reference image is provided, only the working image-to-image models are used (filtering out any with status "failing"), resulting in 3 models.

### Custom Model Selection

When a models array is provided in the request, the API filters the full model list to include only those whose IDs appear in the request array.

## 📈 Expected Results

| Request Type | Models Used | Expected Images |
|--------------|-------------|-----------------|
| Text-to-image (default) | 7 | 7 variations |
| Image-to-image (default) | 3 | 3 transformations |
| Custom selection | Variable | As specified |

## ✅ Complete Model Count: 14 Total
- 7 Text-to-Image
- 7 Image-to-Image (3 working, 4 failing)
