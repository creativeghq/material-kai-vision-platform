# Virtual Staging

AI-powered room staging that transforms empty room photos into fully furnished interior renders.

---

## Overview

Virtual staging uses Replicate's `proplabs/virtual-staging` model to place realistic furniture and décor into empty room photos. Users provide a room image, select a room type and furniture style, and receive a furnished render within ~56 seconds.

**Edge Function:** `generate-virtual-staging`
**Credit Cost:** 20 credits per generation
**Model:** `proplabs/virtual-staging` via Replicate (~56s average)

---

## How it Works

1. User provides a public image URL of an empty room
2. User selects room type (bedroom, living room, kitchen, etc.) and furniture style
3. Edge function calls Replicate API with the image + parameters
4. Replicate runs the `proplabs/virtual-staging` model (~56s)
5. Result image is downloaded and re-uploaded to Supabase Storage (`generation-images` bucket)
6. Permanent public URL returned to caller

---

## API

```
POST /functions/v1/generate-virtual-staging
Authorization: Bearer <jwt>
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `source_image_url` | string | Yes | Public URL of empty room photo |
| `room` | string | Yes | Room type (see options below) |
| `furniture_style` | string | No | Style preset (see options below) |
| `furniture_items` | string | No | Free-text description of specific items to add |
| `workspace_id` | string | No | Workspace ID for credit deduction |
| `user_id` | string | No | Required for server-to-server calls from agent-chat |

### Room Types

`living_room`, `bedroom`, `dining_room`, `kitchen`, `bathroom`, `home_office`, `kids_room`, `outdoor`

### Furniture Styles

`modern`, `scandinavian`, `industrial`, `traditional`, `bohemian`, `minimalist`, `luxury`, `rustic`

### Response

```json
{
  "success": true,
  "image_url": "https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/generation-images/virtual-staging/job-uuid.jpg",
  "credits_used": 20
}
```

### Error Response

```json
{
  "success": false,
  "error": "Insufficient credits",
  "credits_required": 20,
  "credits_available": 5
}
```

---

## Credit Handling

- Credits are checked **before** the Replicate call
- Credits are debited on **success only** — failed generations are not charged
- Minimum 20 credits required in workspace balance

---

## Storage

Generated images are stored at:
```
generation-images/virtual-staging/{job-uuid}.{jpg|png}
```

Public URL format:
```
https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/generation-images/virtual-staging/...
```

---

## Integration with KAI Agent

The `generate-virtual-staging` function is accessible as a KAI agent tool. When the agent detects a staging request in conversation, it calls this function with the user's image and infers room type / style from context.

---

## Before/After Comparison & Quality Analysis

Virtual staging results are displayed using the `VirtualStagingViewer` component, which provides:

### Before/After Slider

The viewer includes an interactive **comparison slider** that lets users drag between the original empty room and the staged result. The `source_image_url` is now included in the `virtual_staging_ready` chunk alongside the result image, enabling side-by-side comparison.

- **CSS clip-path based** — no external library dependency
- **Pointer-drag interaction** — works on desktop and mobile
- **Toggle button** — "Before / After" shows/hides the comparison mode

### Quality Analysis

An **"Analyze Quality"** button triggers a Claude Vision assessment of the staging result. The system sends both the original and staged images to the KAI agent, which evaluates:

| Dimension | What is assessed |
|-----------|-----------------|
| Lighting consistency | Does staged light match original source direction and warmth? |
| Perspective accuracy | Are walls/floors at correct angles relative to camera? |
| Furniture scale | Are proportions realistic for the room size? |
| Material realism | Do textures read naturally at render resolution? |
| Style fidelity | Does result match the requested furniture style? |
| Edge blending | Are furniture edges cleanly composited? |

Each dimension is scored 1–10 with specific feedback.

### Data Flow

```
Edge Function (generation-tools.ts)
  → onChunk({ type: 'virtual_staging_ready', source_image_url, image_url, ... })
  → AgentHub chunk handler stores source_image_url in virtualStagingData
  → VirtualStagingViewer renders comparison slider
```

For direct calls (non-agent path via `handleGenerateVirtualStaging`), the `imageUrl` parameter is stored as `source_image_url` in the staging message.

---

**Last Updated:** April 2026
