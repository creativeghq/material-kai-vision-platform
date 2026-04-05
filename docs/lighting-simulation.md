# Lighting Simulation

Preview how materials look under different lighting conditions with real-time 3D rendering and AI-powered room re-lighting.

---

## Overview

Two-layer lighting simulation system:

**Layer 1 (AI Room Re-lighting):** "Lighting Variants" dropdown on ProgressiveImageGrid generates the same room under 6 different lighting presets via Gemini AI edit.

**Layer 2 (3D Material Preview):** Standalone Three.js viewer renders individual materials with PBR (Physically Based Rendering) under controllable lighting with time-of-day and room orientation controls.

---

## Layer 1: AI Lighting Variants

Available on the ProgressiveImageGrid action bar (next to Generate Video, VR World, etc.).

**Presets:**
| Preset | Description | Credits |
|--------|-------------|---------|
| Golden Hour | Warm amber sunlight, long shadows | 6 |
| Bright Midday | Crisp, even natural light | 6 |
| Soft Overcast | Diffused, calm, serene | 6 |
| Warm Evening | Soft artificial glow | 6 |
| Night | Dark outside, warm interior | 6 |
| Dramatic Spots | Targeted accent beams | 6 |

Each preset triggers a Gemini edit with a lighting-specific prompt + spatial lock clause.

---

## Layer 2: 3D PBR Viewer

**Components:** `src/components/features/lighting/`

| Component | Purpose |
|-----------|---------|
| `MaterialLightingViewer` | React Three Fiber scene with PBR material + controls |
| `LightingPreviewModal` | Dialog wrapper for the viewer |
| `lightingPresets` | 6 preset definitions with HDRI, sun, and light config |
| `useSunPosition` | Simplified solar position calculation hook |

**Controls:**
- Preset selector (6 presets as pill buttons)
- Time-of-day slider (6AM - 9PM) with play/pause animation
- Room orientation (N/E/S/W compass buttons)
- Surface type (Wall, Floor, Column, Curved)
- Material tuning (roughness, clearcoat sliders)
- Screenshot + download

**Material Defaults by Category:**
- Ceramic: roughness 0.4, clearcoat 0.3
- Wood: roughness 0.7, sheen 0.1
- Metal: metalness 0.9, roughness 0.2
- Fabric: roughness 0.9, sheen 0.5
- Stone: roughness 0.3, clearcoat 0.5
- Glass: roughness 0.1, clearcoat 0.8

---

## Integration Points

- **ProductCard**: "Lighting" button (Sun icon)
- **ProgressiveImageGrid**: "Lighting Variants" dropdown
- Uses PBR maps from `generate-pbr-maps` edge function (shared with AR)
