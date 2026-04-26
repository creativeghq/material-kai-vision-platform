# Interior Design AI Models — Complete List

This is the canonical inventory of every model the Interior Designer / KAI agent can call, and what each is for. Source of truth for the variations grid is `mivaa-pdf-extractor/app/api/interior_design_routes.py` (`TEXT_TO_IMAGE_MODELS` + `IMAGE_TO_IMAGE_MODELS`). Source of truth for pricing is `mivaa-pdf-extractor/app/config/ai_pricing.py` (`REPLICATE_PRICING`).

There are two distinct entry points:

1. **Variations Grid** — `/api/interior` on MIVAA, fan-out across many models in parallel, results stream into the generation panel.
2. **Single inline result** — `generate_gemini` tool → `generate-interior-gemini` Supabase edge function. Returns one image inline in chat, used for chip-mode flows (image-edit, redesign, copy-style, floor-plan, materials-board).

The grid and the single-result path **must not both run for the same user request** — the grid already includes a Gemini tile, so calling both would double-bill.

---

## 1. Variations Grid (`/api/interior`)

### Text-to-Image (no uploaded image)

| Model ID | Backing model | Provider | Cost (raw) | Purpose |
|---|---|---|---|---|
| `gemini-interior` | `gemini-3.1-flash-image-preview` (fast tier) via `generate-interior-gemini` edge function | Gemini | billed by edge fn (6 cr fast / 15 cr pro) | Photorealistic interior render via Gemini 3 Flash Image. Edge fn handles credits + uploads internally. |
| `flux-2-pro` | `black-forest-labs/flux-2-pro` | Replicate | $0.05 | Production-grade 4MP photoreal text-to-image. Best overall quality for new rooms from scratch. |
| `playground-v2.5` | `playgroundai/playground-v2.5-1024px-aesthetic` | Replicate | $0.01 | Aesthetic-tuned SD model — soft, magazine-style interiors. |
| `sd3` | `stability-ai/stable-diffusion-3` | Replicate | $0.055 | SD 3 baseline — strong prompt adherence, neutral aesthetic. |

### Image-to-Image (uploaded room photo)

| Model ID | Backing model | Provider | Cost (raw) | Schema / Notes |
|---|---|---|---|---|
| `gemini-interior` | `gemini-3.1-flash-image-preview` (fast tier, image-edit mode) | Gemini | billed by edge fn (6 cr fast / 15 cr pro) | Image-edit / redesign on the uploaded room. |
| `comfyui-interior-remodel` | `jschoormans/comfyui-interior-remodel` | Replicate | $0.02 | `comfyui_interior` schema. Minimal: image + prompt only — sending standard SD params triggers 422. Strong remodel results. |
| `interiorly-gen1-dev` | `julian-at/interiorly-gen1-dev` | Replicate | $0.015 | `flux_lora_interior` schema. Flux LoRA tuned on interiors, supports `prompt_strength` for img2img. |
| `designer-architecture` | `davisbrown/designer-architecture` | Replicate | $0.018 | Generic schema. Architecture-focused, holds structure tightly. |
| `interior-v2` | `jschoormans/interior-v2` | Replicate | $0.02 | `interior_v2` schema. Minimal — only prompt + image. |
| `adirik-interior-design` | `adirik/interior-design` | Replicate | $0.02 | `adirik_interior` schema. Uses `prompt_strength` (not `strength`), 25 inference steps. |
| `erayyavuz-interior-ai` | `erayyavuz/interior-ai` | Replicate | $0.02 | `interior_ai` schema. Image param is `input` (not `image`). 30 inference steps to avoid Replicate polling timeout. |
| `interor-2` | `doobls-ai/interor-2` | Replicate | $0.014 | `flux_lora_interior` schema. Colorful, contemporary interiors. |
| `colourful-interiors` | `rihan-a/colourful_interiors` | Replicate | $0.014 | `flux_lora_interior` schema. Requires `INTR` trigger word. Vibrant palettes. |
| `stable-interiors-v2-pb` | `pointblack/stable-interiors-v2` | Replicate | $0.011 | `stable_interiors` schema. SD-based img2img. High guidance (15) — sharp output. |
| `stable-interiors-v2-yz` | `youzu/stable-interiors-v2` | Replicate | $0.011 | `stable_interiors` schema. Same family as above, fast variant. |
| `interior-design-sdxl` | `rocketdigitalai/interior-design-sdxl` | Replicate | $0.14 | `sdxl_interior` schema. SDXL with depth/ControlNet. Most expensive but most structurally faithful. |

