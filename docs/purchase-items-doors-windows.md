# Project Purchase Items (Doors / Windows)

Per-project line items for **made-to-order purchases** — primarily doors and windows — with a structured spec payload and a PDF generator that renders both a combined purchase **schedule** and per-item **specification sheets** (with door-swing / window glyph drawings).

> **Status (2026-06-12):** backend complete (table + `generate-purchase-sheet-pdf` edge function); **frontend UI and a KAI agent tool are not yet wired** (see [Pending](#pending)). The migration name `project_purchase_items_quote_not_po` records the design decision: a purchase item references a **quote**, not a formal purchase order.

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
- `schedule` — A4 **landscape** combined table (`# / TYPE / ITEM / ROOM / KEY SPEC / QTY / UNIT / TOTAL`), zebra-striped, grand-total row.
- `per_item` — A4 **portrait**, one page per item: title block ("PRODUCT PURCHASE SPECIFICATION" + `item_type` + project), the `design_image_url` (or placeholder) on the left, spec rows on the right, a finish/frame/hardware swatch strip, a sequential `PUR-NNN` drawing number, and a **drawing**:
  - **door** → swing symbol (wall stubs + leaf + quarter-circle arc) labelled from `details.handing` + `details.opening`.
  - **window** → glyph whose internal lines follow `details.opening_type`.
- `both` — schedule page(s) first, then the per-item pages.

**Output** — uploads to `pdf-documents/project-purchase/{project_id}/purchase-{ts}.pdf` (private bucket) and returns `{ success, pdf_url (7-day signed), pdf_storage_path, page_count, item_count, mode }`.

## Finance integration

Purchase items are **quote-referenced, not converted to purchase orders** (hence `quote_not_po`). `project_purchase_items.quote_id` links an item to the quote that priced it, so a project's purchase specifications live alongside its accepted quotes rather than spawning a separate PO document. Project-level finance rollups are surfaced by the `get_project_finance_summary(p_project_id)` RPC (`projectsService.getProjectFinanceSummary`). The unrelated `purchase_order_items` table (formal POs) is a separate concern.

## Image source

`design_image_url` is **manually attached** to an item; there is no automatic link from the interior-render pipeline. `generate-purchase-sheet-pdf` only **reads** the image to embed it — it does not author one. A render produced by `generate-interior-gemini` can be saved onto an item, but nothing wires that automatically today.

## Pending

To make the feature usable end-to-end, the remaining work is purely frontend/agent:
- A **Purchase Items tab** on the project detail page ([ProjectDetailPage.tsx](../src/modules/projects/pages/ProjectDetailPage.tsx)) to CRUD items and trigger the PDF.
- A **service method** to invoke `generate-purchase-sheet-pdf` and download the result.
- (Optional) a KAI tool (e.g. `_shared/tools/purchase-tools.ts`) for `create_purchase_item` / `list_purchase_items` / `generate_purchase_sheet` — none exists yet.

## Files

- Edge function: [supabase/functions/generate-purchase-sheet-pdf/index.ts](../supabase/functions/generate-purchase-sheet-pdf/index.ts)
- Table + RPC types: `src/integrations/supabase/types.ts` (`project_purchase_items`, `get_project_finance_summary`)
- Project service: [src/modules/projects/services/projectsService.ts](../src/modules/projects/services/projectsService.ts)

The table and edge function are deployed via MCP migrations / `supabase functions deploy generate-purchase-sheet-pdf`.
