# AR Material Preview

View materials applied to real-world surfaces using AR, or preview them as 3D textured swatches with interactive rotation.

---

## Overview

The AR Material Preview feature lets designers see how materials look on real surfaces. On Android (Chrome), it uses WebXR for camera-based AR. On iOS, it falls back to a 3D swatch viewer. On desktop, a QR code enables phone handoff.

**Components:** `src/components/features/ar/`
**Edge Function:** ~~`generate-pbr-maps/index.ts`~~ — **NOT AVAILABLE.** No source exists in
this repo; the slug is still deployed but produces nothing. See the warning below.
**Route:** `/ar/:productId` (standalone page for QR handoff)
**Credit Cost:** 8 credits for PBR map generation, viewing is free

---

## AR Detection

The `useARSupport()` hook detects device capabilities:

| Mode | Device | Technology |
|------|--------|------------|
| `webxr` | Android Chrome | WebXR Hit Test API |
| `quicklook` | iOS Safari | model-viewer + USDZ Quick Look |
| `desktop` | Desktop browsers | QR code + 3D preview |
| `none` | Unsupported | Button hidden |

---

## Components

| Component | Purpose |
|-----------|---------|
| `ViewInARButton` | Context-aware button (shows AR/QR based on device) |
| `ARPreviewModal` | Full-screen 3D material swatch viewer |
| `ARPage` | Standalone route for `/ar/:productId` |
| `useARSupport` | Hook for AR capability detection |

---

## PBR Map Generation — NOT WORKING

> **This section describes a feature that does not run.** Verified 2026-08-01 (audit #304
> finding 8 / #298 finding 25):
> - `generate-pbr-maps` has **no source in this repo**. The slug is deployed but
    unmaintainable and unreadable.
> - `products` rows carrying `metadata.pbr_maps`: **0**. It has never written a map.
> - Step 2 below is impossible: MIVAA registers **no** `/api/svbrdf` router, and the
    `svbrdf-extractor` edge function it names does not exist.
> - There is no `svbrdf_extractions` table either.
>
> AR preview still works — `ARPreviewModal` falls back to the raw product image as albedo
> (`pbrMaps?.tileable_url || productImage`), which is the path every user actually gets.
> The 8-credit cost quoted above is never charged, because nothing invokes the function.

The design as originally intended was:

1. Source image stored as albedo
2. MIVAA SVBRDF extraction attempted first (produces normal, roughness, metalness)
3. Replicate fallback for normal map generation
4. Optional tileable texture generation via Stable Diffusion
5. Maps stored in Supabase Storage: `generation-images/pbr-maps/{product_id}/`
6. Product metadata updated with `pbr_maps` object

---

## Integration Points

- **ProductCard**: "AR View" button (Smartphone icon)
- **ProductDetailModal**: AR preview tab
- **MoodBoardDetailPage**: AR option per item
- **QR Handoff**: Desktop shows QR code linking to `/ar/:productId`

---

## Future Enhancements

- `@react-three/xr` for full WebXR surface detection on Android
- `@google/model-viewer` for iOS USDZ Quick Look
- `qrcode.react` for rendered QR codes
