# VR World Generation

Generate explorable 3D Gaussian Splat worlds from interior design images using the WorldLabs Marble API, rendered in-browser via Spark.js.

---

## Overview

The VR World Generation feature converts any interior design image into a fully explorable 3D environment. Users can orbit, walk through, and inspect rooms in real time directly inside the Agent Hub chat interface — no external application required.

**Key capabilities:**
- One-click "Generate VR" button on any interior design image
- 3D Gaussian Splat rendering via Spark.js (Three.js-based, code-split)
- Orbit controls + first-person WASD navigation with mode toggle
- 3 quality levels (Draft, Standard, Full)
- Credit-based pricing with automatic refund on failure
- Worlds persist in the database across chat sessions

---

## Models

| Model | Credits | Generation Time | Best For |
|-------|---------|-----------------|----------|
| `marble-1.0-draft` | 18 credits | ~30–45 seconds | Quick previews |
| `marble-1.1`       | 190 credits | ~5 minutes     | High-quality finals |

> The legacy `marble-0.1-mini` and `marble-0.1-plus` models were deprecated by WorldLabs and are no longer accepted by the API. Pricing: $1 = 1,250 WL credits × 1.50 internal markup.

---

## Output Assets

Each generated world produces:

| Asset | Description |
|-------|-------------|
| SPZ file (100k) | Draft quality Gaussian Splat (smallest) |
| SPZ file (500k) | Standard quality Gaussian Splat |
| SPZ file (full) | Full quality Gaussian Splat (largest) |
| Collider GLB | Collision mesh for first-person navigation |
| Panorama image | 360° equirectangular render |
| Thumbnail | Preview image |
| Caption | AI-generated scene description |

---

## Architecture

### Components

DesignCanvas (Frontend)
  └─ "Generate VR" button
       │
       ▼
Supabase Edge Function: generate-vr-world
  1. Upload image to WorldLabs
  2. POST /worlds/generate (draft or 1.1 model; pass `is_pano: true` for 360° source images)
  3. Poll /worlds/{world_id} until status = completed
  4. Store asset URLs in vr_worlds table
       │
       ▼
vr_worlds table (PostgreSQL)
  - world_id, model, status
  - splat_100k_url, splat_500k_url, splat_full_url
  - collider_glb_url, panorama_url, thumbnail_url, caption
       │
       ▼
WorldViewer component (Frontend)
  - Loads Spark.js dynamically (code-split, ~496KB)
  - Renders Gaussian Splat via SparkRenderer
  - Orbit / Walk navigation toggle
  - Quality selector (100k / 500k / full)
  - Fullscreen mode

### Files

| Path | Purpose |
|------|---------|
| `supabase/functions/generate-vr-world/index.ts` | Edge function orchestration |
| `src/components/features/ai/WorldViewer.tsx` | 3D splat viewer component |
| `src/services/vrWorldService.ts` | Frontend API service |
| Database: `vr_worlds` table | World asset storage |

---

## User Flow

1. User generates an interior design image via the Interior Designer agent
2. A "Generate VR" button appears on the image in the DesignCanvas panel
3. User selects model (draft or 1.1) and clicks the button
4. Edge function uploads the image to WorldLabs and triggers world generation
5. The UI shows an animated loading state while polling for completion
6. Once complete, WorldViewer renders the 3D Gaussian Splat inline
7. User can orbit (drag + scroll) or switch to Walk mode (WASD + mouse look, Shift for speed boost)
8. User can select quality level (Draft / Standard / Full)
9. User can enter fullscreen mode
10. The world persists in the database and reloads on future sessions

---

## Frontend Integration

### WorldViewer Component

The WorldViewer component accepts `worldId`, `splatUrls` (draft/standard/full), `colliderUrl`, and `caption` props. It is rendered inline within agent chat message output.

### Navigation Controls

**Orbit Mode** (default):
- Drag: Rotate camera around scene
- Scroll: Zoom in/out
- Right-click drag: Pan

**Walk Mode** (WASD):
- W/S: Move forward/backward
- A/D: Strafe left/right
- Mouse: Look around
- Shift: Speed boost

---

## Edge Function

### Endpoint
`POST /functions/v1/generate-vr-world`

The frontend polls the `vr_worlds` table via Supabase real-time subscriptions until `status = 'completed'`.

### Environment Variable

`WORLDLABS_API_KEY` is required in Supabase Edge Function secrets.

---

## Database Schema

The `vr_worlds` table stores: `id`, `workspace_id`, `message_id`, `world_id` (WorldLabs world ID), `model` (marble-1.0-draft or marble-1.1), `status` (generating / completed / failed), `splat_100k_url`, `splat_500k_url`, `splat_full_url`, `collider_glb_url`, `panorama_url`, `thumbnail_url`, `caption`, `credits_used`, `created_at`, and `updated_at`.

---

## Credits & Billing

Credits are deducted when generation starts and **refunded automatically on failure**.

| Model | Cost | Time |
|-------|------|------|
| marble-1.0-draft | 18 credits  | ~30–45s |
| marble-1.1       | 190 credits | ~5 min  |

Credit balance is tracked in the internal credit system. See [internal-pricing-credit-system.md](internal-pricing-credit-system.md) for details.

---

## Technical Details

### Spark.js (Gaussian Splat Renderer)

- Package: `@sparkjsdev/spark` v0.1.10+
- Requires: `three@0.178` (`THREE.Matrix2` dependency)
- Code-split via `React.lazy()` — the ~496KB renderer loads only when WorldViewer mounts
- `SparkRenderer` constructor requires `@ts-expect-error` due to missing types

### halfvec Storage

VR worlds do not use vector embeddings, but all related product embeddings in the platform use `halfvec` (float16) for 50% storage savings. See [system-architecture.md](system-architecture.md).

---

## Troubleshooting

### World stuck in "generating" status
1. Check Supabase Edge Function logs for `generate-vr-world`
2. Verify `WORLDLABS_API_KEY` is set and valid
3. Check WorldLabs API status at their dashboard
4. Generation can take up to 10 minutes for the `marble-1.1` model under load

### Viewer blank / not rendering
1. Ensure `three@0.178` is installed (not 0.160 or earlier)
2. Check browser console for WebGL errors
3. Spark.js requires a WebGL2-capable browser

### Credits not refunded on failure
1. Check edge function logs for refund call
2. Verify credit system is reachable from edge function
3. Manual credit adjustment via admin dashboard

---

## Related Documentation

- **[features-guide.md](features-guide.md)** — Feature 17: VR World Generation
- **[interior-design-models.md](interior-design-models.md)** — Interior design generation models
- **[agent-system.md](agent-system.md)** — Interior Designer agent
- **[internal-pricing-credit-system.md](internal-pricing-credit-system.md)** — Credit system

---

**Last Updated**: April 15, 2026
**Version**: 1.1.0
**Status**: Production
