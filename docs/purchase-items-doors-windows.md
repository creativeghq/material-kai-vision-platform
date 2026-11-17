# Project Purchase Items (Doors / Windows)

Per-project line items for **made-to-order purchases** — primarily doors and windows — with a structured spec payload and a PDF generator that renders both a combined purchase **schedule** and per-item **specification sheets** (with door-swing / window glyph drawings).

> **Status (2026-06-28):** **fully wired end-to-end.** Backend (table + `generate-purchase-sheet-pdf`) + a **Purchases tab** on the project detail page (CRUD measurements, link-a-catalog-product or generate an image, generate the sheet) + **KAI / interior-designer agent tools** (`add_purchase_item`, `generate_purchase_sheet`) + **AI product-shot generation** (`product-shot` mode of `generate-interior-gemini`) for items not linked to a catalog product. The PDF `schedule` is now an **architectural elevation schedule** ("Schedule of Doors / Windows") — dimensioned CAD elevation line-drawings in a grid — not a plain table. The migration name `project_purchase_items_quote_not_po` records the design decision: a purchase item references a **quote**, not a formal purchase order.

---

## Data model — `project_purchase_items`

One row per purchasable item on a project.

- Identity: `id`, `project_id` (FK → `projects`), `workspace_id`, `sort_order`.
- Type & naming: `item_type` (`'door' | 'window' | …`), `name`, `category`.
- Quantity / cost: `quantity`, `unit_cost`, `currency`.
- Lifecycle: `status` (not enum-constrained at the DB level).
- Links: `room_id` (FK → `project_rooms`), `quote_id` (FK → `quotes`), `supplier_company_id`.
- Design image: `design_image_url`, `design_image_path` (manually attached — see [Image source](#image-source)).
- `details` (jsonb) — the structured spec. Door keys include `width_mm`, `height_mm`, `thickness_mm`, `finish`, `opening` (`inward`/`outward`), `handing` (`left`/`right`), `hinge_side`, `frame`, `hardware`. Window keys include `width_mm`, `height_mm`, `frame_type`, `glazing`, `opening_type` (`tilt-turn`/`casement`/`sliding`), `finish`.
- `notes`, `created_by`, `created_at`, `updated_at`.

## Edge function — `generate-purchase-sheet-pdf`

POST. Auth: `Authorization: Bearer <token>`. Items are read under the **caller's RLS** by `project_id` (optionally narrowed by `item_ids`); passing inline `items` requires the **service-role** key.

**Body**

| Field | Notes |
|---|---|
| `project_id` | Required unless inline `items` are supplied. |
| `item_ids` | Optional subset of the project's purchase items. |
| `items` | Inline items (service-role only). |
| `project_name` | Overrides the rendered project name. |
| `mode` | `'schedule' \| 'per_item' \| 'both'` (default `'both'`). |

**Modes**
- `schedule` — A3 **landscape architectural elevation schedule** ("SCHEDULE OF DOORS" / "SCHEDULE OF WINDOWS"): a grid of **dimensioned CAD elevation line-drawings** (deterministic vector, no AI), grouped by type, ≤6 cells per strip. Each cell = the elevation (width + height dimension strings, on a **FINISH FLOOR LINE**) + a caption block: **tag** (`D-1`/`W-1`), `{qty} SET; {ROOM}`, **type name**, **material**, **glass**.
  - **door** elevations: casing + leaf, leaf interior per inferred style — `flush` / `panel` (N panels) / `louvre` (slats) / `glazed` (glass area) — from `details.leaf_style` or keywords in name/finish/frame; a **dashed swing triangle** with apex at the hinge jamb (from `details.handing` + `details.opening`).
  - **window** elevations: mullion grid (cols×rows from `details.grid_cols`/`grid_rows`, else inferred from dimensions) + an **opening glyph** per `details.opening_type` (casement / tilt-turn / sliding / fixed).
  - true-to-scale: each elevation is sized by its real `width_mm`:`height_mm` ratio, so the strip reads like a real schedule.
- `per_item` — A4 **portrait**, one page per item: title block, the `design_image_url` (catalog photo or generated product-shot, or a placeholder) on the left, spec rows on the right, a finish/frame/hardware swatch strip, a sequential `PUR-NNN` number, and the door-swing / window glyph drawing.
- `both` — the elevation schedule page(s) first, then the per-item pages.

**Output** — uploads to `pdf-documents/project-purchase/{project_id}/purchase-{ts}.pdf` (private bucket) and returns `{ success, pdf_url (7-day signed), pdf_storage_path, page_count, item_count, mode }`.

## Finance integration

Purchase items are **quote-referenced, not converted to purchase orders** (hence `quote_not_po`). `project_purchase_items.quote_id` links an item to the quote that priced it, so a project's purchase specifications live alongside its accepted quotes rather than spawning a separate PO document. Project-level finance rollups are surfaced by the `get_project_finance_summary(p_project_id)` RPC (`projectsService.getProjectFinanceSummary`). Formal purchase orders are a separate concern, handled via `orders` with `order_type='purchase'` (see #237 — the legacy `purchase_orders`/`purchase_order_items` tables were retired 2026-06-28).

## Image source — three paths

`design_image_url` is what the per-item spec page embeds. It is set one of three ways, in priority:
1. **Linked catalog product** → the product's real photo (resolved via `image_product_associations` → `document_images.image_url`; `projectsService.getProductPrimaryImageUrl`).
2. **AI product-shot** (item NOT from catalog) → `projectsService.generatePurchaseItemImage(itemId)` calls the **`product-shot`** mode of [`generate-interior-gemini`](../supabase/functions/generate-interior-gemini/index.ts), which renders a single isolated door/window on seamless white **from the spec** (bypasses the room-scene narrative builder; door = portrait, window = landscape) and persists the URL onto the item. Costs image-generation credits.
3. **None** → the spec page shows "design not generated yet"; the elevation schedule still draws the deterministic CAD elevation + swing/glyph regardless of any photo.

## Where it's driven

- **UI**: the **Purchases tab** on the project detail page ([ProjectDetailPage.tsx](../src/modules/projects/pages/ProjectDetailPage.tsx) → [PurchaseItemsTab.tsx](../src/modules/projects/components/tabs/PurchaseItemsTab.tsx)) — owner-only. CRUD doors/windows with the measurement spec, link a catalog product or generate the image (✨), and "Generate sheet" (elevation schedule / spec sheets / both).
- **Agent**: `add_purchase_item` + `generate_purchase_sheet` on the `kai` + `interior-designer` agents (in [_shared/tools/project-tools.ts](../supabase/functions/_shared/tools/project-tools.ts)).

## Files

- Edge functions: [generate-purchase-sheet-pdf](../supabase/functions/generate-purchase-sheet-pdf/index.ts) (PDF), [generate-interior-gemini](../supabase/functions/generate-interior-gemini/index.ts) (`product-shot` image mode)
- Agent tools: [_shared/tools/project-tools.ts](../supabase/functions/_shared/tools/project-tools.ts)
- Frontend: [PurchaseItemsTab.tsx](../src/modules/projects/components/tabs/PurchaseItemsTab.tsx), service methods in [projectsService.ts](../src/modules/projects/services/projectsService.ts)
- Table + RPC types: `src/integrations/supabase/types.ts` (`project_purchase_items`, `get_project_finance_summary`)

The table and edge functions are deployed via MCP migrations / `supabase functions deploy`.
