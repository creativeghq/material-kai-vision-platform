# Moodboard Presentation Sheets

Nine client-ready sheet types attached to a moodboard, generated through the JARVIS agent chat and exported as A3-landscape PDFs. Sheets are persistent and editable: every sheet is a row in `moodboard_presentation_sheets` with a JSONB `data` payload, so users can re-open and re-render without redoing their inputs.

Shipped 2026-05-02. The 9th type (`area_breakdown`) and **Project Client Views** (a project-scoped deliverable that bundles sheets across moodboards) landed 2026-06-01 — see [§ Project Client Views](#project-client-views).

---

## Table of contents

1. [Sheet types and credit cost](#sheet-types-and-credit-cost)
2. [Architecture overview](#architecture-overview)
3. [How a sheet is generated, end to end](#how-a-sheet-is-generated-end-to-end)
4. [File-by-file reference](#file-by-file-reference)
5. [How to use it (operator/dev)](#how-to-use-it-operatordev)
6. [Deployment](#deployment)
7. [Extending the feature](#extending-the-feature)
8. [Troubleshooting](#troubleshooting)

---

## Sheet types and credit cost

| Type | Cost | Interactive? | Inputs the agent / user must provide |
|---|---|---|---|
| `material_board` | 0 cr | No | `product_ids[]` (cap 8). Optional `chip_descriptions{product_id: text}` to override product description text. |
| `color_palette` | 0 cr | No | `swatches[{hex, name, source_image_id?}]` (cap 8). |
| `concept_board` | 0 cr | No | `layout[{image_url, caption?}]` (cap 6). |
| `lighting_plan` | 3 cr | Yes | `backdrop` (`{kind: 'upload'\|'rect', image_url? OR width_mm/height_mm}`), `symbols[{id?, type, x, y, label?, product_id?}]` (normalized 0..1), `legend[{symbol_type, label}]`. |
| `plumbing_plan` | 3 cr | Yes | Same shape as `lighting_plan`; symbol types are `wc / basin / bath / shower / floor_drain / water_supply / waste / water_heater / mixer`. |
| `electrical_plan` | 3 cr | Yes | Same shape as `lighting_plan`; IEC 60617-style types `socket / socket_double / switch_1way / switch_2way / dimmer / distribution_board / data_outlet / tv_outlet / dedicated_point / junction_box / earth_point`. **Added 2026-08-04.** |
| `annotated_render` | 3 cr | Yes | `backdrop_image_url`, `annotations[{x, y, line_endpoint_x, line_endpoint_y, label, product_id?, source: 'ai'\|'manual'\|'auto'}]`. |
| `elevation_render_pair` | 2 cr | Yes | `elevation_image_url`, `render_image_url?`, `dimensions[{x1,y1,x2,y2,value,unit}]`, `tile_callouts[{x,y,label}]`. |
| `ffe_schedule` | 0 cr | No | `quote_id` (preferred — pulls items from `quote_items`) OR explicit `items[{room, name, dimensions, install, delivery, qty, price?}]`. |
| `full_deck` | 3 cr | No | `included_sheet_ids[]` in display order, `cover{title, description?, client_name?, cover_image_url?, date}`. |
| `area_breakdown` | 2 cr | No | Single composited one-page room spec (Zubexa-style). `AreaBreakdownData`: `{subtitle, hero_image_url, plan_image_url, elevation_image_url, finishes[], fitting_columns[], palette[], notes[]}`. Builder `buildAreaBreakdown` (`builders.ts`); renders inside `full_deck` and Client Views like any other sheet. **Added 2026-06-01.** ⚠️ Requires `ALTER TYPE moodboard_sheet_type ADD VALUE 'area_breakdown'` in the target DB before use. |

**Passive vs interactive**:
- **Passive types** (`material_board`, `color_palette`, `concept_board`, `ffe_schedule`, `full_deck`) — the tool gathers the inputs from the agent's tool call, debits credits, inserts the row, and immediately invokes `generate-moodboard-sheet-pdf`. The chat surface receives `sheet_pdf_ready` and renders a `SheetPreviewCard`.
- **Interactive types** (`lighting_plan`, `annotated_render`, `elevation_render_pair`) — the tool debits credits, inserts the row with the agent's pre-filled `initial_data`, and emits `sheet_canvas_open`. The chat surface mounts a `SheetCanvasCard` widget. The user finishes the inputs in-canvas (drag callouts, drop dimensions, place fixture symbols), then clicks **Render PDF** which calls `moodboardSheetsService.generatePdf()`.

**Credits are debited at tool-call time, not at render time.** If the user abandons an interactive sheet without rendering, credits stay debited (delete the sheet to clean up; no automatic refund). The exception is the insert-failure path inside the tool — if the DB insert fails after the debit, the tool refunds.

---

## Architecture overview

```
                   ┌────────────────────────────────────────────────────┐
                   │                  USER (browser)                     │
                   │  /moodboard/:id  →  Sheets tab  →  + New Sheet     │
                   │  ↓ navigates to /agent-hub?agent=kai&q=...          │
                   │  /agent-hub  ←  chat with JARVIS agent                 │
                   └────────────────────────────────────────────────────┘
                                         │
                                         ▼
        ┌──────────────────────────────────────────────────────────────┐
        │          supabase/functions/agent-chat/index.ts              │
        │  - Loads `kai` (or `interior-designer`) agent config         │
        │  - Lazy-imports presentation-sheet-tool.ts                    │
        │  - Streams chunks back via onChunk                            │
        └──────────────────────────────────────────────────────────────┘
                                         │
                          (LangChain tool call)
                                         ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  supabase/functions/_shared/tools/presentation-sheet-tool.ts │
        │  generate_presentation_sheet:                                  │
        │    1. Validate moodboard ownership                            │
        │    2. Debit credits (debit_user_credits RPC)                  │
        │    3. Insert moodboard_presentation_sheets row               │
        │    4. Emit chunk: sheet_canvas_open OR sheet_pdf_ready        │
        │    5. (passive) Invoke generate-moodboard-sheet-pdf            │
        └──────────────────────────────────────────────────────────────┘
                       │                                  │
       (interactive)   │                  (passive: immediate)
                       ▼                                  ▼
   ┌───────────────────────────────┐    ┌─────────────────────────────────┐
   │  Frontend: SheetCanvasCard    │    │ generate-moodboard-sheet-pdf    │
   │  - CalloutCanvas              │    │  - fetches sheet + moodboard    │
   │  - DimensionCanvas            │    │  - dispatches by sheet_type     │
   │  - FixtureSymbolCanvas        │    │  - builds A3 PDF (pdf-lib)      │
   │  User clicks Render PDF       │    │  - uploads to storage           │
   │  ↓ moodboardSheetsService     │    │  - returns signed URL           │
   │     .update() → generatePdf() │    └─────────────────────────────────┘
   └───────────────────────────────┘                       │
                       │                                   │
                       └────────────────┬──────────────────┘
                                        ▼
              ┌────────────────────────────────────────────────────────────┐
              │  Storage: pdf-documents (private bucket, post 2026-05-23)  │
              │  Path: moodboard-output/{mb_id}/sheet-{sheet_id}.pdf       │
              │  Access: 7-day signed URL                                   │
              └────────────────────────────────────────────────────────────┘
```

**Coordinate convention (critical):** every annotation, dimension, and fixture symbol stores `x/y` as **normalized [0..1]** relative to the rendered backdrop image area (not pixel coords). Both the frontend canvas widgets and the PDF builder use this convention. This means a sheet built on a desktop renders identically when re-opened on mobile, and the PDF positions match the canvas exactly.

---

## How a sheet is generated, end to end

### Passive sheet — example: `material_board`

1. User opens moodboard → Sheets tab → clicks "New Sheet" → picks "Material Board".
2. Frontend calls `navigate('/agent-hub?agent=kai&q=Create a Material Board for moodboard <uuid>...')`.
3. JARVIS agent loads with the seeded prompt. The system prompt addendum (applied by the second migration) tells it to call `generate_presentation_sheet` with the appropriate `sheet_type` and inputs. The agent asks the user to confirm which products to include.
4. Agent calls `generate_presentation_sheet({moodboard_id, sheet_type: 'material_board', title, initial_data: {product_ids: [...]}})`.
5. Tool validates the user owns the moodboard, debits 0 credits (no-op), inserts a row, calls `supabase.functions.invoke('generate-moodboard-sheet-pdf', {body: {sheet_id}})`.
6. Edge function fetches the sheet + moodboard + product chips (with thumbnails from `image_product_associations`), builds the PDF, uploads to storage, returns signed URL.
7. Tool emits `sheet_pdf_ready` chunk with the URL.
8. AgentHub creates a message with `sheetPdfData` set; renders `SheetPreviewCard` (iframe preview + download).

### Interactive sheet — example: `annotated_render`

1. Same first 3 steps as above, but the user picks "Annotated Render Sheet" and the seeded prompt tells the agent to ask which render to annotate.
2. Agent calls the tool with `initial_data.backdrop_image_url` and (optionally) pre-filled `annotations[]`.
3. Tool debits 3 credits, inserts the row, emits `sheet_canvas_open`.
4. AgentHub renders `SheetCanvasCard` → `CalloutCanvas` mounted with the backdrop image and any pre-filled annotations.
5. User drags anchor dots and label boxes, edits labels in the side list, adds new callouts by clicking on the image.
6. User clicks **Render PDF** in the canvas.
7. Canvas calls `moodboardSheetsService.update(sheetId, {data: {backdrop_image_url, annotations}})` to persist, then `generatePdf(sheetId)` which invokes the edge function.
8. Edge function builds the PDF (red anchor dots → leader lines → white label boxes + side legend with up to 8 product chips), uploads, returns URL.
9. Canvas swaps to `SheetPreviewCard` with the result.

---

## File-by-file reference

### Database

#### [`supabase/migrations/20260502_moodboard_presentation_sheets.sql`](../supabase/migrations/20260502_moodboard_presentation_sheets.sql)

Creates two enums (`moodboard_sheet_type`, `moodboard_sheet_status`), the `moodboard_presentation_sheets` table, indexes (by moodboard, by user, by type+status), an `updated_at` BEFORE-UPDATE trigger, and RLS policies (owner-of-moodboard read/write + public-moodboard-readable). The original migration also created a `moodboard-sheets` storage bucket — that bucket was retired on 2026-05-23; sheet PDFs now live under `pdf-documents/moodboard-output/` with the consolidated RLS policy.

**Key columns**:
- `data jsonb` — per-sheet-type payload. Schema documented inline in the migration's column comment.
- `status` — `draft / generating / ready / failed`.
- `pdf_storage_path`, `pdf_url`, `pdf_generated_at`, `page_count` — populated by the edge function.
- `credits_used`, `ai_log_ids[]` — cost mirror.
- `error_message` — populated on `failed`.

#### [`supabase/migrations/20260502_kai_prompt_presentation_sheets_addendum.sql`](../supabase/migrations/20260502_kai_prompt_presentation_sheets_addendum.sql)

Idempotently appends a guidance block to the `kai` and `interior-designer` agent prompts. Uses a marker (`--END_PRESENTATION_SHEETS_ADDENDUM--`) to skip if already applied. The block tells the agent how to choose a sheet type, what inputs each one needs, when to ask the user vs proceed, and that interactive types should not be re-prompted after the canvas opens.

### Edge function — [`supabase/functions/generate-moodboard-sheet-pdf/`](../supabase/functions/generate-moodboard-sheet-pdf/)

#### `index.ts` — request handler / dispatcher

Receives `{sheet_id}`, authenticates, fetches the sheet row, resolves the title block (`project_title` from moodboard, `client_name` from `data.cover.client_name` or the user profile, `sheet_label` from the type), then `switch`es on `sheet_type` and invokes the right builder. Saves the PDF to `pdf-documents/moodboard-output/{moodboard_id}/sheet-{sheet_id}.pdf`, generates a 7-day signed URL, updates the sheet row to `status='ready'`. On error, marks `status='failed'` and writes `error_message`.

**Why 7 days, not 1 hour?** Quote PDFs use 1h because users typically download once. Sheet PDFs are presentation deliverables clients re-open repeatedly; 1h would force re-signing every time the moodboard tab is opened.

#### `builders.ts` — eight per-sheet builders

One function per `sheet_type`:
- `buildMaterialBoard` — 4×2 chip grid (image + name + category + first 4 lines of description), overflow indicator if `>8` chips.
- `buildColorPalette` — up to 4-cols swatch grid using `hexToRgb`. `hex` rendered as fill, `name` as caption.
- `buildConceptBoard` — 3×2 image collage with optional captions overlay.
- `buildLightingPlan` — left 70%: backdrop (uploaded image OR plain rectangle for typed dims) + fixture symbols at normalized coords. Right 30%: legend.
- `buildAnnotatedRender` — left 65%: backdrop + red anchor dots + leader lines + white label boxes. Right 35%: up to 8 legend chips with thumbnail + name + 4-line description.
- `buildElevationRenderPair` — top half: elevation image + dimension lines (red leader + tick marks + value+unit text) + tile callouts. Bottom half: render image (no annotations).
- `buildFfeSchedule` — table with 8 columns (#, Room, Item, Dimensions, Install, Delivery, Qty, Price). Alt-row shading. Caps at one page; appends "+ N more" if overflow.
- `buildFullDeckCover` — full-bleed cover image at 45% opacity + centered title + description + client + date. Then `buildSheetForDeck` is called for each `included_sheet_id`, which dispatches to the appropriate per-type builder above.

All builders take `(pdfDoc, fonts, titleBlockData, ...payload)` and return void after appending exactly one page. `buildSheetForDeck` calls them in order.

#### `data-fetcher.ts` — shared DB queries

- `fetchSheet`, `fetchMoodboard` — primary lookups.
- `fetchClientName` — pulls user profile name/email for the title block default.
- `fetchProductChips(productIds[])` — joins `products` + `image_product_associations` + `document_images` for thumbnails. Returns `ProductChip[]` with `name, description, image_url, hex, category` extracted from `metadata`.
- `fetchQuoteFfeItems(quoteId)` — pulls `room, name, dimensions, installation_requirements, delivery_date, qty, unit_price` from `quote_items`.
- `fetchSheets(sheetIds[])` — for `full_deck` to load sub-sheets.

#### `layout.ts` — A3 helpers

A3 landscape constants (`PAGE_W = 1190.55`, `PAGE_H = 841.89`), color palette, font loader, image embedder (auto-detects PNG vs JPG via magic bytes), `fetchImageBytes` (HTTP GET + Uint8Array conversion), `drawTitleBlock` (4-cell bottom strip: PROJECT / SHEET / TYPE / DATE+sheet#), `drawSheetHeader` (top title + subtitle + horizontal rule), `wrapText` (word wrap to a max width using `font.widthOfTextAtSize`), `truncate`, `hexToRgb`.

#### `types.ts` — shared interfaces

`SheetType`, `SheetRow`, `MoodboardRow`, request/response envelopes, payload shapes (`ProductChip`, `SwatchData`, `AnnotationData`, `DimensionData`, `FixtureSymbolData`, `FfeItem`).

#### `deno.json` — import map

`pdf-lib` (1.17.1 from esm.sh) and `@supabase/supabase-js` (npm).

### Agent tool — [`supabase/functions/_shared/tools/presentation-sheet-tool.ts`](../supabase/functions/_shared/tools/presentation-sheet-tool.ts)

`createPresentationSheetTool(userId, onChunk)` returns a LangChain tool with name `generate_presentation_sheet`.

Flow:
1. **Validate moodboard ownership.** Looks up `moodboards.user_id === userId`. Returns `{error: "Not authorized for this moodboard"}` if not.
2. **Debit credits.** Calls `debit_user_credits` RPC with `p_amount = SHEET_CREDITS[sheet_type]` (`0/2/3` per the table above) and `p_operation_type = 'presentation_sheet_<type>'`. Returns `{error: "Credit debit failed: <reason>"}` on insufficient balance.
3. **Mirror to `ai_usage_logs`.** Writes a row with `model_name='presentation-sheet'`, `api_provider='platform'`, the credit count, and metadata `{feature, sheet_type, moodboard_id, title}` so cost reporting picks it up.
4. **Insert sheet row.** With `status='draft'` and the agent-supplied `initial_data` payload. On insert failure, refunds the debit (calls `debit_user_credits` with negative amount).
5. **Emit `sheet_created` chunk.** Lightweight ack so the chat can log it.
6. **Branch.** For interactive types (and `auto_render=false` which is the default), emit `sheet_canvas_open` and return `{status: 'awaiting_canvas_input'}` — the chat surface will mount the canvas. For passive types (or `auto_render=true`), invoke `generate-moodboard-sheet-pdf`, then emit `sheet_pdf_ready` and return `{status: 'ready', pdf_url}`.

The schema (zod) on the tool is the single source of truth for what `initial_data` can carry — every sheet type has its own optional fields under a single `initial_data` object so the agent fills in only what's relevant.

### Frontend service — [`src/services/moodboardSheetsService.ts`](../src/services/moodboardSheetsService.ts)

CRUD wrapper for the Supabase JS client + edge-function invoker. Exports types (`PresentationSheet`, `SheetType`, `SheetStatus`), constants (`SHEET_TYPE_LABELS`, `SHEET_TYPE_CREDITS`), and methods:

- `list(moodboardId)` — by-moodboard, newest first.
- `get(sheetId)` — single row.
- `create({moodboard_id, sheet_type, title, data?})` — direct insert (NOT used by the agent flow; reserved for future programmatic creation).
- `update(sheetId, {title?, data?, status?})` — used by canvas widgets to persist annotations before rendering.
- `remove(sheetId)` — hard delete.
- `refreshPdfUrl(sheetId)` — issues a fresh 1h signed URL for the existing storage path.
- `generatePdf(sheetId)` — calls the edge function. Used by canvas widgets and `MoodboardSheetsTab` re-render.

### Frontend canvas widgets — [`src/components/features/sheets/`](../src/components/features/sheets/)

#### `AnnotationLayer.tsx`

Shared backdrop component. Mounts an `<img>` filling its container with `object-contain`, captures pointer events, converts client coordinates to normalized [0..1], and exposes those via render-prop callbacks (`onPointerDownPoint`, `onPointerMovePoint`, `onPointerUpPoint`). Forward-refs an imperative handle (`toNormalized`, `fromNormalized`) for callers that need to project saved coordinates back to pixel space (e.g., to draw existing markers).

**Why normalized coords:** the same data must round-trip to the PDF builder, which computes its own pixel positions inside an A3 page. Storing pixel coords would couple the data to the canvas size at the moment of capture.

#### `CalloutCanvas.tsx` — for `annotated_render`

Each annotation has TWO points: an anchor (red dot on the image) and a label endpoint (white label box where the leader line terminates). Both draggable. User clicks empty space on the image to add a new annotation (anchor at click, endpoint offset slightly up-right, blank label). Side list shows all annotations with editable labels and delete buttons. "Render PDF" persists `{backdrop_image_url, annotations}` and triggers the edge function.

#### `DimensionCanvas.tsx` — for `elevation_render_pair`

Two modes:
- **Dimension** — two-click placement (first click = start, second = end), then a `prompt()` for the value. Default unit selectable (mm/cm/m/in).
- **Tile callout** — single click + label `prompt()` for things like "Porcelain 600×1200 mm".

Both render as SVG overlays on top of `AnnotationLayer`. Dimensions show the value+unit at the midpoint with a white stroke for legibility on busy elevations. The render image (bottom half of the PDF) is uploaded separately and not annotated.

#### `FixtureSymbolCanvas.tsx` — for `lighting_plan`, `plumbing_plan`, `electrical_plan`

One widget, three palettes, injected via the `fixtureDefs` prop (`LIGHTING_` / `PLUMBING_` / `ELECTRICAL_FIXTURE_DEFS`). Each palette's types must stay in sync with its PDF drawer (`drawFixtureSymbol` / `drawPlumbingSymbol` / `drawElectricalSymbol`) — guarded by [tests/unit/sheetTypeCoverage.test.ts](../tests/unit/sheetTypeCoverage.test.ts), because a drifted type renders as a default circle in the PDF and is visible only by opening the file.

**Two modes, because a click cannot mean two things.**
- **Place** — pick a type, click the backdrop to drop a symbol; drag to move.
- **Select** — click a symbol to open its properties: a label, and the catalog **product** it represents. A linked symbol shows a green dot, so "which of these 40 sockets still needs a product?" doesn't mean clicking every one.

**Symbols carry a stable `id`** (`newSymbolId()`, backfilled on load by `ensureSymbolIds()`). They used to be addressed by array index, which breaks as soon as one is deleted — and connectivity (runs / circuits) has to reference *which* symbols it joins.

**`product_id` produces the SCHEDULE.** `buildSymbolPlan` counts symbols per linked product and renders a quantity take-off under the legend, plus an explicit "N symbols not linked to a product" line — a truncated or partial schedule must never read as a complete one. Chips are resolved through the caller's workspace-scoped `fetchProductChips`, so a stray `product_id` cannot pull in another tenant's catalog row.

Backdrop has two modes:
- `kind: 'upload'` — uploaded floor plan image via `AnnotationLayer`.
- `kind: 'rect'` — plain rectangle drawn from typed `width_mm/height_mm`. Same pointer math, no image.

**Scale is not part of the sheet.** A backdrop is a raster with no inherent scale, and an AI-generated plan's printed dimension callouts are decorative. Measurable geometry lives on the *room* (`project_rooms.plan_geometry`, calibrated by [PlanCalibrationCanvas](../src/components/features/plans/PlanCalibrationCanvas.tsx)) — see [planGeometry.ts](../src/utils/planGeometry.ts).

#### `SheetCanvasCard.tsx` — chat dispatcher

Receives `{sheet_id, sheet_type, moodboard_id, initial_data, title}` from the `sheet_canvas_open` chunk. Mounts the appropriate canvas widget. When the canvas calls `onPdfReady(url)`, the card swaps to `SheetPreviewCard` in place.

#### `SheetPreviewCard.tsx` — chat preview

Iframe-embedded PDF preview at 4:3, plus Download / Open in new tab / Edit buttons. Used both inline in chat (after `sheet_pdf_ready`) and after the canvas finishes rendering.

### Frontend chat surface — [`src/components/features/ai/AgentHub.tsx`](../src/components/features/ai/AgentHub.tsx)

Three new chunk handlers in the streaming pipeline:
- `sheet_created` — logger only (debit ack).
- `sheet_canvas_open` — creates an assistant message with `sheetCanvasData`. Persisted to chat history.
- `sheet_pdf_ready` — creates an assistant message with `sheetPdfData`. Persisted to chat history. Marks `finalResult`.

The render branches in the message switch (around line 2526) check `message.sheetCanvasData` and `message.sheetPdfData` and mount `SheetCanvasCard` / `SheetPreviewCard` accordingly. The `max-width` flag in the bubble container is OR'd with these data fields so the card gets full width.

### Moodboard tab — [`src/components/business/moodboard/MoodboardSheetsTab.tsx`](../src/components/business/moodboard/MoodboardSheetsTab.tsx)

- Lists sheets for the moodboard with status badges (`draft / generating / ready / failed`), page count, credit count, last-updated date, and (if `failed`) the error message.
- "+ New Sheet" dropdown grouped: **Boards** (material_board, color_palette, concept_board), **Plans** (lighting_plan, annotated_render, elevation_render_pair), **Schedules** (ffe_schedule), **Decks** (full_deck). Each item shows label, credit cost, and a one-line description.
- Picking a type calls `navigate('/agent-hub?agent=kai&q=<seeded prompt>')` so the JARVIS agent picks up the request.
- Per-sheet actions: **Open** (signed-URL refresh + opens PDF), **Edit** (re-routes to JARVIS to continue), **Delete** (hard delete with confirm).

### Moodboard page — [`src/components/business/moodboard/MoodBoardDetailPage.tsx`](../src/components/business/moodboard/MoodBoardDetailPage.tsx)

Existing page wrapped in `Tabs` with two tabs:
- **Items** — the existing products/media grid.
- **Sheets** — mounts `MoodboardSheetsTab`.

---

## How to use it (operator/dev)

### As a designer (end user)

1. Open any moodboard at `/moodboard/:id`.
2. Click the **Sheets** tab.
3. Click **+ New Sheet** and pick a type from the dropdown.
4. The JARVIS agent opens with a context-rich prompt; answer its questions.
5. For passive sheets, the PDF appears in the chat within seconds.
6. For interactive sheets (lighting / annotated / elevation), the canvas widget opens — finish the inputs there, click **Render PDF**.
7. The sheet is saved to the moodboard's Sheets tab; come back any time to open or edit.

### As a developer (programmatic)

You can create sheets without the agent by calling `moodboardSheetsService.create()` directly, then `generatePdf()` to render. Useful for batch flows or automated tests.

```ts
import { moodboardSheetsService } from '@/services/moodboardSheetsService';

// Passive sheet — straight to PDF
const sheet = await moodboardSheetsService.create({
  moodboard_id,
  sheet_type: 'material_board',
  title: 'Bathroom Materials',
  data: { product_ids: ['uuid-1', 'uuid-2', 'uuid-3'] },
});
const result = await moodboardSheetsService.generatePdf(sheet.id);
console.log(result.pdf_url);

// Interactive sheet — initial_data is a starting point; user finishes in canvas
const sheet2 = await moodboardSheetsService.create({
  moodboard_id,
  sheet_type: 'annotated_render',
  title: 'Living Room — Annotated',
  data: { backdrop_image_url: 'https://...', annotations: [] },
});
// Mount <SheetCanvasCard /> with sheet2.id and let the user edit, then call generatePdf()
```

**Note**: programmatic `create` does NOT debit credits — only the agent tool does. If you need cost attribution for programmatic flows, call `debit_user_credits` yourself before insert.

### As an admin (debugging)

Inspect rows in the table:
```sql
SELECT id, moodboard_id, sheet_type, status, credits_used, page_count, error_message,
       updated_at - created_at AS time_to_complete
FROM moodboard_presentation_sheets
ORDER BY created_at DESC
LIMIT 20;
```

Per-feature credit usage:
```sql
SELECT operation_type, COUNT(*), SUM(credits_debited)
FROM ai_usage_logs
WHERE operation_type LIKE 'presentation_sheet_%'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY operation_type;
```

Stuck `generating` rows (>10 minutes old):
```sql
SELECT id, sheet_type, error_message, updated_at
FROM moodboard_presentation_sheets
WHERE status = 'generating'
  AND updated_at < NOW() - INTERVAL '10 minutes';
```
Manually fail them and let the user retry:
```sql
UPDATE moodboard_presentation_sheets
SET status = 'failed', error_message = 'Stuck in generating; manually marked failed'
WHERE status = 'generating' AND updated_at < NOW() - INTERVAL '10 minutes';
```

---

## Deployment

After pulling the branch on a fresh environment:

1. **Apply DB migrations.** Either:
   - Via Supabase MCP: `mcp__supabase__apply_migration` for each of the two `20260502_*.sql` files.
   - Via Supabase dashboard SQL editor: paste the contents of each file in order (table first, prompt addendum second). The addendum is idempotent (marker check).
   - Via `supabase db push` if you use the CLI for migrations.

2. **Deploy the edge functions:**
   ```bash
   supabase functions deploy generate-moodboard-sheet-pdf moodboard-sheet-share
   ```
   (`generate-moodboard-sheet-pdf` now also renders `area_breakdown` + Client View decks; `moodboard-sheet-share` resolves both single-sheet and Client View tokens.)

3. **Redeploy `agent-chat`** so it picks up the new tool import (incl. the `area_breakdown` sheet option):
   ```bash
   supabase functions deploy agent-chat
   ```

4. **Frontend** ships with the next regular build (`npm run build` + your usual deploy pipeline). No env-var changes required — the function uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` which are already set on Supabase.

---

## Project Client Views

**Added 2026-06-01.** A **Client View** is a project-level deliverable one rung above `full_deck`: it bundles selected presentation sheets from **any** of a project's moodboards into one client-ready **PDF + revocable online page** (`/cv/:token`). `full_deck` stays the lightweight single-moodboard PDF sheet; a Client View selects sheets project-wide and adds an interactive HTML surface (3D walkthrough, lighting moods, live FF&E, inline approve/comment). Zero overlap — sheets are content blocks, the moodboard is the working surface, the Client View is the deliverable.

Deliberately mirrors the quote PDF/share pattern and is **folded into the existing sheet functions** (no standalone client-view functions):

- **PDF** — `generate-moodboard-sheet-pdf` with `{ client_view_id }` (instead of `{ sheet_id }`) renders the project-scoped deck via the same `buildFullDeckCover` + `buildSheetForDeck` builders → `pdf-documents/client-view-output/{project_id}/cv-{id}.pdf`. Stores `pdf_storage_path` (re-signs on read; never a stale URL).
- **HTML/share** — `moodboard-sheet-share` resolves BOTH a single-sheet `share_token` (→ `{sheet}`) and a Client View `public_share_token` (→ `{client_view}`), and accepts a `feedback` body for inline approve/comment. Public route `/cv/:token` ([PublicClientViewPage.tsx](../src/pages/PublicClientViewPage.tsx)) embeds the deck PDF + live Marble 3D walkthrough (`vr_worlds`), CSS lighting moods over the hero render, live FF&E table from a linked quote, and inline approve/comment → `client_view_feedback`.

**Tables** (apply via `mcp__supabase__apply_migration`):
- `project_client_views` — `sheet_ids uuid[]` (ordered, cross-moodboard), `cover jsonb`, embed toggles (`embed_vr`/`embed_lighting`/`embed_ffe`/`feedback_enabled`), `vr_world_id`/`quote_id`, quote-style PDF columns (`pdf_storage_path`, `pdf_generation_status`, `pdf_generated_at`, `page_count`), and share columns (`public_share_token` unique, `public_share_enabled`, `share_expires_at`, `share_view_count`).
- `client_view_feedback` — inline approvals/comments (`kind ∈ {comment, approval, change_request}`, `status ∈ {approved, changes_requested}|null`, `body`, `author_name`, `session_id`). Service-role writes via the share fn; owner reads.
- **Cleanup** mirrors quotes: `_cleanup_client_view_pdf_storage()` AFTER DELETE trigger + `build_storage_reference_set()` extended with `project_client_views.pdf_storage_path` (orphan cron never reaps a live deliverable). `increment_client_view_count(uuid)` bumps the counter.

**Frontend**: [clientViewsService.ts](../src/services/clientViewsService.ts) (list/get/create/update/remove/generatePdf/refreshPdfUrl/share/revokeShare/listFeedback/listVrWorlds) + a **Client View tab** on the project detail page ([ClientViewTab.tsx](../src/modules/projects/components/tabs/ClientViewTab.tsx), owner-only — pick + order sheets, toggle embeds, choose FF&E quote + 3D world, generate PDF, copy/disable share link, read feedback inline).

---

## Extending the feature

### Add a new sheet type

1. Add to the enum in `moodboard_sheet_type` (write a new migration; never edit an existing one in place).
2. Add a builder function in `supabase/functions/generate-moodboard-sheet-pdf/builders.ts`.
3. Add a `case` in `index.ts`'s `switch` and in `buildSheetForDeck` (so it works inside Full Decks).
4. Extend the zod schema in `presentation-sheet-tool.ts` with the new type and any new `initial_data` fields.
5. Add to `SHEET_TYPE_CREDITS`, `SHEET_TYPE_LABELS` (frontend) and `SHEET_GROUPS` in `MoodboardSheetsTab.tsx`.
6. If interactive, add a new canvas widget under `src/components/features/sheets/` and dispatch in `SheetCanvasCard.tsx`.
7. Update the prompt addendum (write a new addendum migration with a new marker) so JARVIS knows when to use it.

### Plug in AI region detection for `annotated_render`

The schema already supports `annotations[].source: 'ai' | 'auto' | 'manual'`. Add a Vision pre-pass:
- In the agent's tool call for `annotated_render`, before invoking `generate_presentation_sheet`, the agent calls a Claude Vision endpoint with the backdrop image and the moodboard product list.
- Vision returns regions matching catalog products; each becomes an `annotation` with `source: 'ai'` (matched product) or `source: 'auto'` if confidence is low (generic label).
- Pass them as `initial_data.annotations` so the canvas opens pre-populated. User refines.

This is a tool-side change only — no schema or PDF changes needed.

### Plug in auto color extraction for `color_palette`

`document_images` already has the `image_color_embeddings` collection with `has_color_slig` boolean flag (1024D Voyage of `VisionAnalysis.colors[]`). Centroid clustering on Voyage embeddings of color-name strings is well-defined and clusters meaningfully by color. Add a service that:
- Takes a list of `document_image_id`s from the moodboard.
- Queries the SLIG color collection for centroid-cluster colors.
- Returns top-K hex codes with auto-named labels (Claude Haiku, given the cluster RGB).

Wire it into the agent flow so for `color_palette` the agent runs this service first and fills `initial_data.swatches`.

### Add custom branding (logos, contact info)

`drawTitleBlock` in `layout.ts` is the only place to touch. Add an optional `branding: {logo_bytes, company_name, company_email, company_phone}` field to `TitleBlockData` and embed in a 5th cell or as a header strip. Pull from `user_profiles` or a new `studios` table during `index.ts` setup.

---

## Troubleshooting

**Sheet stuck in `generating` indefinitely.**
The edge function timed out or crashed before the status update. Check logs in Supabase functions dashboard. The auto-recovery cron does NOT touch this table (only `background_jobs`); manual cleanup is required for now.

**"Insufficient credits" on a 0-credit sheet.**
Should not happen — the tool short-circuits the debit when `creditCost <= 0`. If you see this, check that `SHEET_CREDITS` in `presentation-sheet-tool.ts` matches the table at the top of this doc.

**PDF renders but the canvas annotations don't appear.**
Coordinates probably aren't normalized [0..1]. Check that the canvas widget converts client coords via `AnnotationLayer.toNormalized` (or its own equivalent for `kind: 'rect'` lighting plans), not raw pixel offsets.

**Agent calls the tool with the wrong sheet type.**
The JARVIS prompt addendum needs to be applied. Run the second migration. Check the prompts table:
```sql
SELECT system_prompt FROM prompts
WHERE prompt_type = 'agent' AND category = 'kai' AND is_active = true;
```
Look for the `--END_PRESENTATION_SHEETS_ADDENDUM--` marker. If missing, the migration didn't run.

**Canvas widget shows "No PDF available" after Render.**
The edge function returned an error. The canvas catches it and shows it inline. Check the sheet row:
```sql
SELECT status, error_message FROM moodboard_presentation_sheets WHERE id = '<sheet_id>';
```

**Storage signed URL is expired (after 7 days).**
Call `moodboardSheetsService.refreshPdfUrl(sheetId)` to re-sign. The Sheets tab does this automatically on click; in custom code you need to do it yourself.

**Full Deck cover image doesn't show.**
Cover image is rendered at 45% opacity in `buildFullDeckCover`. If the URL 404s, no error — the PDF just renders without the image. Check `data.cover.cover_image_url` is reachable from the edge function (Supabase storage with a 7-day signed URL works; expired URLs do not).
