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
| `wan-3.0-480p` | 40 | 30s | yes | Long clips on a budget; up to 20 references |
| `wan-3.0-720p` | 80 | 30s | yes | The default long clip |
| `wan-3.0-1080p` | 155 | 30s | yes | Long clips at full HD |
| `seedance-2.5-480p` | 60 | 30s | yes | 30s in ONE pass, role-tagged references |
| `seedance-2.5-720p` | 125 | 30s | yes | The same at 720p |

Credit prices are floors, not preferences: each one covers the provider bill for a MAX-LENGTH
clip of that model at the platform's declared 1.5x markup, checked by
[tests/unit/videoCreditFloor.test.ts](../tests/unit/videoCreditFloor.test.ts).

Routing per provider: Kling and Seedance go through the AI SDK inside `_shared/ai-client.ts`
(`@ai-sdk/klingai`, `@ai-sdk/bytedance` — both pinned to their **spec-v3** major, which is the one
`npm:ai@6` accepts). Wan goes to DashScope over raw REST because no AI SDK provider exists for it.
Veo-2 uses Google's API. Runway is the only remaining Replicate model here.

**Wan vs Seedance** — they overlap at 30 seconds with sound, and the difference is what happens to
the references. Wan takes up to 20 of them as one set. Seedance tags each input with a ROLE
(`first_frame`, `last_frame`, `reference_image`) and generates the whole clip in a single pass
rather than extending, which is what holds a specific product in shot end to end. Wan is cheaper
per second; Seedance is the one to reach for when the thing on screen has to be *the* thing.

---

## Video Types & Auto-Routing

If you pass `video_type` without `model`, the function auto-selects:

| Video Type | Auto-Selected Model |
|---|---|
| `walkthrough` | `wan-3.0-720p` |
| `floorplan_flythrough` | `wan-3.0-720p` |
| `product_spotlight` | `kling-v3.0` |
| `before_after` | `wan-3.0-720p` |
| `social_reel` | `wan-3.0-720p` |

The three types that most needed length and sound default to a 30-second scored model; an
8-second silent clip is not a walkthrough. Seedance is reachable by explicit `model` only —
it costs about 1.7x Wan per second, so it is an ask, not a default.

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
| `kling-3.0` (run here, via Replicate) | 20 |
| `veo-2` (delegated to `generate-interior-video-v2`) | 50 |
| `wan-3.0-480p` / `720p` / `1080p` (delegated) | 40 / 80 / 155 |
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