### Smart Selection Logic

- **No `models` array, no reference image** → all `TEXT_TO_IMAGE_MODELS` run in parallel.
- **No `models` array, reference image present** → all `IMAGE_TO_IMAGE_MODELS` whose `status != "failing"` run in parallel.
- **`models` array provided** → exact filter against `ALL_MODELS` (`TEXT_TO_IMAGE_MODELS + IMAGE_TO_IMAGE_MODELS`).
- **`exclude_models` array provided** → those IDs are removed from the resolved set after the above (kept as a defensive escape hatch).
- Concurrency is capped to 3 simultaneous Replicate jobs (`asyncio.Semaphore(3)`); Gemini runs separately via the edge function.
- Per-model failures don't break the job — they just record `status: "failed"` on that model row in `generation_3d.models_results`. Other tiles still complete.
- 10-minute total job timeout. Per-model retry with exponential backoff (3 attempts, 1s/2s/4s).

### Provider Branching in `process_one_model`

When the registry entry has `provider == "gemini"`:
- Calls `generate_with_gemini_edge` (which posts to `generate-interior-gemini` with `mode: "image-edit"` if a reference image is set, else `mode: "text-to-image"`).
- The edge function bills credits internally and returns a permanent Supabase Storage URL — no re-upload, no `debit_credits_for_replicate` call.
- `cost_per_generation: 0.0` on the registry entry because credits are accounted for downstream.

When `provider == "replicate"`:
- Calls `generate_with_replicate` → polls Replicate prediction → downloads + re-uploads to Supabase Storage.
- Calls `credits_service.debit_credits_for_replicate` with the registry `id` (matches `REPLICATE_PRICING` keys).
- `job_id` is intentionally **not** passed to the credit-debit metadata FK column — `ai_usage_logs.job_id` references `background_jobs`, but interior jobs live in `generation_3d`. The `generation_3d` job id is stashed in metadata instead.

---

## 2. Single Inline Result (`generate_gemini` tool / `generate-interior-gemini` edge fn)

Used when the variations grid is **not** appropriate — chip modes, iterative edits, floor plans, materials boards.

| Backing model | Tier | Cost (credits) | Mode(s) |
|---|---|---|---|
| `gemini-3.1-flash-image-preview` | `fast` | 6 cr | `text-to-image`, `image-edit`, `floor-plan-render`, `floor-plan-text` |
| `gemini-3-pro-image-preview` | `pro` | 15 cr | Same modes at 4K quality. **Forced for `materials-selection-board`.** |
| `black-forest-labs/flux-depth-pro` (called inside the edge fn) | implied by mode | 15 cr | `redesign` (1 image, locks room geometry), `copy-style` (2 images: inspiration + your room — copy aesthetic via depth/ControlNet) |
| `aurora` (Grok image model, called inside edge fn when `model_tier=grok`) | `grok` | 15 cr | Best spatial accuracy alternative to Flux Depth Pro for `redesign` / `copy-style` |

### Modes (auto-detected by `generate_gemini` if not forced by chip)

| Mode | Trigger | Backing model |
|---|---|---|
| `text-to-image` | No image, free-form description | Gemini Flash/Pro |
| `image-edit` | Targeted change on uploaded or most-recent generated image (e.g. "change the floor", "make it warmer") | Gemini Flash/Pro |
| `redesign` | 1 uploaded image + style change ("redesign in Scandinavian") | Flux Depth Pro |
| `copy-style` | 2 uploaded images (inspiration + room) | Gemini Vision (extracts spec) → Flux Depth Pro (applies it) |
| `floor-plan-render` | Floor plan image uploaded → photorealistic eye-level render | Gemini |
| `floor-plan-text` | No image, text describes layout or `sqm` provided → 2D floor plan diagram | Gemini |
| `materials-selection-board` | Reference design + material swatches → professional materials board | Gemini Pro (forced) |

