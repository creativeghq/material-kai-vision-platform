# Presentation Catalogs

Admin-only catalog builder. Upload manufacturer source PDFs, extract sections + images via Claude Vision, build editable web catalogs with email-gated public landing pages, export as PDF.

Shipped 2026-05-08.

---

## Table of contents

1. [What it is](#what-it-is)
2. [Architecture overview](#architecture-overview)
3. [Agent tools (admin-only)](#agent-tools-admin-only)
4. [Database schema](#database-schema)
5. [Storage buckets](#storage-buckets)
6. [Edge functions](#edge-functions)
7. [MIVAA endpoint — PDF page rasterization](#mivaa-endpoint--pdf-page-rasterization)
8. [Workflow: building a catalog](#workflow-building-a-catalog)
9. [Workflow: publishing + email-gate](#workflow-publishing--email-gate)
10. [Operations / observability](#operations--observability)
11. [Cost model](#cost-model)
12. [Permissions / RLS](#permissions--rls)
13. [Activation / deploy](#activation--deploy)
14. [File-by-file reference](#file-by-file-reference)
15. [Known limitations](#known-limitations)

---

## What it is

Two interlocking flows behind one entity (`presentation_catalogs`):

- **Admin flow** — JARVIS agent + admin UI work together to build a catalog from manufacturer PDFs. The admin uploads source PDFs, then asks the agent to extract sections (free-form Vision query) or translate the whole PDF. Materials can also be added manually with prices pulled from the catalog / price-monitoring / market-check / manual entry. Every material can have an image lifted from the source PDF (auto-rasterized via PyMuPDF on MIVAA), pulled from our DB (visual search), or fetched from the web (DataForSEO Images) and approved inline in chat.
- **Public flow** — published catalogs render as a web page at `/c/:slug` behind an email-gate. Visitor enters email → matched against `auth.users` + `crm_contacts` + `crm_companies` + a per-catalog `catalog_email_grants` allowlist → signed cookie issued → page rendered. Same JSONB body that drives the PDF also drives the web page, so updates to the catalog show up live without regenerating anything.

Module slug: `presentation-catalogs`. Disabled by toggling the row in `public.modules`.

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Admin (browser)                              │
│  /admin/catalogs                                                          │
│   ├── List + create + open builder                                        │
│   ├── /admin/catalogs/sources         — upload manufacturer PDFs          │
│   └── /admin/catalogs/:id             — body editor + email grants + log  │
│                                                                           │
│  /agent-hub  (KAI)  — drives the building via 8 admin-only tools          │
│  /admin/operations?tab=catalogs       — cross-catalog views/downloads     │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │       supabase/functions/agent-chat/index.ts                │
        │  - Lazy-imports _shared/tools/catalog-tools.ts              │
        │  - Admin-only gate (userRole ∈ {admin, owner})              │
        │  - Streams catalog_* chunks back to AgentHub                │
        └────────────────────────────────────────────────────────────┘
                       │
        ┌──────────────┼─────────────────────────────────────────────┐
        │ 8 LangChain tools (admin only):                             │
        │   create_catalog            attach_catalog_pdfs             │
        │   extract_from_catalog_pdfs translate_pdf_to_catalog        │
        │   add_material_to_catalog   find_image_for_material         │
        │   generate_catalog_pdf      publish_catalog                 │
        └──────────────┬─────────────────────────────────────────────┘
                       │
        ┌──────────────┴────────────────────────────────────────────┐
        ▼                              ▼                            ▼
┌────────────────────┐  ┌─────────────────────────┐  ┌────────────────────────┐
│ catalog-extract-   │  │ catalog-translate-pdf   │  │ catalog-image-search   │
│ from-pdfs          │  │ (Sonnet 5 PDF Vision  │  │ (DB visual_search →    │
│ (Sonnet 5 PDF    │  │  whole-catalog pass +   │  │  DataForSEO Images)    │
│  Vision per query  │  │  bbox per material)     │  │                        │
│  + bbox per        │  │  Auto-rasterize → MIVAA │  │                        │
│  candidate)        │  │                         │  │                        │
│ Auto-rasterize →   │  │                         │  │                        │
│ MIVAA              │  │                         │  │                        │
└─────────┬──────────┘  └────────┬────────────────┘  └────────────────────────┘
          │                       │
          └───────┬───────────────┘
                  ▼
        ┌──────────────────────────────┐         ┌──────────────────────────┐
        │ catalog-render-pdf-page      │ ──────► │ MIVAA                    │
        │ (proxy edge function,        │ POST    │ POST /api/internal/      │
        │  x-cron-secret)              │         │ catalog/rasterize-pdf-page│
        └──────────────────────────────┘         │  (PyMuPDF + Pillow)       │
                                                 │  Crops bbox, returns PNG  │
                                                 │  → catalog-extracted-     │
                                                 │    images bucket          │
                                                 └──────────────────────────┘

  generate-catalog-pdf — A4 cover + body sections + back cover via pdf-lib.
                          Materials reuse image_url (could be PDF crop or DB or web).

  catalog-access      — public email-gate. 5 actions:
                         public_meta / request / verify / track_view / track_download
                         Atomic counters via SQL RPCs.
```

---

## Agent tools (admin-only)

Loaded in [supabase/functions/agent-chat/index.ts](../supabase/functions/agent-chat/index.ts) only when `userRole ∈ {admin, owner}`. All 8 tools are gated by the `presentation-catalogs` module slug. Tool source: [_shared/tools/catalog-tools.ts](../supabase/functions/_shared/tools/catalog-tools.ts).

| Tool | Purpose | Key inputs | Emits chunk |
|---|---|---|---|
| `create_catalog` | Initialize a new catalog row. Always step 1. | `title`, `subtitle?`, `description?`, `template_id?`, `cover_client_name?` | `catalog_created` |
| `attach_catalog_pdfs` | Link uploaded source PDFs (rows in `catalog_source_pdfs`) to a catalog. | `catalog_id`, `source_pdf_ids[]` | `catalog_pdfs_attached` |
| `extract_from_catalog_pdfs` | Free-form Vision query over attached PDFs. Returns candidate materials with bbox-cropped images. | `catalog_id`, `query` (e.g. "white porcelain tiles"), `max_results?`, `auto_add?` | `catalog_extraction_candidates` |
| `translate_pdf_to_catalog` | Whole-PDF → catalog body in one Vision pass. `preserve_original_layout` mirrors page-by-page; default restructures by category. | `source_pdf_id`, `target_catalog_id?`, `new_catalog_title?`, `preserve_original_layout?` | `catalog_translation_ready` |
| `add_material_to_catalog` | Add a single material to a section. Resolves price + image from `catalog_product` / `price_monitoring` / `market_check` / `manual` (or `uploaded` / `web_search_approved` / `extracted_from_pdf` for image). | `catalog_id`, `section_title`, `material{...}` | `catalog_material_added` |
| `find_image_for_material` | Search platform DB first (`material_search`), then fall back to web (DataForSEO Images). Admin clicks ✓ in the inline approval card. | `catalog_id`, `material_id?`, `material_name`, `search_db_first?`, `max_candidates?` | `catalog_image_candidates` |
| `generate_catalog_pdf` | Render the body as A4 PDF (cover + body + back cover) using the catalog's template. | `catalog_id`, `regenerate?` | `catalog_pdf_ready` |
| `publish_catalog` | Mint a slug + flip status to `published`. Returns the public URL. `unpublish:true` flips back to `archived`. | `catalog_id`, `desired_slug?`, `unpublish?` | `catalog_published` / `catalog_unpublished` |

Tool entries also live in [src/components/features/ai/agentToolsCatalog.ts](../src/components/features/ai/agentToolsCatalog.ts) so the PromptBuilderModal + ToolkitPickerModal can browse them.

The JARVIS prompt got an addendum (idempotent migration `20260508_kai_prompt_catalogs_addendum.sql`) explaining the order of tool calls and policy: never invent product names, prices, or images.

### Inline approval cards in AgentHub

- **`CatalogExtractionCandidatesCard`** ([src](../src/components/features/ai/CatalogExtractionCandidatesCard.tsx)) — checkbox grid with rasterized thumbnails, per-row preview lightbox, editable section title input, single "Add to catalog" button calling `catalogsService.approveExtractionCandidates`. Renders for `catalog_extraction_candidates` chunks.
- **`CatalogImageCandidatesCard`** ([src](../src/components/features/ai/CatalogImageCandidatesCard.tsx)) — DB vs Web source badges, click-to-select with optimistic check overlay, calls `catalogsService.setMaterialImage` directly. Renders for `catalog_image_candidates` chunks.

Both cards are wired into [AgentHub.tsx](../src/components/features/ai/AgentHub.tsx) via the standard `message.catalog*Data` branches.

---

## Database schema

Migration: `../supabase/migrations/20260508_presentation_catalogs_module.sql` + view-events extension `../supabase/migrations/20260508_catalog_view_events.sql`.

### Tables

| Table | Cardinality | Purpose |
|---|---|---|
| `presentation_catalogs` | one per catalog | Title + JSONB cover/body/back + status + slug + denormalized counters (`view_count`, `unique_email_count`). Source-of-truth row. |
| `catalog_source_pdfs` | one per uploaded PDF | Owned by an admin user. Stores `storage_path` in `pdf-documents` (under the `catalog-source/` prefix). Manufacturer name + URL + notes for provenance. Status: `uploaded` / `processing` / `ready` / `failed`. |
| `catalog_templates` | one per visual template | Cover image path, content background path, back-cover image path, accent color hex. One `is_default=true` row at a time. |
| `catalog_email_grants` | one per (catalog, email) | Admin-managed allowlist. Visitors with these emails get access in addition to platform-user / CRM auto-match. Supports `expires_at` and `revoked_at`. |
| `catalog_access_log` | one per email-gate submit | Forensic record of every gate attempt — email + matched_kind enum + matched_user_id + matched_crm_contact_id + matched_crm_company_id + matched_grant_id + ip_address + cookie_token + cookie_expires_at. |
| `catalog_view_events` | one per page_view / pdf_download | Granular event log per visitor session (after gate granted). FK back to `catalog_access_log` for forensic correlation. Powers the operations dashboard. |

### Enums

- `presentation_catalog_status` — `draft | generating | ready | published | archived | failed`
- `catalog_source_pdf_status` — `uploaded | processing | ready | failed`
- `catalog_access_match_kind` — `platform_user | crm_contact | crm_company | email_grant | denied`
- `catalog_view_event_type` — `page_view | pdf_download | pdf_view`

### RPCs

| Function | Use |
|---|---|
| `is_admin_user()` | RLS helper. Returns `true` when `auth.uid()` is in `user_profiles` with `role.name = 'admin'`. SECURITY DEFINER. |
| `catalog_increment_view_count(uuid)` | Atomic UPDATE … RETURNING for the `view_count` column. Avoids the read/write race the previous "select then update" had. |
| `catalog_bump_unique_email_count(uuid, text)` | Conditional bump: only increments `unique_email_count` if this is the first granted-access row for the (catalog, email) pair. Same round-trip as the COUNT lookup. |

### View

`catalog_operations_summary` — per-catalog rollup: catalog meta + denormalized counters + lateral subqueries for gate attempts/grants/denials and view event counts. Single SELECT returns everything the operations dashboard needs.

---

## Storage layout (post-consolidation 2026-05-23)

The 5 dedicated catalog buckets were folded into the 3 anchor buckets. Identity now lives in the path prefix, not the bucket name. See [CLAUDE.md](../CLAUDE.md) "Storage Buckets" for the platform-wide map.

| Bucket | Prefix | Contents | Lifecycle |
|---|---|---|---|
| `pdf-documents` | `catalog-source/<user_id>/<uuid>.pdf` | Admin-uploaded source PDFs. | Deleted when `catalog_source_pdfs` row is deleted from the admin UI. |
| `pdf-documents` | `catalog-output/<catalog_id>/catalog-<ts>.pdf` | Generated catalog PDFs. | Signed URL with 7-day TTL written into `presentation_catalogs.pdf_url`. Regenerated on `generate_catalog_pdf` calls. |
| `pdf-tiles` | `catalog-extracted/<source_pdf_id>/page-<n>-<bbox-hash>.png` | Page region crops produced by MIVAA's PyMuPDF rasterizer. | Signed URL TTL = 7 days; deterministic path means re-extraction reuses the same key. |
| `quote-templates` | `catalog/cover.png`, `catalog/backcover.png`, `catalog/content-bg.png` | Cover / body-background / back-cover template assets. | Admin-uploaded; one set per row in `catalog_templates`. |

---

## Edge functions

All under [supabase/functions/](../supabase/functions/).

### `generate-catalog-pdf`

A4 portrait PDF builder using `pdf-lib`. Cover page (full-page template image with overlay text) + N body pages (4 materials per page, image left + name/desc/specs/price right) + back cover. Accent color from template. Refuses to render an empty catalog (returns 422). Updates `presentation_catalogs.status / pdf_url / pdf_generated_at / page_count` on success.

[supabase/functions/generate-catalog-pdf/](../supabase/functions/generate-catalog-pdf/): `index.ts` (router + auth), `data-fetcher.ts`, `pdf-builder.ts`, `types.ts`.

### `catalog-extract-from-pdfs`

For every attached `catalog_source_pdfs` row, downloads the PDF, base64-encodes, sends to Claude Sonnet 5 with the user's free-form query and the `record_candidates` tool schema. Sonnet returns matched candidates with `name`, `description`, `page_no`, optional `price/currency/specs`, and a normalized [0..1] `bbox`. Then runs a **4-way concurrent worker pool** invoking `catalog-render-pdf-page` for each candidate that has a page_no, populating `image_url` from the bbox crop. Every Anthropic call is logged to `ai_usage_logs` with `feature='presentation_catalogs'` + `sub_feature='extract_from_pdf'`.

### `catalog-translate-pdf`

Same shape as extract, but a single Vision pass over the whole PDF. `preserve_original_layout=true` mirrors page-by-page; `false` (default) restructures into category sections. Materials cap = 200. Same bbox + auto-rasterize pattern.

### `catalog-image-search`

Two-stage image search for materials that don't have one yet:

1. **DB first** — POST to MIVAA `/api/rag/search` with `strategy=multi_vector`. For each hit, looks up the first `document_images` row for the matched product and creates a 7-day signed URL.
2. **Web fallback** — DataForSEO `serp/google/images/live/advanced` if DB returned fewer than `max_candidates`. Hits get tagged with `source: 'web'` and source domain in metadata.

### `catalog-render-pdf-page`

Thin proxy to MIVAA's rasterizer endpoint. Injects `x-cron-secret` from edge env. Used by extract + translate (and could be called manually by admin tooling).

### `catalog-access`

The only public-reachable endpoint for the catalog flow. 5 actions:

| Action | Body | Returns |
|---|---|---|
| `public_meta` | `{slug}` | `{title, subtitle, cover_image_url, branding}` — minimal pre-auth payload for the email-gate landing page. |
| `request` | `{slug, email}` | `{granted_access, token?, expires_at?, match_kind, access_log_id}`. Resolves the email against platform user / CRM contact / CRM company / email_grant. Mints a 30-day cookie token. Bumps `unique_email_count` via the conditional RPC. |
| `verify` | `{slug, token}` | `{granted_access, email, catalog{cover/body/back/pdf_url}, branding}` — full payload to render the page. |
| `track_view` | `{slug, token}` | `{tracked, event_type}` — writes `catalog_view_events.event_type='page_view'` + atomic `catalog_increment_view_count`. |
| `track_download` | `{slug, token, metadata?}` | `{tracked, event_type}` — writes `catalog_view_events.event_type='pdf_download'`. |

No bearer auth required — the function uses the service role internally and validates tokens / slug binding before exposing data.

### `catalog-send-to-customers`

Bulk-sends a published catalog to a CRM-category-resolved recipient list. Auth `admin` (or service role). Two actions:

| Action | Body | Returns |
|---|---|---|
| `preview` | `{catalog_id, category_ids[]}` | `{recipients_count, recipients[]}` — resolve the list without sending |
| `send` | `{catalog_id, category_ids[], subject?, message_body?, ensure_grants?}` | `{send_batch_id, recipients_count, sent_count, failed_count}` |

Recipients come from the `crm_categories_resolve_recipients(category_ids)` RPC. Catalog must be `status='published'` with a non-null `slug`. Sends one `email-api` message per recipient (`templateSlug='catalog_send.recipient'`, `emailType:'marketing'`, `catalog_url={PUBLIC_APP_URL}/c/{slug}`). `ensure_grants:true` upserts a `catalog_email_grants` row per recipient so non-platform CRM contacts pass the [email gate](#catalog-access). Sender branding from `finance_settings.business_name` + `branding_contact_line`. Each send is logged to `catalog_email_sends` (open/download tracked via email webhooks). 0 credits.

---

## MIVAA endpoint — PDF page rasterization

[mivaa-pdf-extractor/app/api/catalog_routes.py](../mivaa-pdf-extractor/app/api/catalog_routes.py)

Single endpoint: `POST /api/internal/catalog/rasterize-pdf-page`. Auth: `x-cron-secret` header.

**Input**:
```json
{
  "source_pdf_id": "uuid",
  "page_no": 12,
  "bbox": { "x1": 0.10, "y1": 0.20, "x2": 0.55, "y2": 0.60 },
  "dpi": 200,
  "target_path": "optional/override/path.png",
  "signed_url_ttl_seconds": 604800
}
```

**Flow**:
1. Look up `catalog_source_pdfs` row → `storage_path`
2. Download PDF bytes from `pdf-documents` bucket (path stored on the row)
3. Open with PyMuPDF (`fitz.open(stream=pdf_bytes, filetype="pdf")`)
4. Render page at `dpi` zoom (`page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)`)
5. If bbox provided, crop with Pillow to the normalized region
6. Upload to `pdf-tiles` bucket (path = `catalog-extracted/<source_pdf_id>/page-<NNNN>-<bbox-hash>.png`)
7. Return signed URL + storage_path + width/height

**Why MIVAA, not edge runtime**: PyMuPDF needs system libraries (already installed for the main pipeline). Deno-compatible PDF rasterizers either don't render to PNG (pdf-lib) or are heavyweight Wasm bundles that hit memory + cold-start limits on Supabase edge. MIVAA was the safest bet.

---

## Workflow: building a catalog

End-to-end admin journey, driven by KAI in chat:

1. **Upload source PDFs** — admin opens `/admin/catalogs/sources`, uploads one or more manufacturer PDFs with optional manufacturer name + URL + notes. `catalogsService.uploadSourcePdf(file, opts)` writes to `pdf-documents` bucket under `catalog-source/<user_id>/<uuid>.pdf` + inserts `catalog_source_pdfs` row. Admin copies the IDs (or notes them).
2. **Create the catalog** — admin opens `/admin/catalogs`, clicks "+ New Catalog", fills the modal. Or in chat: `Start a new catalog called "Spring 2026 Range" for Vasilis Imports`. JARVIS calls `create_catalog` → returns `catalog_id`.
3. **Attach PDFs** — `Attach source PDFs <id1>, <id2> to catalog <catalog_id>`. JARVIS calls `attach_catalog_pdfs`. Catalog now references those source PDFs.
4. **Extract sections** — `From the attached PDFs, pull all white porcelain tiles in 600×600 format`. JARVIS calls `extract_from_catalog_pdfs`. Edge function runs Sonnet Vision + auto-rasterizes bbox crops via MIVAA. Chat surface renders `CatalogExtractionCandidatesCard` with thumbnails. Admin reviews, edits the section title input, clicks ✓ on the ones to keep, hits "Add to catalog" (calls `catalogsService.approveExtractionCandidates`).
5. **(Alternate) Translate the entire PDF** — `Translate this manufacturer PDF into a new catalog grouped by category`. JARVIS calls `translate_pdf_to_catalog`. Single Vision pass, hundreds of materials at once, auto-rasterized.
6. **Add manual materials** — `Also add Crema Marfil 600×600 at €24.50 to the Porcelain section`. JARVIS calls `add_material_to_catalog` with `price_source='manual'`. If `needs_image:true` came back (no image yet), JARVIS calls `find_image_for_material` next; admin clicks ✓ on a candidate.
7. **Pricing from existing data** — `Add product <id> to the Wood section, pulling price from the cheapest verified retailer`. JARVIS uses `price_source='price_monitoring'` + `price_source_ref=<tracked_query_id>`. The tool reads `tracked_queries.current_price` directly.
8. **Edit cover/back** — admin opens the builder page, Cover & Back tab. Title / subtitle / description / client name / closing message / contact line are all `onBlur` saves directly to `presentation_catalogs.cover_data` / `back_cover_data`.
9. **Generate PDF** — admin clicks "Generate PDF" in the builder header (or JARVIS calls `generate_catalog_pdf`). PDF preview iframe renders inline in the PDF tab.
10. **Publish** — admin clicks "Publish" (or `publish_catalog` from chat). Slug auto-generated from title; admin can override. Status flips to `published`, public URL surfaced as `/c/<slug>`.

Throughout, every chunk emitted by the agent (`catalog_extraction_candidates`, `catalog_pdf_ready`, etc.) renders as an inline message in AgentHub so the admin doesn't context-switch between chat and the admin UI.

---

## Workflow: publishing + email-gate

`/c/:slug` is a single React route ([PublicCatalogPage.tsx](../src/components/business/catalogs/PublicCatalogPage.tsx)) that runs no auth.

```
Visitor lands on /c/spring-2026-porcelain
   │
   │ POST /functions/v1/catalog-access {action: 'public_meta', slug}
   ▼
Renders cover image + title + email form
   │
   │ POST {action: 'request', slug, email: 'jane@acme.com'}
   ▼
catalog-access resolveEmailMatch():
   1. user_profiles.email ILIKE 'jane@acme.com'  →  match_kind='platform_user'
   2. crm_contacts.email ILIKE …                 →  match_kind='crm_contact'
   3. crm_companies.email ILIKE …                →  match_kind='crm_company'
   4. catalog_email_grants WHERE catalog_id+email →  match_kind='email_grant'
   5. otherwise                                   →  match_kind='denied'
   │
   ▼
If granted: mint random 24-byte hex cookie token, write catalog_access_log row,
            bump unique_email_count via SQL RPC, return token + 30-day expiry
            ↓
Frontend writes mk_catalog_token_<slug> cookie, calls verify
   │
   │ POST {action: 'verify', slug, token}
   ▼
catalog-access returns full catalog body + branding
   │
   ▼
CatalogReader renders cover hero + sections + materials + footer.
On render:    {action: 'track_view', slug, token}    → writes page_view + atomic view_count++
On download:  {action: 'track_download', slug, token} → writes pdf_download
```

Cookie name: `mk_catalog_token_<slug>` — per-slug so a visitor with access to multiple catalogs has independent sessions. Cookie has 30-day expiry, `Path=/`, `SameSite=Lax`.

Subsequent visits to the same slug skip the email form: `useEffect` reads the cookie, calls `verify`, renders the body. If the token was revoked or expired, falls back to the gate.

**Per-catalog email allowlist**: admin manages it in the builder page Access tab — `add catalog_email_grants` row, optional `note`, optional `expires_at`. Revoke via `revoked_at` timestamp; the resolver checks both `revoked_at` and `expires_at` before granting.

---

## Operations / observability

Lives at [/admin/operations](../src/components/Admin/OperationsDashboard/OperationsDashboard.tsx) → **Catalogs** tab (deep-link: `/admin/operations?tab=catalogs`).

[src/components/Admin/OperationsDashboard/CatalogOperationsTab.tsx](../src/components/Admin/OperationsDashboard/CatalogOperationsTab.tsx) is the embeddable component. Driven by the `catalog_operations_summary` view + `catalog_view_events` + `catalog_access_log` queries via `catalogsService.list*`.

**Stats strip (7 cards)**:
- Catalogs (with `n published` sub) — Mail / unique emails — Eye / page views — FileDown / downloads — Activity / gate attempts — ShieldAlert / denied (red).

**Filters (4)**:
- Catalog (one or All) — Event type (all / page_view / pdf_download) — Range (24h / 7d / 30d / all) — Email contains (substring match).

**Three sub-tabs**:
- **By catalog** — table per `catalog_operations_summary`: views / downloads / gate (granted/denied) / unique emails / last activity / open + open-public-page actions.
- **Events** — timeline of every `page_view` + `pdf_download` event with email + matched_kind + linked user profile (joined via `getUserProfilesByIds`) + IP. Click catalog name to jump into the builder.
- **Email-gate** — every gate attempt (granted + denied) with the same join. Lets admin see who tried, who got in, who got denied.

**Per-catalog Visitors tab** ([CatalogBuilderPage.tsx](../src/modules/presentation-catalogs/pages/CatalogBuilderPage.tsx)) shows the same data scoped to one catalog: 4 mini-stats + page-views/downloads table + gate attempts table.

---

## Cost model

Costs are absorbed by the platform (admin tools don't debit user credits). All calls land in `ai_usage_logs` with `feature='presentation_catalogs'`.

| Operation | Provider | Approx cost |
|---|---|---|
| `extract_from_catalog_pdfs` | Anthropic Sonnet 5 (PDF Vision) | ~$0.05–0.15 per source PDF (depends on page count) |
| `translate_pdf_to_catalog` | Anthropic Sonnet 5 (PDF Vision) | ~$0.10–0.40 per PDF (whole-doc pass with `max_tokens: 8000`) |
| Per-candidate rasterization | MIVAA PyMuPDF | ~free (server CPU) |
| `find_image_for_material` (DB hit) | MIVAA `/api/rag/search` | ~free |
| `find_image_for_material` (web fallback) | DataForSEO Images SERP | ~$0.0006 per call |
| `generate_catalog_pdf` | pdf-lib (edge) | ~free |
| `catalog-access` (gate / verify / track) | service role only | ~free |

For per-product/per-image cost attribution, look at `ai_usage_logs.metadata.catalog_id`, `metadata.source_pdf_id`, `metadata.sub_feature`.

---

## Permissions / RLS

- **All five tables** have RLS enabled. Default policy = **admin-only** (`is_admin_user()` helper). `catalog_templates` allows `SELECT` to any authenticated user when `is_active=true` so the create-catalog modal can list templates without privilege escalation.
- **Public catalog access** does NOT go through RLS. `catalog-access` runs as service role inside the edge function and validates email/cookie before exposing the body. The anon role cannot SELECT from `presentation_catalogs` directly.
- **Admin tool gating**: `agent-chat/index.ts` only injects the 8 catalog tools when `userRole ∈ {admin, owner}`. Same gate as B2B tools and SEO Article Pipeline.

---

## Activation / deploy

After pulling the branch:

1. **Apply migrations** (already applied on dev DB; for fresh deployments):
   - `supabase/migrations/20260508_presentation_catalogs_module.sql`
   - `supabase/migrations/20260508_kai_prompt_catalogs_addendum.sql`
   - `supabase/migrations/20260508_catalog_view_events.sql`

2. **Deploy MIVAA** with the new [catalog_routes.py](../mivaa-pdf-extractor/app/api/catalog_routes.py). PyMuPDF + Pillow are already installed for the main pipeline; no requirements bump.

3. **Deploy 6 Supabase edge functions**:
   ```bash
   supabase functions deploy generate-catalog-pdf
   supabase functions deploy catalog-extract-from-pdfs
   supabase functions deploy catalog-translate-pdf
   supabase functions deploy catalog-image-search
   supabase functions deploy catalog-access
   supabase functions deploy catalog-render-pdf-page
   ```

4. **Redeploy `agent-chat`** so the new tools load:
   ```bash
   supabase functions deploy agent-chat
   ```

5. **Edge function secrets**:
   - `ANTHROPIC_API_KEY` — required by extract/translate
   - `CRON_SECRET` — required by `catalog-render-pdf-page` (must match MIVAA's)
   - `MIVAA_GATEWAY_URL` — defaults to `https://v1api.materialshub.gr`
   - `DATAFORSEO_BASE64` (or `_LOGIN`+`_PASSWORD`) — required for web image fallback in `catalog-image-search`
   - `PUBLIC_APP_URL` — optional, used for the published-catalog URL in agent responses (defaults to `https://app.materialshub.gr`)

6. **Upload default template assets** to the `quote-templates` bucket under the `catalog/` prefix. The seeded "Default" row in `catalog_templates` references `catalog/cover.png` + `catalog/backcover.png` — replace those before the first PDF generation.

---

## File-by-file reference

### Database

- `../supabase/migrations/20260508_presentation_catalogs_module.sql` — 5 tables + 4 enums + RLS + 5 storage buckets + `is_admin_user()` helper + module entry + default template seed.
- `../supabase/migrations/20260508_kai_prompt_catalogs_addendum.sql` — appends catalog tool guidance to the `kai` prompt row. Idempotent via `--END_PRESENTATION_CATALOGS_ADDENDUM--` marker.
- `../supabase/migrations/20260508_catalog_view_events.sql` — `catalog_view_events` table + enum + 2 atomic RPCs + `catalog_operations_summary` view.

### Backend (edge functions)

- [supabase/functions/generate-catalog-pdf/](../supabase/functions/generate-catalog-pdf/) — PDF builder (cover + body + back).
- [supabase/functions/catalog-extract-from-pdfs/](../supabase/functions/catalog-extract-from-pdfs/) — Sonnet Vision per-query extraction + auto-rasterize.
- [supabase/functions/catalog-translate-pdf/](../supabase/functions/catalog-translate-pdf/) — Sonnet Vision whole-PDF translation + auto-rasterize.
- [supabase/functions/catalog-image-search/](../supabase/functions/catalog-image-search/) — DB-then-web image search.
- [supabase/functions/catalog-access/](../supabase/functions/catalog-access/) — public email-gate + tracking.
- [supabase/functions/catalog-render-pdf-page/](../supabase/functions/catalog-render-pdf-page/) — proxy to MIVAA rasterizer.
- [supabase/functions/_shared/tools/catalog-tools.ts](../supabase/functions/_shared/tools/catalog-tools.ts) — 8 LangChain tools.
- [supabase/functions/agent-chat/index.ts](../supabase/functions/agent-chat/index.ts) — `needsCatalog` lazy-import + tool registration block (admin-gated).

### Backend (MIVAA)

- [mivaa-pdf-extractor/app/api/catalog_routes.py](../mivaa-pdf-extractor/app/api/catalog_routes.py) — `POST /api/internal/catalog/rasterize-pdf-page` (PyMuPDF + Pillow).
- [mivaa-pdf-extractor/app/main.py](../mivaa-pdf-extractor/app/main.py) — `app.include_router(catalog_internal_router)`.

### Frontend (services)

- [src/services/catalogsService.ts](../src/services/catalogsService.ts) — full CRUD + PDF gen + grants + access log + view events + operations summary + user profile lookups.

### Frontend (admin pages — module)

- [src/modules/presentation-catalogs/manifest.json](../src/modules/presentation-catalogs/manifest.json)
- [src/modules/presentation-catalogs/index.ts](../src/modules/presentation-catalogs/index.ts) — 3 admin routes + 1 nav item.
- [src/modules/presentation-catalogs/pages/CatalogsListPage.tsx](../src/modules/presentation-catalogs/pages/CatalogsListPage.tsx)
- [src/modules/presentation-catalogs/pages/CatalogSourcesPage.tsx](../src/modules/presentation-catalogs/pages/CatalogSourcesPage.tsx)
- [src/modules/presentation-catalogs/pages/CatalogBuilderPage.tsx](../src/modules/presentation-catalogs/pages/CatalogBuilderPage.tsx)

### Frontend (operations dashboard integration)

- [src/components/Admin/OperationsDashboard/CatalogOperationsTab.tsx](../src/components/Admin/OperationsDashboard/CatalogOperationsTab.tsx) — embedded tab body.
- [src/components/Admin/OperationsDashboard/OperationsDashboard.tsx](../src/components/Admin/OperationsDashboard/OperationsDashboard.tsx) — Catalogs tab wired in + URL `?tab=` deep-link support.

### Frontend (public + agent surface)

- [src/components/business/catalogs/PublicCatalogPage.tsx](../src/components/business/catalogs/PublicCatalogPage.tsx) — `/c/:slug` email-gate + reader.
- [src/components/business/catalogs/CreateCatalogModal.tsx](../src/components/business/catalogs/CreateCatalogModal.tsx)
- [src/components/features/ai/CatalogExtractionCandidatesCard.tsx](../src/components/features/ai/CatalogExtractionCandidatesCard.tsx)
- [src/components/features/ai/CatalogImageCandidatesCard.tsx](../src/components/features/ai/CatalogImageCandidatesCard.tsx)
- [src/components/features/ai/AgentHub.tsx](../src/components/features/ai/AgentHub.tsx) — `catalog_*` chunk dispatcher + card rendering.
- [src/components/features/ai/agentToolsCatalog.ts](../src/components/features/ai/agentToolsCatalog.ts) — 8 tool browse entries.
- [src/App.tsx](../src/App.tsx) — public `/c/:slug` route.

---

## Known limitations

1. **No version history on catalog edits** — saves overwrite. If a published catalog is edited, the public page reflects changes immediately. Acceptable for the current admin workflow but a versioned snapshot table would let "what did the client see when they opened the link?" be answered.
2. **Single currency per material** — no live FX. The catalog renders whatever currency was on the material when added. Cross-currency display would need a price snapshot job.
3. **No realtime fan-out** — admin operations dashboard refreshes on demand. Realtime is not wired up because the typical write rate is dozens-per-day, not thousands.
4. **`catalog-image-search` web fallback hits UK SERP** — `location_code=2826`. Country-aware routing would need a per-catalog `country_code` field.
5. **Per-page Vision token usage** — extract/translate base64-encode the entire PDF on every call. Larger PDFs (>50 pages) approach the Sonnet input-token cap. A future optimization would chunk the PDF and run multiple Vision passes.
