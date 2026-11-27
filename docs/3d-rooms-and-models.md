# 3D Rooms, Renders and Generated 3D Models

Reference for the 3D and interior-visualisation stack as it runs today (2026-11-26).
User-facing pages: `public/documentation/3d-rooms.html`, `room-planner.html`, `product-3d.html`.
Open work lives on GitHub (#617 generated furniture, #604 kitchen studio, #608 generators from geometry).

## 1. What exists

| Capability | Where | Runs on | Cost to the user |
|---|---|---|---|
| Read a plan / photo / render / drawing page into a 3D room | `scene-studio-read` | Claude `claude-fable-5-2`, strict `output_config.format` schema | `scene-studio-extract` ($0.25/image, `ai_markup` ×1.5) |
| Edit the room (move, rotate, walk, finishes, colour plan, sun) | `SceneEditor` / `SceneCanvas` (browser) | three.js 0.178 | free |
| Clean seamless texture for a surface | `surface-texture` | Gemini | 6 credits |
| Photoreal render of the current view | `generate-interior-gemini` `mode: 'scene-render'`, `model_tier: 'fast'` | Gemini Nano Banana 2.1 | 6 credits |
| Object edit / area edit on a render | `generate-interior-gemini` `mode: 'image-edit'` + client mask composite | Gemini Nano Banana 2.1 | 6 credits |
| Make one object 3D / Make All Furniture 3D | `object-3d` → MIVAA `/api/internal/object3d/generate` | SAM 3D Objects on fal, for every product photo and room piece | 10 credits per NEW model (an existing one is placed free), refunded on failure |
| Premium Generation (a product only, asked for) | `object-3d` with `quality: 'premium'` | Hunyuan 3D 3.1 Pro on fal | 15 credits (`object-3d-premium`); a photo not on white fails, refunds and keeps the standard model |
| Photo Mode picture | `PhotoMode.tsx` (browser) | `three-gpu-pathtracer` 0.0.23 + Intel OIDN (`oidn-webgpu`) | free |
| Baked light | `bakedLight.ts` (browser) → `scene_lightmaps` | path tracer, 256 spp, 5 bounces | free |
| Walkthrough / before-after video | `WalkthroughRecorder.tsx`, `beforeAfterVideo.ts` | frame-by-frame 24 fps, `mediabunny` MP4/AVC or WebM/VP9 | free |
| Kitchen drawings, cut list, assembly and tile sheets, kitchen price | `KitchenDrawings*`, `AssemblyDrawings`, `TileDrawings`, `price_kitchen` | browser + SQL | free |
| Client walkthrough link | `/cv/:token` (`walkthrough_floor_plan_id`), `/p/:token` | `_shared/scene-walkthrough.ts` | free |
| Room Planner | `/room-planner`, `/embed/planner` | `room_layouts_resolved` views, `RoomScene3D` | free; "Add to quote" via `add_layout_to_quote` |
| Virtual staging (furnish an empty photo) | `generate-virtual-staging` | Gemini 3 Pro Image (Nano Banana Pro) | `GENERATION_CREDIT_COSTS['gemini-3-pro-image']` |
| Unstage (empty a photo) | `generate_gemini` mode `unstage` | Gemini 3 Pro Image | same |

There is no standalone Scene Studio page. A 3D room opens on the agent canvas (`AgentHub` → lazy `SceneEditor`),
from the Vision / JARVIS `manage_scenes` tool, the Interior Design toolkit ("My 3D Rooms", "Editable 3D From a
Plan/Photo"), or "Open in 3D" on an image. Gate: module `scene-studio` (client `isModuleAvailable`, server `moduleGate`).

`manage_scenes` actions: create, status, list, open (view / walk / make_3d / drawings, fronts, sun_hour), finish,
price_kitchen, handles, cut_list, layout, price_line, share_walkthrough, render, renders, drawing_set,
assembly_sheets, walkthrough_video, photograph, bake_light, client_look.

## 2. Data

`floor_plans` (the scene) · `floor_plan_rooms` · `floor_plan_walls` · `floor_plan_openings` · `floor_plan_objects`
(incl. `model_status`, `model_storage_path`, `model_source_url`, `model_error`, `model_finish`, `model_updated_at`,
`size_source`) · `floor_plan_surfaces` · `floor_plan_object_finishes` (`product_id` or `colour_hex`, per `slot`) ·
`scene_renders` · `scene_lightmaps` · `product_3d_models` (`source`, `format='glb'`, `generator`, `width_m/depth_m/height_m`)
· `product_3d_model_variants`.

A `scene_renders` row stores `capture_path` (the 3D view sent to Gemini), `id_pass_path`, `id_map`
(`#hex → object id`), `camera` and `layout_snapshot`. Photo Mode pictures are rows with `source='photo_mode'`,
`credits_used=0`.

## 3. The ID pass — how an object is found in a picture

Every render saves an ID pass: the same camera, each object drawn in one flat colour (`idColour(index)`, golden-angle
hues). It is what lets an object edit change only that object and what cuts an object out for Make 3D.

- **The colours are exact.** Match with tolerance ≤ 8 (`objectMask` uses 6). Hues are spread by golden angle, so with
  30+ objects neighbours sit within ~48 of each other; a ±48 match took the anti-aliased EDGE pixels of other objects —
  the TV Unit's "mask" was the outline of the bed. Guarded by `tests/unit/object3dMesh.test.ts`.
- **`id_map` lists every object in the scene, visible or not.** Being in `id_map` says nothing about being visible.
- **Make 3D picks the render where the object covers the most pixels** (`mask.box.coverage`), across all renders with an
  ID pass, and refuses below `MIN_VISIBLE_COVERAGE` (0.04% of the frame) before any charge. Never "the render on screen":
  that cut living-room furniture out of the bedroom render.

## 4. Generated furniture (`object-3d`)

1. Edge: claim the row, debit `object-3d` (10 credits) or, for `quality: 'premium'`, `object-3d-premium` (15), build the input.
   Premium is refused for a room piece (400) and a supplier model (409); it remakes a ready model whose `generator` is not
   Hunyuan, passing that model as `previous_path` so a failed Premium restores it (`ready` + `error`) instead of losing it.
   - Scene object: crop of the best render + exact mask (`cropFromRender`), noun = the object kind.
   - Product: the product photo + `object_kind` (required; a product NAME is not a prompt — a box around the whole photo modelled the floor).
   - "In these materials": the photo is first repainted with Gemini (`object_3d/clean_shot_finish`, charged separately).
2. MIVAA `object3d_routes.py` picks the engine (`choose_engine`) from what was PAID for, never on its own:
   - **SAM 3D Objects** (`fal-ai/sam-3/3d-objects`, $0.02) unless `premium`: every scene object (render crop + mask) and
     every product photo. `mask_urls` if given, else a `box_prompts` foreground box when the photo is a clean shot
     (`is_clean_shot` = ≥92% of a 4% border band is studio white, ≥235 grey), else `prompt`; `export_textured_glb`, seed 42.
   - **Hunyuan 3D 3.1 Pro** (`fal-ai/hunyuan-3d/v3.1/pro/image-to-3d`, `face_count` 50,000, $0.525 = $0.375 + $0.15 custom
     face count) only when `premium`. It takes no mask and no noun, so a premium run on a room piece, a photo over 8 MB or
     a photo that is not a clean shot raises `PremiumNotPossible` → refund. It is never quietly made with SAM instead.
   - Both: 10 min deadline, 80 MB cap, `glTF` magic check; then `slim_glb_textures` re-encodes opaque embedded textures
     as ≤2048 px JPEG (Hunyuan ships a 4096 PNG: 11.8 MB → 1.5 MB, visually identical); re-hosted to `generation-images`
     as `.glb`; `log_external_call` at that engine's `ai_model_pricing` row; `generator` records which engine made it.
     Failure → refund + `failed` with the provider message. Never a second engine after a failure.
3. Browser: `meshModel.tsx` + `lib/scene/modelFit.ts` stand the GLB in the object's box (y-up, front +Z, natural axes, max
   per-axis stretch 1.8).

**Size.** A SAM mesh has proportions, not metres. In a 3D room it takes the object's box. In the Room Planner a generated
product model gets `width_m/depth_m/height_m` only from a size a PERSON stated (`size_mm` on the request, or a room object
with `size_source='manual'`); otherwise the planner shows its 0.60 m placeholder (`footprint_source='default'`).

**Texture.** A mesh cut from a render carries that render's light: a sage sofa in a warm render came back taupe. A
product packshot gives truer colour than a room crop.

**Probe:** `object_3d.generation_failing` (registry, warning, autoheal off): ≥3 runs in 24h with <50% ready, or a row
stuck `processing` > 30 min.

## 5. Model choices and the measurements behind them

All on our own inputs (IKEA-style packshots, Demo Apartment renders), 2026-11-24 … 26. One sample per model per case.

### Image → 3D (furniture)

| Model | $/run | Time | Size / faces | Verdict |
|---|---|---|---|---|
| **SAM 3D Objects** (fal) — **standard, every model** | 0.02 | 33–41 s | ~1.3 MB / 10–16k | Faithful shape and colour; clean backs; soft on fine tufting; plants come out blobby |
| **Hunyuan 3D 3.1 Pro** (fal) — **Premium Generation only** | 0.525 at 50k faces (0.375 default) | 145–170 s | 1.5 MB slimmed / 50k (26 MB at default 500k) | Best detail (seat tufting, bed lift handle); 50k keeps the tufting; no mask input |
| Trellis 2 (fal) | 0.05 | 35–95 s | 16–20 MB / 470k | Good shapes; speckled mattress texture; best plant (keeps variegated leaves) |
| Tripo P2 (fal) | ~0.01/credit | ~70 s | 1.4–3 MB / 3–5k | Light; exports rotated 90°; bed colour drifted yellow, headboard wrong |
| Meshy 7.1 (fal) | 0.80 | ~95 s | 3.5 MB / 26k | Good, scribbled mattress texture; 40× SAM's price |
| Rodin Gen-2 (Replicate) | 0.40 | 2–9 min | 35–50 MB / 1M | Cleanest geometry, needs a size bbox; heavy |
| Idol (Modal splats) | — | — | — | **Retired** — splats, no mesh |

Decision (2026-11-27, revised the same day): SAM 3D is the standard for everything. Side by side on the same packshot
Hunyuan is visibly sharper only up close (tufting, seams, chrome legs) at ~26× the cost, so it is an opt-in
**Premium Generation** (15 credits) for a product photo on white, never chosen automatically.

### Remove one object (masked)

| Model | $ | Result on the sofa mask |
|---|---|---|
| fal Object Removal `/mask` | 0.006 | **Fails** — glassy smear, broke the lamp |
| Finegrain Eraser `/mask` | 0.045 | **Best** — sofa gone, rug and lamp kept, clean floor and wall |
| Bria Eraser | 0.04 | Clean, but also took the lamp and part of the rug |
| FLUX Pro Erase | ~0.004/MP | Clean, invented a wall socket |
| Nano Banana 2 / Pro (prompt, no mask) | 0.08 / pro | Good, but regenerate the whole frame — nothing pixel-exact outside the object |

Our current object edit uses Gemini + a client-side mask composite, which keeps the outside pixels exact. If a
dedicated eraser is added, Finegrain is the one to wire.

### Empty a room (unstage) and furnish it (virtual staging)

- **Unstage: Nano Banana Pro (current) follows the removal list; Nano Banana 2 left a floor lamp and a pendant.**
- **Staging: Nano Banana Pro (current) keeps the architecture.** Nano Banana 2 deleted the partition wall between two
  rooms; the FLUX 2 apartment-staging LoRA furnished the next room too.
- **Proplabs is not used.** `generate-virtual-staging` calls Gemini 3 Pro Image directly; `PROPLABS_API_KEY` survives
  only in the model health-check key list.
- The old Replicate inpaint paths (`stable-diffusion-inpainting`, AnyDoor) are object INSERTION/fill helpers, verified
  working 2026-09-13; they are not a removal or staging path.

### Image editing / video (bench of 2026-11-26, other session)

Keep the MIVAA swatch restore on NB2 (NB 2.1 darkens swatches ΔE 14.8 vs 1.9); pin `aspect_ratio` on NB Pro with two
images; background removal providers are equivalent on white packshots; for room video H3 Max is the steadiest.

## 6. Retired — do not document as live

Gaussian splats / Spark.js · Idol on Modal · World Labs Atlas "photoreal rooms" (`scene_worlds` dropped) · VR World /
`generate-vr-world` / Marble · the standalone Scene Studio page · product-modal 3D cards (3D model card, scene card,
material maps, configurator, AR, Place in a room) · a Gemini "clean shot" before every Make 3D (finish variants only).

## 7. Known limits

- Photo Mode, baked light and recording run in the browser: the tab must stay in front; OIDN needs WebGPU.
- An object hidden in every render cannot be made 3D — render a view that shows it.
- Credit labels in the UI ("10 credits", "6 credits") are text; the debit reads `ai_model_pricing`. Change both together.
- Finishes are a library product or a bare colour today; a named material (oak, black steel …) with colours per
  material is the next step.