UI chips (`Image Edit`, `Redesign`, `Copy Style`, `Floor Plan`, `Materials Board`) override auto-detection via `forcedMode` in the edge function.

---

## 3. Adjacent Generation Tools (separate from the grid)

These are called by the agent independently and do **not** participate in the variations grid.

| Tool | Backing model | Cost | Purpose |
|---|---|---|---|
| `virtual_staging` | `proplabs/virtual-staging` | per-generation Replicate billing | Stage an empty room with AI furniture (uses `room` + `furniture_style` enums). Triggered when the user has an empty room photo. |
| `generate_pbr_maps` | Replicate (multi-step) | 8 cr | Generate PBR texture maps (albedo, normal, roughness, metalness) for AR / 3D viewer. |
| `generate_vr_world` | WorldLabs Marble | 18 cr (`marble-1.0-draft`, ~30-45s) / 190 cr (`marble-1.1`, ~5min) | 3D Gaussian Splat VR world from a room image. |
| Lighting Variants (in ProgressiveImageGrid) | Gemini (same edit pipeline) | per-edit | Re-renders the same room under 6 lighting presets (Natural Daylight, Golden Hour, Overcast, Showroom Spots, Warm Evening, Night). |

---

## 4. Tool-Selection Rules for the Agent

The agent (`KAI` / `Interior Designer`) picks tools per user request using these rules — encoded in the tool descriptions in `supabase/functions/_shared/tools/generation-tools.ts`:

- **Pure text-to-image (no images, no chip)** → `generate_3d` only. The grid includes the Gemini tile, so do **not** also call `generate_gemini`.
- **Uploaded image, no chip** → `generate_3d` (image-to-image grid).
- **Chip selected** (`image-edit`, `redesign`, `copy-style`, `floor-plan-render`, `floor-plan-text`, `materials-selection-board`) → `generate_gemini` only. Server-side enforces this.
- **Iterative edit on a previously generated image** ("change the floor to marble") → `generate_gemini` (mode auto-detects to `image-edit`).
- **Floor plan request** (sqm or "draw me a floor plan") → `generate_gemini` (mode `floor-plan-text` or `floor-plan-render`).
- **Materials selection board** → `generate_gemini` with `mode=materials-selection-board` (forced to Pro tier).
- **Empty room with intent to furnish** → `virtual_staging` tool.

---

## 5. Cost Cheat-Sheet

A typical text-to-image variations request runs 4 tiles in parallel:
- `gemini-interior` (6 cr ≈ $0.04 internal)
- `flux-2-pro` ($0.05)
- `playground-v2.5` ($0.01)
- `sd3` ($0.055)
- **Replicate raw total: ~$0.115** + Gemini (6 cr) — billed at 50% markup via `MARKUP_MULTIPLIER`.

A typical image-to-image variations request runs up to 12 tiles in parallel:
- 1× Gemini (6 cr) + 11× Replicate ($0.014–$0.14 each, ~$0.30 total raw)

Single inline (`generate_gemini`) is always cheapest: 6 cr (fast) or 15 cr (pro/grok).

---

## 6. Related Docs

- [docs/interior-design-data-flow.md](interior-design-data-flow.md) — request lifecycle through the system
- [docs/api/generate-interior-gemini-api.md](api/generate-interior-gemini-api.md) — Gemini edge function API spec
- [docs/virtual-staging.md](virtual-staging.md) — virtual staging tool
- [docs/ar-material-preview.md](ar-material-preview.md) — PBR generation + AR
- [docs/lighting-simulation.md](lighting-simulation.md) — lighting variants + 3D viewer
- [docs/vr-world-generation.md](vr-world-generation.md) — WorldLabs Marble VR pipeline
- [docs/billing-credits-system.md](billing-credits-system.md) — credit/markup model and `ai_usage_logs`
- [docs/ai-models-complete-list.md](ai-models-complete-list.md) — cross-platform AI model inventory
