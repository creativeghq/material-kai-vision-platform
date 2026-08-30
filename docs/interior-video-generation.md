# Interior Video Generation

Multi-model AI video generation for interior design — cinematic walkthroughs, product spotlights, before/after reveals, and social reels.

---

## Overview

The `generate-interior-video-v2` edge function routes to the optimal AI video model based on video type or an explicit model override. It handles the full lifecycle: model selection, async polling, timeout handling, and storage.

**Edge Function:** `generate-interior-video-v2`

---

## Models

| Model | Credits | Max length | Audio | Best For |
|---|---|---|---|---|
| `veo-2` | 50 | 8s | no | Cinematic walkthroughs, floor-plan flythroughs |
| `kling-v3.0` | 20 | 10s | yes | Product spotlights, before/after, short social reels |
| `runway-gen4-turbo` | 40 | 10s | no | Premium quality output |
| `wan-3.0-480p` | 30 | 30s | yes | Long clips on a budget |
| `wan-3.0-720p` | 55 | 30s | yes | The default long clip |
| `wan-3.0-1080p` | 110 | 30s | yes | Long clips at full HD |
| `seedance-2.5-480p` | 60 | 30s | yes | 30s in ONE pass, role-tagged references |
| `seedance-2.5-720p` | 125 | 30s | yes | The same at 720p |
| `h3-max-768p` | 25 | 15s | yes (stereo) | Social reels — the cheapest full clip, rendered in seconds |
| `h3-max-480p` | 15 | 15s | yes (stereo) | The same at 480p, for drafts |
| `ray-3.2-720p` | 20 | 10s | no | First-to-last frame: ending on a specific image |
| `ray-3.2-1080p` | 70 | 10s | no | The same at 1080p |

Credit prices are floors, not preferences: each one covers the provider bill for a MAX-LENGTH
clip of that model at the platform's declared 1.5x markup, checked by
[tests/unit/videoCreditFloor.test.ts](../tests/unit/videoCreditFloor.test.ts).

Routing per provider: Kling, Seedance and Wan go through the AI SDK inside
`_shared/ai-client.ts` (`@ai-sdk/klingai@3`, `@ai-sdk/bytedance@1` and
`@ai-sdk/alibaba@1` — each pinned to its **spec-v3** major, which is the one
`npm:ai@6` accepts; a spec-v4 package throws `AI_UnsupportedModelVersionError` before the
request is built). Veo-2 uses Google's API, Ray goes direct to Luma (below), and Runway is the
only remaining Replicate model here.

**Luma Ray3.2 is raw REST, and not because no provider exists.** `@ai-sdk/luma` exposes exactly
two model ids — `photon-1` and `photon-flash-1` — which Luma's own model page says no longer
exist as a product, and it carries no video model at all. Ray *is* reachable through
`@ai-sdk/fal`, as `luma-ray-2` — the **deprecated** generation. An SDK path that reaches the
wrong model is worse than none, so this one goes direct to `https://agents.lumalabs.ai/v1`.
Version order does not sort numerically: Ray3 → Ray3.14 (Jan 2026) → **Ray3.2 (Jun 2026, current)**.

**Luma prices per clip, not per second, and not linearly** — 10 seconds costs 3× 5 seconds
($0.30 → $0.90 at 720p). The `ai_model_pricing` rows carry the **10-second** per-second rate,
because that is the clip length the flat credit fee has to cover. The generator sends 5s or 10s
and nothing between: those are the two durations Luma publishes a price for.

**H3 Max has two constraints that are the model’s, not ours**, so `generateVideoWithH3Max`
decides explicitly and reports back. It has **no reference-image input at all** — standard
H3 took up to nine and dropped them whenever a frame was present; this endpoint has no such
field (`references_dropped` in the response is the count the model never saw). And the
**aspect ratio comes from the frame** — the image-to-video endpoint has no `aspect_ratio`
field, so a vertical reel needs a vertical source image.

**Why raw REST and not `@ai-sdk/fal`.** The provider package exists and exposes `video()`, and
cannot address this endpoint: it hardcodes `https://queue.fal.run/fal-ai/${id}`, while H3 Max
is published under the `minimax` owner at `https://queue.fal.run/minimax/h3-max/image-to-video`.
It also sends `duration` as the string `"15s"` where the schema requires an integer, and knows
nothing of the REQUIRED `prompt_expansion_mode`. Three overrides deep it maps nothing we want.

**Wan vs Seedance** — they overlap at 30 seconds with sound, and the difference is what happens to
the references. wan3 takes at most 5, and refuses them ALONGSIDE a source frame — `references_dropped`
in the response is what was refused, the same contract H3 Max has. Seedance tags each input with a ROLE
(`first_frame`, `last_frame`, `reference_image`) and generates the whole clip in a single pass
rather than extending, which is what holds a specific product in shot end to end. Wan is cheaper
per second; Seedance is the one to reach for when the thing on screen has to be *the* thing.

