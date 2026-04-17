---
name: Interior Staging Workflow
slug: interior-staging-workflow
description: Stage or redesign a photographed room using the platform's Gemini + virtual-staging tools in the correct order. Use when the user uploads a room photo and asks to "stage", "redesign", "change the furniture/materials/lighting", or "show me this room with X". Ensures before/after comparability.
agents: [kai, interior-designer]
tags: [design, staging, gemini, virtual-staging]
---

# Interior Staging Workflow

The platform has two image-generation tools — `generate_gemini` (precise edits, reference-driven) and `virtual_staging` (before/after swap with slider). They are NOT interchangeable. This skill tells you which one to pick, in what order, and how to preserve the original photo for the before/after viewer.

## Decision tree

| User intent | Correct tool | Why |
|---|---|---|
| "Remove the sofa and add a mid-century armchair" | `generate_gemini` mode=`image-edit` | Precise object-level edit; preserves room geometry |
| "Render my floor plan as a photo-real room" | `generate_gemini` mode=`floor-plan-render` | Only Gemini preserves plan topology |
| "Stage this empty room with modern furniture" | `virtual_staging` | Produces before/after with the `VirtualStagingViewer` slider |
| "Show me this room with wooden floors instead of tile" | `generate_gemini` mode=`image-edit` with a pinned material reference | Material swap needs the catalog image as anchor |
| "Generate 4 variants of this living room" | `generate_3d` (Replicate grid) | Grid output, not 1:1 edit |

Never call `generate_3d` when the user wants to **modify** an uploaded photo — it can't preserve the geometry. Use `generate_gemini` instead.

## Recipe

1. **Confirm the source image.** If the user has uploaded an image OR a previously generated image exists in the conversation, use that as the source. Do not prompt the user to re-upload.

2. **Pick the tool using the decision tree above.** If the intent is ambiguous (e.g. "make this nicer"), ask one clarifying question: "Do you want me to swap specific items, or do a full restage?"

3. **For material swaps**, always try to run `material_search` first with the requested material description, then pass the catalog product image as a pinned reference to `generate_gemini`. This gives the agent something concrete to copy instead of a hallucinated interpretation.

4. **For full staging**, use `virtual_staging` — this automatically preserves the source URL in `virtualStagingData.source_image_url` so the frontend's `VirtualStagingViewer` can render the before/after slider.

5. **Never call both `generate_gemini` and `virtual_staging` in the same turn** unless the user explicitly asks for two separate outputs — it doubles credits and produces confusingly similar results.

6. **After generation, offer the follow-up actions the user is most likely to want:**
   - If virtual staging was used: offer "Analyze Quality" (the Claude Vision assessment button)
   - If material swap: offer to "Try a different material" and list 2-3 catalog alternatives
   - If full redesign: offer lighting variants via the Lighting Variants dropdown

## Guardrails

- Never strip the source image URL from the result. The frontend's before/after slider depends on it.
- Never produce more than 1 image per turn unless the user explicitly asked for variants.
- If the user provides a reference image AND pinned materials, the pinned material images take priority as style anchors.
- If the room photo is extremely low quality (heavy blur, < 512px, heavy fisheye), warn the user and offer to proceed with reduced fidelity rather than producing a bad result silently.
