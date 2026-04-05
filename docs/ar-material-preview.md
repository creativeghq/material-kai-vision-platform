# AR Material Preview

View materials applied to real-world surfaces using AR, or preview them as 3D textured swatches with interactive rotation.

---

## Overview

The AR Material Preview feature lets designers see how materials look on real surfaces. On Android (Chrome), it uses WebXR for camera-based AR. On iOS, it falls back to a 3D swatch viewer. On desktop, a QR code enables phone handoff.

**Components:** `src/components/features/ar/`
**Edge Function:** `generate-pbr-maps/index.ts`
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

## PBR Map Generation

The `generate-pbr-maps` edge function creates PBR texture maps from product images:

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
