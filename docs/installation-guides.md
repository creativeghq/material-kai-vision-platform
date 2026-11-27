# Installation Guides

A supplier's assembly PDF becomes an interactive step-by-step 3D build, with the manual's page
beside each step and a public share link. Module `installation-guides` (own `public.modules` row);
routes are wrapped in `EntitlementGuard`. Nav: Projects hub → Installation Guides.

| Route | Page |
|---|---|
| `/guides` | `pages/Guides/GuidesPage.tsx` — list + *New guide* (upload a PDF, read it) |
| `/guides/:id` | `GuideDetailPage.tsx` — Steps / Parts ("The Kit") / Look tabs, Publish / Unpublish |
| `/guides/:id/play` | `GuidePlayerPage.tsx` — the 3D player |
| `/g/:token` | `PublicGuidePage.tsx` — public, no auth |

## Data

`installation_guides` — one row per manual: `workspace_id`, `title`, `status`
(`draft` / `extracting` / `review` / `published` / `failed`), `page_count`, `page_aspect`, `guide`
jsonb (kit + steps + assembled layout), `error`, `extracted_at`, `published_at`,
`public_share_token`, `appearance` jsonb (finishes, per-part assignment, room plate + wall
outline, `image_path`). Service: [src/services/installationGuideService.ts](../src/services/installationGuideService.ts).

Storage: private `pdf-documents` bucket under `installation-guides/<workspace_id>/<guide_id>/`
— the PDF, `pages/pNNN.webp` page images rendered in the browser before the read, and the
product photo. Read paths mint signed URLs.

A published guide is read-only in the editor; unpublish to correct it.

## Edge functions

| Function | Does | Cost |
|---|---|---|
| `installation-guide-extract` | Claims the row (`status → extracting`; a stale `extracting` row can be re-claimed), debits `catalog_installation_guide` × `page_count` BEFORE the model, then reads the page images in passes — the parts list over all pages, steps in batches of 6 pages, and the assembled layout — each a strict `output_config.format` JSON schema, merged by `mergeGuidePasses`. Prompts from the registry (`extraction` / `installation_guide` / `system`, `kit`, `steps`, …). | per page |
| `installation-guide-appearance` | Finds or takes a product photo (a pasted URL goes through `assertSafeUrl`), debits `catalog_installation_guide_appearance` × 1, and reads the finishes and the room behind the product (strict schema). | 1 credit |
| `installation-guide-public` | Serves a guide by its 64-hex `public_share_token` with signed page and photo URLs (6 h). 404 on an unknown or revoked token. | free |

`set_installation_guide_public_share` turns the public link on or off; turning it off invalidates
the old token.

## Player

Steps bring parts in one piece at a time; hardware rides its panel; doors swing and drawers
slide; holes and part numbers are drawn. Views: *Your Space* (the build in the photographed room —
the back wall is straightened into a level plate from the four corners the user drags in the Look
tab), exploded (⇧X), part names (⇧N), follow/hold camera (F), manual (⇧B), `[` / `]` steps,
space to play. Works at phone width.

## Tile installation guide

A separate, public tool at `/tools/tile-installation` (`pages/Tools/TileInstallationPage.tsx`):
a step-by-step 3D floor build from room size, tile format, pattern, joint, wall gap, cutting
allowance and trowel notch, optionally composited into the user's room photo, with tiles to order,
spacers, adhesive and grout. The agent's `plan_tile_installation` returns `set_out` per room from
`tileSetOut` (shared, mirrored to the edge), which reads the layout `buildTileFloorPlan` makes:
full tiles, cut pieces grouped by size, the edge piece on each wall, and three checks — no cut
under a third of a tile, edge cuts match on opposite walls, room sizes stated by a person. An
angled pattern is reported as not measured, never as passing. `TileInstallationResultCard` opens
`TileDrawingsDialog` (setting-out sheet per room, cut schedule, checks, vector PDF). Eval case
`tiling.setting_out_checks_reported`.

User guide: [public/documentation/installation-guides.html](../public/documentation/installation-guides.html).
