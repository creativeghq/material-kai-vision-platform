# Interior Video Generation

Multi-model AI video generation for interior design — cinematic walkthroughs, product spotlights, before/after reveals, and social reels.

---

## Overview

The `generate-interior-video-v2` edge function routes to the optimal AI video model based on video type or an explicit model override. It handles the full lifecycle: model selection, async polling, timeout handling, and storage.

**Edge Function:** `generate-interior-video-v2`

---

## Models

| Model | Credits | Speed | Best For |
|---|---|---|---|
| `veo-2` | 30 | ~2-3 min | Cinematic walkthroughs, floor-plan flythroughs |
| `kling-v3.0` | 20 | ~60-90s | Product spotlights, before/after, social reels |
| `wan2.1-i2v-720p` | 12 | ~90s | Budget option, general purpose |
| `runway-gen4-turbo` | 40 | ~2-3 min | Premium quality output |

Kling uses the native Kling SDK. Wan and Runway use Replicate. Veo-2 uses Google's API.

---

## Video Types & Auto-Routing

If you pass `video_type` without `model`, the function auto-selects:

| Video Type | Auto-Selected Model |
|---|---|
| `walkthrough` | `veo-2` |
| `floorplan_flythrough` | `veo-2` |
| `product_spotlight` | `kling-v3.0` |
| `before_after` | `kling-v3.0` |
| `social_reel` | `kling-v3.0` |

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
| `kling-1.6-pro` | 15 |
| `veo-2` (delegated to `generate-interior-video-v2`) | 30 |

```
POST /functions/v1/generate-social-video
{
  "prompt": "...",
  "image_url": "...",
  "model": "kling-1.6-pro",
  "aspect_ratio": "9:16",
  "workspace_id": "uuid"
}
```

---

**Last Updated:** March 2026