**Wan moved onto `@ai-sdk/alibaba` on 2026-08-29**, and the move corrected three things the
hand-written REST client had wrong: the model id (`wan3.0-video-prime` → the documented
`wan3.0-video`), the body shape (`img_url`/`ref_images` → `media[]` with a role per entry), and
the rate ($0.068/$0.14/$0.28 → $0.05/$0.10/$0.20 per second). None of the three could have
failed a test: no Wan call had ever been verified against a funded key. The credit prices fell
out of the corrected rate — 40/80/155 → 30/55/110.

---

## Video Types & Auto-Routing

If you pass `video_type` without `model`, the function auto-selects:

| Video Type | Auto-Selected Model |
|---|---|
| `walkthrough` | `wan-3.0-720p` |
| `floorplan_flythrough` | `wan-3.0-720p` |
| `product_spotlight` | `kling-v3.0` |
| `before_after` | `ray-3.2-720p` |
| `social_reel` | `h3-max-768p` |

The types that most needed length and sound default to a 30-second scored model; an 8-second
silent clip is not a walkthrough. A **reel** is the exception and goes to H3 Max: 15 seconds
with stereo audio for 25 credits, against 80 for twice the footage nobody watches on a
phone — and rendered in seconds rather than minutes, which is what makes a retry cheap.
not a default.

---

## API

```
POST /functions/v1/generate-interior-video-v2
Authorization: Bearer <jwt>
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `image_url` | string | Yes | Source room image URL |
| `prompt` | string | Yes | Text description of motion/camera movement |
| `video_type` | string | No* | `walkthrough` \| `product_spotlight` \| `before_after` \| `floorplan_flythrough` \| `social_reel` |
| `model` | string | No* | Explicit model override (see table above) |
| `aspect_ratio` | string | No | `16:9` (default) \| `9:16` \| `1:1` |
| `duration` | number | No | Duration in seconds (model-dependent max) |
| `workspace_id` | string | Yes | For credit deduction |
| `user_id` | string | No | For server-to-server calls |

*One of `video_type` or `model` is required.

### Aspect Ratios

| Ratio | Use Case |
|---|---|
| `16:9` | Standard landscape (walkthroughs, web) |
| `9:16` | Vertical (Instagram Reels, TikTok) |
| `1:1` | Square (Instagram feed) |

---

## Response

### Synchronous (generation completed within ~55s)

```json
{
  "success": true,
  "video_url": "https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/generation-videos/...",
  "model": "kling-v3.0",
  "credits_used": 20,
  "duration_ms": 42000
}
```

### Async (generation exceeded 55s timeout)

```json
{
  "success": true,
  "status": "processing",
  "job_id": "uuid",
  "prediction_id": "replicate-prediction-id",
  "model": "veo-2",
  "credits_used": 30,
  "message": "Video generation in progress. Poll /functions/v1/generate-interior-video-v2?job_id=..."
}
```

Poll with `GET /functions/v1/generate-interior-video-v2?job_id=<uuid>` until `status = 'completed'`.

---

## Async Polling Pattern

Replicate-backed models (Wan, Runway) and Veo-2 can take 2-5 minutes. If the edge function's 55s polling window elapses:

1. `prediction_id` is stored in the `generation_videos` table
2. Response returns `job_id` and `status: 'processing'`
3. Frontend polls the endpoint with `?job_id=` on a 5-10s interval
4. Once Replicate/Veo reports `succeeded`, video is downloaded → re-uploaded to Supabase Storage → `generation_videos` updated

---

## Storage

Generated videos are stored at:
```
generation-videos/{job-uuid}.mp4
```

---

## Credit Handling

Credits are debited upfront before the model call. They are **non-refundable** (generation infrastructure costs are incurred regardless of output quality).

---

## Database

Generated videos are tracked in the `generation_videos` table:

| Column | Description |
|---|---|
| `id` | Job UUID |
| `prediction_id` | Replicate/external prediction ID |
| `status` | `processing` \| `completed` \| `failed` |
| `video_url` | Final Supabase Storage URL |
| `model` | Model used |
| `credits_debited` | Credits consumed |
| `workspace_id` | Owner workspace |

---

## Social Video Generation

For social-media-specific short videos, the separate `generate-social-video` edge function provides a simplified interface:

| Model | Credits |
|---|---|
| `h3-max-768p` (delegated) — **the default** | 25 |
| `h3-max-480p` (delegated) | 15 |
| `kling-3.0` (run here, via Replicate) | 20 |
| `veo-2` (delegated to `generate-interior-video-v2`) | 50 |
| `wan-3.0-480p` / `720p` / `1080p` (delegated) | 30 / 55 / 110 |
| `seedance-2.5-480p` / `720p` (delegated) | 60 / 125 |

```
POST /functions/v1/generate-social-video
{
  "prompt": "...",
  "image_url": "...",
  "model": "kling-3.0",
  "aspect_ratio": "9:16",
  "workspace_id": "uuid"
}
```

---

**Last Updated:** March 2026

> **Removed 2026-08-12 (issue #4):** `wan2.1-i2v-720p` and `kling-1.6-pro` were deleted upstream by Replicate (HTTP 404 on `GET /v1/models`, a read that needs no credit — distinct from our unfunded-account 402). Both were user-selectable and always hard-failed. The budget video tier stays vacant until `wan-video/wan-2.2-i2v-fast` is verified against a funded account (issue #4 Phase 5).
