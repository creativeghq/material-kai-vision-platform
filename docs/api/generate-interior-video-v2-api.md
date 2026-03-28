# Interior Video Generation API

**Function:** `generate-interior-video-v2`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/generate-interior-video-v2`
**Auth:** Authenticated users (JWT required)

Full documentation: [interior-video-generation.md](../interior-video-generation.md)

---

## Generate a video

```
POST /functions/v1/generate-interior-video-v2
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "image_url": "https://...",
  "prompt": "Slow cinematic pan through a living room at golden hour",
  "video_type": "walkthrough",
  "aspect_ratio": "16:9",
  "workspace_id": "uuid"
}
```

### Model selection

Pass `video_type` for auto-routing, or pass `model` explicitly:

| `video_type` | Auto model | Credits |
|---|---|---|
| `walkthrough` | `veo-2` | 30 |
| `floorplan_flythrough` | `veo-2` | 30 |
| `product_spotlight` | `kling-v3.0` | 20 |
| `before_after` | `kling-v3.0` | 20 |
| `social_reel` | `kling-v3.0` | 20 |

Manual override: `"model": "wan2.1-i2v-720p"` (12cr) or `"runway-gen4-turbo"` (40cr)

### Aspect ratios
`16:9` (default) · `9:16` · `1:1`

---

## Synchronous response (< 55s)

```json
{
  "success": true,
  "video_url": "https://...supabase.co/.../generation-videos/uuid.mp4",
  "model": "kling-v3.0",
  "credits_used": 20,
  "duration_ms": 42000
}
```

## Async response (> 55s)

```json
{
  "success": true,
  "status": "processing",
  "job_id": "uuid",
  "prediction_id": "replicate-id",
  "model": "veo-2",
  "credits_used": 30
}
```

## Poll status

```
GET /functions/v1/generate-interior-video-v2?job_id=<uuid>
Authorization: Bearer <jwt>
```

Returns same shape as synchronous response once `status = "completed"`.

---

## Social Video (simplified wrapper)

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

| Model | Credits |
|---|---|
| `kling-1.6-pro` | 15 |
| `veo-2` | 30 |

## Errors

| Status | Meaning |
|---|---|
| `400` | Missing `image_url`, `prompt`, or no `video_type`/`model` provided |
| `402` | Insufficient credits |
| `500` | Model API error |
