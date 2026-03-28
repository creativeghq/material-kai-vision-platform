# Region Edit API

**Function:** `generate-region-edit`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/generate-region-edit`
**Auth:** Authenticated users (JWT required)
**Credits:** 20 per call

Masked inpainting — regenerate only a user-painted area of a room image using Grok Aurora.

Full documentation: [segmentation-inpainting.md](../segmentation-inpainting.md)

---

## Edit a region

```
POST /functions/v1/generate-region-edit
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "image_url": "https://...",
  "mask_data_url": "data:image/png;base64,...",
  "prompt": "Replace with herringbone oak parquet flooring",
  "workspace_id": "uuid"
}
```

### Mask convention

The mask is a PNG data URL where:
- **White pixels (255,255,255)** = area to regenerate
- **Black pixels (0,0,0)** = area to preserve exactly

Use `RegionEditCanvas.tsx` in the frontend to let users paint the mask.

---

## Response

```json
{
  "success": true,
  "image_url": "https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/generation-images/region-edit/uuid.jpg",
  "credits_used": 20
}
```

## Errors

| Status | Meaning |
|---|---|
| `400` | Missing `image_url`, `mask_data_url`, or `prompt` |
| `402` | Insufficient credits |
| `500` | Grok Aurora API error |

---

## Python Segmentation API

For generating masks programmatically (SAM 2 or Pillow fallback):

```
POST /api/segment/mask
{
  "image_url": "https://...",
  "zone_hints": [{ "type": "bbox", "x": 100, "y": 200, "width": 300, "height": 150 }]
}
```

**Response:** `{ "mask_data_url": "data:image/png;base64,...", "method": "sam2" }`
