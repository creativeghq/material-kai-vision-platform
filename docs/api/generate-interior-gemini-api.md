# Gemini Interior Generation API

**Function:** `generate-interior-gemini`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/generate-interior-gemini`
**Auth:** Authenticated users (JWT required)

Gemini-backed interior design image generation with four modes.

---

## Modes

| Mode | Description | Credits |
|---|---|---|
| `text-to-image` | Narrative prompt → new room render | 6 (flash) / 15 (pro) |
| `image-edit` | Existing image + instruction → edited image | 6 (flash) / 15 (pro) |
| `floor-plan-render` | Floor plan image + style → photorealistic perspective render | 6 (flash) / 15 (pro) |
| `floor-plan-text` | Text description → 2D floor plan diagram | 6 (flash) / 15 (pro) |

---

## Models

| Model | Credits | Quality |
|---|---|---|
| `gemini-3.1-flash-image-preview` | 6 | Fast, good quality |
| `gemini-3-pro-image-preview` | 15 | 4K output, highest quality |

---

## Text to Image

```
POST /functions/v1/generate-interior-gemini
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "mode": "text-to-image",
  "prompt": "Scandinavian living room with natural oak floors, white walls, afternoon light",
  "model": "gemini-3.1-flash-image-preview",
  "aspect_ratio": "16:9",
  "workspace_id": "uuid"
}
```

---

## Image Edit

```
POST /functions/v1/generate-interior-gemini
{
  "mode": "image-edit",
  "image_url": "https://...",
  "instruction": "Replace the sofa with a dark green velvet sectional",
  "model": "gemini-3.1-flash-image-preview",
  "workspace_id": "uuid"
}
```

Supports style-transfer pipeline: provide `inspiration_url` to extract a design spec and apply it to the room without spatial bleed.

---

## Floor Plan Render

```
POST /functions/v1/generate-interior-gemini
{
  "mode": "floor-plan-render",
  "floor_plan_url": "https://...",
  "style": "modern minimalist",
  "room_type": "living room",
  "model": "gemini-3-pro-image-preview",
  "workspace_id": "uuid"
}
```

Produces a photorealistic perspective interior render from a 2D floor plan.

---

## Floor Plan from Text

```
POST /functions/v1/generate-interior-gemini
{
  "mode": "floor-plan-text",
  "description": "Open plan kitchen and living room, 50sqm, with island counter and dining area for 6",
  "workspace_id": "uuid"
}
```

---

## Response

```json
{
  "success": true,
  "image_url": "https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/generation-images/gemini/uuid.png",
  "model": "gemini-3.1-flash-image-preview",
  "credits_used": 6
}
```

## Errors

| Status | Meaning |
|---|---|
| `400` | Missing mode or required fields |
| `402` | Insufficient credits |
| `500` | Gemini API error |
