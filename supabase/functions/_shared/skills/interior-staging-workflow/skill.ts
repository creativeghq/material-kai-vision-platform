// Source of truth for the Interior Staging Workflow skill.
// See note in b2b-manufacturer-research/skill.ts about .ts-not-.md.
//
// Generated from SKILL.md — edit the markdown, not this file.
// A plain template literal, not String.raw: String.raw keeps the backslash of an escaped
// backtick, so the text the model reads comes out as \`tool_name\` rather than `tool_name`.

export default `---
name: Interior Staging Workflow
slug: interior-staging-workflow
description: Stage, empty or redesign a photographed room using the platform's Gemini + virtual-staging tools in the correct order. Use when the user uploads a room photo and asks to "stage", "redesign", "empty the room", "remove the furniture", "show it unfurnished", "change the furniture/materials/lighting", or "show me this room with X". Ensures a furnished photo is emptied before it is staged, and preserves before/after comparability.
agents: [kai, interior-designer]
tags: [design, staging, gemini, virtual-staging]
---

# Interior Staging Workflow

The platform has two image-generation tools — \`generate_gemini\` (precise edits, reference-driven) and \`virtual_staging\` (before/after swap with slider). They are NOT interchangeable. This skill tells you which one to pick, in what order, and how to preserve the original photo for the before/after viewer.

## Decision tree

| User intent | Correct tool | Why |
|---|---|---|
| "Remove the sofa and add a mid-century armchair" | \`generate_gemini\` mode=\`image-edit\` | Precise object-level edit; preserves room geometry |
| "Render my floor plan as a photo-real room" | \`generate_gemini\` mode=\`floor-plan-render\` | Only Gemini preserves plan topology |
| "Empty this room" / "remove the furniture" / "show it unfurnished" | \`generate_gemini\` mode=\`unstage\` | Removes every movable item and rebuilds the floor and wall behind it; architecture, camera and lighting unchanged |
| "Stage this **empty** room with modern furniture" | \`virtual_staging\` | Produces before/after with the \`VirtualStagingViewer\` slider |
| "Stage this **furnished** room" / "restage my living room" | \`generate_gemini\` mode=\`unstage\`, **then** \`virtual_staging\` on the result | The stager furnishes bare space and fights anything already in the photo — see step 5 |
| "Show me this room with wooden floors instead of tile" | \`generate_gemini\` mode=\`image-edit\` with a pinned material reference | Material swap needs the catalog image as anchor |
| "Generate 4 variants of this living room" | \`generate_3d\` (Replicate grid) | Grid output, not 1:1 edit |

Never call \`generate_3d\` when the user wants to **modify** an uploaded photo — it can't preserve the geometry. Use \`generate_gemini\` instead.

## Recipe

1. **Confirm the source image.** If the user has uploaded an image OR a previously generated image exists in the conversation, use that as the source. Do not prompt the user to re-upload.

2. **Pick the tool using the decision tree above.** If the intent is ambiguous (e.g. "make this nicer"), ask one clarifying question: "Do you want me to swap specific items, or do a full restage?"

3. **For material swaps**, always try to run \`material_search\` first with the requested material description, then pass the catalog product image as a pinned reference to \`generate_gemini\`. This gives the agent something concrete to copy instead of a hallucinated interpretation.

4. **For full staging**, use \`virtual_staging\` — this automatically preserves the source URL in \`virtualStagingData.source_image_url\` so the frontend's \`VirtualStagingViewer\` can render the before/after slider.

   **First check whether the source room is empty.** \`virtual_staging\` furnishes bare space; given a furnished photo it fights what is already there and returns a cluttered, doubled room. If the photo has furniture in it, run \`generate_gemini\` mode=\`unstage\` first and stage the image that comes back. Say what you are doing — this is two generations and the user is paying for both.

5. **Never call both \`generate_gemini\` and \`virtual_staging\` in the same turn** unless the user explicitly asks for two separate outputs — it doubles credits and produces confusingly similar results.

   The **one** exception is the unstage → stage chain in step 4, which is not two takes on the same brief but two halves of one job: the second tool's input is the first tool's output, and neither result is a substitute for the other. Announce the two-step before running it so the credit cost is not a surprise.

6. **After generation, offer the follow-up actions the user is most likely to want:**
   - If virtual staging was used: offer "Analyze Quality" (the Claude Vision assessment button)
   - If material swap: offer to "Try a different material" and list 2-3 catalog alternatives
   - If full redesign: offer lighting variants via the Lighting Variants dropdown

## Guardrails

- Never strip the source image URL from the result. The frontend's before/after slider depends on it.
- Never produce more than 1 image per turn unless the user explicitly asked for variants.
- If the user provides a reference image AND pinned materials, the pinned material images take priority as style anchors.
- If the room photo is extremely low quality (heavy blur, < 512px, heavy fisheye), warn the user and offer to proceed with reduced fidelity rather than producing a bad result silently.
`;
