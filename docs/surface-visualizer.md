# Surface Visualizer

A product's real face on a room photo, at its real format, with a laying pattern and a joint — drawn in the browser, deterministically, with no model turn and no credits. Issue #447 (Phase 1); the competitor review and the Phase 0 audit that led here are in #404.

Route: `/visualizer`. Product entry: "See it on a surface" on the product card and the product detail. Agent entry: the `visualize_on_surface` tool and the "See it on a surface" quick-start in the Interior Design toolkit.

---

## Two renderers, one rule

| | Deterministic (this) | AI (`generate_gemini`, staging, AnyDoor) |
|---|---|---|
| Answers | "what does THIS product look like here" | "restyle / stage / make it photographic" |
| Scale, pattern, joint | exact, from the product's recorded format | plausible |
| Cost | none | credits per try |
| Repeatable | yes — the same URL is the same picture | no |

Generative is never in the deterministic render path (`tests/unit/surfaceRenderer.test.ts` fails on any provider import in `src/lib/surfaceRenderer/`). The one model step, **Render photoreal**, starts from the finished composition and asks the edit path to change nothing but realism.

---

## How a render is made

1. **Scene** — a room photo with one or more **surfaces**: a flat rectangle given by four corners in the photo (far-left, far-right, near-right, near-left, normalised 0..1) and its real size in cm. A surface may carry a **mask** PNG (light = paint) so furniture in front of it stays.
2. **Product face** — the selected tileable albedo from `product_material_maps`, else the product photo (`roomPlannerService.surfaceTexturesForProducts`). The longer image side is taken as the piece's length.
3. **Format** — `tileFormatM` in `src/components/features/roomplanner/surfaceFormat.ts`: registry tile fields (cm unless `dimension_unit` says otherwise), `plank_*_mm`, `roll_width_cm`/`roll_length_m`, structured sizes, and the extractors' "60x60" strings. Absent → 60 × 60 cm and the label says **assumed**.
4. **Render** — `src/lib/surfaceRenderer/`: a homography maps world centimetres onto the quad; each pixel inside the quad (and the mask) is looked up in the pattern lattice, coloured from the face or the joint, and multiplied by the photo's own shading relative to the surface's mean brightness, so light and shadow survive.

Patterns (`PATTERNS` in the import-free `patternVocabulary.ts`, mirrored to Deno as `surfacePatterns.generated.ts`): stack, offset ½, offset ⅓, diagonal, herringbone, herringbone at 45°, basket weave. Herringbone and basket weave need the length to be a whole number of widths; `patternWarning` says so rather than laying it wrong silently.

The render state (scene, surface, product, pattern, joint, colour, rotation) round-trips through the URL (`parseRenderState` / `serializeRenderState`), which is what "Copy link" and the agent card carry.

---

## Data

| Table | Holds | RLS |
|---|---|---|
| `visualizer_scenes` | the photo (`storage_bucket` + `image_path`, px size), `workspace_id` NULL = the platform library | library readable by every signed-in user, written by the service role only; workspace rows by `is_workspace_member` |
| `visualizer_scene_surfaces` | `key`, `kind`, `quad` jsonb, `width_cm`, `depth_cm`, `mask_path` | through the scene, same rule, one policy per command |

Storage: `generation-images/visualizer/scenes/<scene_id>/scene.<ext>` and `.../masks/<surface_id>-<ts>.png`, both registered in `build_storage_reference_set()`. A re-mask is a NEW object — members may insert into the bucket, not update — and the row's `mask_path` moves to it; the old file drops out of the reference set and the orphan cron reaps it after the 14-day grace. A recorded format reaches the lattice through `normalizeFormat`, short side first, whichever way round the product recorded it.

Own photos: **Upload your room photo** on the page, then **Mark a surface** — click four corners, give the real size, and optionally let SAM 2 cut the mask (`/api/segment/sam`, box hint; a rectangle is never passed off as a segmentation).

The library was seeded 2026-09-13 from six of the project cover renders (kitchen, bathroom, living, bedroom, dining, hallway), each with a floor surface and a SAM mask. Adding a library scene means uploading the photo, inserting the rows with the service role, and authoring the quad; there is no admin UI for the library yet.

---

## Known limits

- The registry carries no unit column, so the format units are a convention in `tileFormatM`. #447 records the follow-up: a unit on `material_metadata_fields` and `tile_width_m` derived on the surfaces view.
- The face is sampled with nearest-neighbour and one repeat per piece; no per-piece variation and no anti-aliasing beyond 2× supersampling on the page.
- A product photo on a host without CORS headers cannot be read by the browser; the page says so. Generate a tileable face (`ProductMaterialMapsCard`) to get a storage-hosted albedo.
- Walls are authored the same way as floors; there is no perspective-corrected editor, corners are clicked.
- Compare, QR, kiosk and the public embed are Phase 2 and 3 in #447.
