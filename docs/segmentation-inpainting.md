# Segmentation & Inpainting

Pixel-precise area selection and AI-powered inpainting — replace specific zones in interior images with generated content or real product photos.

---

## Overview

Two-stage pipeline:

1. **Segmentation** — SAM 2 generates a pixel-perfect binary mask from user-drawn zone hints
2. **Inpainting** — FLUX Fill Pro or AnyDoor fills the masked area based on a text prompt or reference product image

**Python API:** `/api/segment/*` (sam_routes.py)
**Frontend:** `RegionEditCanvas.tsx` for user mask painting

---

## Segmentation (SAM 2)

### Primary Path: SAM 2 via Replicate

Model: `meta/sam-2`

Takes an image and zone hints (bounding boxes or click points) and returns a binary PNG mask where:
- **White pixels** = area to regenerate
- **Black pixels** = area to preserve exactly

### Fallback: Pillow Bbox/Ellipse

When SAM 2 is unavailable or for speed-critical paths, a Pillow-based fallback generates approximate rectangular or elliptical masks. Instant, zero cost.

---

## Inpainting

### With Reference Image: AnyDoor

Model: `ali-vilab/anydoor` via Replicate

When `reference_image_url` is provided, AnyDoor places the real product photo into the masked zone, adapting lighting and perspective. Use this to visualize how a specific tile, fabric, or material looks in the room.

### Text-Guided: FLUX Fill Pro

When no reference image is provided, FLUX Fill Pro generates content based on the text prompt. Use this to replace a floor with "herringbone oak parquet" or a wall with "rough concrete texture".

---

## Region Edit API

The `generate-region-edit` edge function provides the end-to-end masked inpainting experience:

```
POST /functions/v1/generate-region-edit
Authorization: Bearer <jwt>
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `image_url` | string | Yes | Public URL of the room image to edit |
| `mask_data_url` | string | Yes | PNG data URL of the binary mask (white = regenerate) |
| `prompt` | string | Yes | Text description of what to place in the masked area |
| `workspace_id` | string | No | Workspace ID for credit deduction |
| `user_id` | string | No | Required for server-to-server calls |

**Credits:** 20 per call (Grok Aurora inpainting)

**Model:** Grok Aurora (`/v1/images/edits` endpoint) for mask-guided inpainting.

### Response

```json
{
  "success": true,
  "image_url": "https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/generation-images/region-edit/job-uuid.jpg",
  "credits_used": 20
}
```

---

## Segmentation Python API

```
POST /api/segment/mask
```

### Request Body

```json
{
  "image_url": "https://...",
  "zone_hints": [
    { "type": "bbox", "x": 100, "y": 200, "width": 300, "height": 150 }
  ],
  "fallback": false
}
```

### Response

```json
{
  "mask_data_url": "data:image/png;base64,...",
  "method": "sam2",
  "processing_ms": 2400
}
```

---

## Inpainting Python API

```
POST /api/segment/inpaint
```

### Request Body

```json
{
  "image_url": "https://...",
  "mask_data_url": "data:image/png;base64,...",
  "prompt": "Herringbone oak parquet flooring",
  "reference_image_url": "https://..."   // optional — triggers AnyDoor
}
```

---

## Frontend Integration

`RegionEditCanvas.tsx` provides:
- Draw mode: User paints the area to regenerate with a brush
- Erase mode: Remove painted areas
- Preview: Overlay the mask on the original image
- Generate: Submits `image_url` + `mask_data_url` + `prompt` to `generate-region-edit`

Accessed via `GeminiEditModal.tsx` in the Designer.

---

## Storage

Inpainting results are stored at:
```
generation-images/region-edit/{job-uuid}.{jpg|png}
```

---

**Last Updated:** March 2026
