# Quote PDF/HTML Generation - Final Implementation Plan

## Overview

Generate branded PDF and HTML documents when a quote is published, using Supabase Edge Functions for consistent, reliable output.

---

## Architecture

┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Edge Function       │────▶│  Supabase       │
│   "Publish"     │     │  generate-quote-pdf  │     │  Storage        │
│   Button        │◀────│                      │◀────│                 │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
                                  │
                                  ▼
                        ┌──────────────────────┐
                        │  Database            │
                        │  - quotes            │
                        │  - quote_items       │
                        │  - quote_templates   │
                        └──────────────────────┘

---

## Phase 1: Database Schema

### 1.1 Migration: Add Quote Publishing Fields

Alter the `quotes` table to add `published_at`, `pdf_url`, `html_url`, and `quote_number` columns. A trigger-based function auto-generates quote numbers in the format `Q-YYYYMMDD-NNNN` when a quote is first published.

### 1.2 Migration: Quote Templates Table

Create a `quote_templates` table with the following structure:

- `id` UUID primary key
- `workspace_id` UUID (references workspaces)
- `name` TEXT
- `intro_pages` JSONB — array of storage paths for intro page images
- `background_page` TEXT — storage path for the background image
- `final_pages` JSONB — array of storage paths for final page images
- `table_config` JSONB — table position (x, y), width, max rows per page, columns, header settings, row height
- `style_config` JSONB — header/row colors, border color, font family, font size, accent color
- `is_default` BOOLEAN
- `created_at` / `updated_at` timestamps

RLS policies allow workspace members to read templates and admins/owners to manage them.

---

## Phase 2: Supabase Storage Setup

### 2.1 Storage Buckets

quote-templates/                    (Private bucket)
├── {workspace_id}/
│   ├── intro/
│   │   ├── page-1.png
│   │   └── page-2.png
│   ├── backgrounds/
│   │   └── main.png
│   └── final/
│       └── page-1.png

quote-documents/                    (Private bucket, signed URLs for access)
├── {workspace_id}/
│   └── {quote_id}/
│       ├── quote-Q-20260128-0001.pdf
│       └── quote-Q-20260128-0001.html

### 2.2 Storage Policies

Storage RLS policies control access: workspace members can read templates, admins can write templates, and quote owners/workspace admins can access generated documents.

---

## Phase 3: Edge Function - generate-quote-pdf

### 3.1 Function Structure

supabase/functions/generate-quote-pdf/
├── index.ts          # Main handler
├── pdf-generator.ts  # PDF creation logic
├── html-generator.ts # HTML creation logic
├── types.ts          # TypeScript interfaces
└── deno.json         # Dependencies

### 3.2 Main Handler (index.ts)

The main handler accepts a `quote_id` and optional `template_id`. It performs the following steps in sequence:

1. Fetch the quote with all items, upsells, and user details from the database
2. Fetch the applicable template (or default template for the workspace)
3. Generate the PDF using `pdf-lib`
4. Generate the HTML document
5. Auto-generate a quote number if not already set
6. Upload the PDF to the `quote-documents` storage bucket
7. Upload the HTML to the `quote-documents` storage bucket
8. Create signed URLs valid for 7 days for both documents
9. Update the `quotes` table with `published_at`, `pdf_url`, `html_url`, `quote_number`, and `status: 'quoted'`
10. Return the quote number and signed URLs in the response

### 3.3 PDF Generator (pdf-generator.ts)

The PDF generator uses `pdf-lib` to assemble the document:

1. **Intro pages**: Each intro page image is embedded and added as a full-bleed page
2. **Table pages**: The background image is tiled across as many pages as needed; the product table is drawn on top with configurable column layout, header styling, alternating row colors, and product thumbnail images
3. **Final pages**: Each final page image is embedded and added as a full-bleed page

The table supports the following configurable columns: `image`, `name`, `size`, `quantity`, `unit_price`, `total`. Totals are drawn on the last table page. A border is drawn around the table area.

---

## Phase 4: Frontend Integration

### 4.1 QuoteDocumentService

**File**: `src/services/QuoteDocumentService.ts`

This service provides three static methods:

- `publishQuote(quoteId, templateId?)` — invokes the `generate-quote-pdf` edge function and returns `{ success, quoteNumber, pdfUrl, htmlUrl, error }`
- `regenerateDocuments(quoteId)` — same as publish, used for already-published quotes
- `getDocumentUrls(quoteId)` — queries the `quotes` table for `pdf_url` and `html_url`

### 4.2 Publish Button Component

**File**: `src/components/admin/QuotePublishButton.tsx`

A button component that calls `QuoteDocumentService.publishQuote()` on click. Shows a spinner and "Generating..." label while in progress. Displays a success toast with the quote number on success, or an error toast on failure.

### 4.3 Document Download Links

**File**: `src/components/admin/QuoteDocumentLinks.tsx`

Renders only when `quote.published_at` is set. Displays the quote number as a badge, a PDF download button (opens `pdf_url` in new tab with download), and a Web View button (opens `html_url` in new tab).

---

## Phase 5: Template Management UI

### 5.1 Template Upload Page

**File**: `src/pages/admin/QuoteTemplatesPage.tsx`

Features:
- Upload PDF pages (auto-convert to PNG)
- Preview template assembly
- Configure table position (drag & drop)
- Set table styling (colors, fonts)
- Mark as default template

### 5.2 PDF to Image Conversion

Uses client-side `pdf.js` to extract each page of an uploaded PDF as a high-resolution PNG blob before uploading to storage. Each page is rendered at 2× scale for quality.

---

## Implementation Checklist

### Phase 1: Database & Storage (Day 1)
- [ ] Create migration for quote publishing fields
- [ ] Create migration for quote_templates table
- [ ] Create quote-templates storage bucket
- [ ] Create quote-documents storage bucket
- [ ] Configure storage RLS policies

### Phase 2: Edge Function (Day 2-3)
- [ ] Create generate-quote-pdf function structure
- [ ] Implement PDF generation with pdf-lib
- [ ] Implement HTML generation
- [ ] Handle template page assembly
- [ ] Handle table rendering with pagination
- [ ] Upload to storage and return URLs
- [ ] Deploy and test

### Phase 3: Frontend Service (Day 3)
- [ ] Create QuoteDocumentService
- [ ] Add publishQuote method
- [ ] Add document URL helpers

### Phase 4: UI Integration (Day 4)
- [ ] Add QuotePublishButton component
- [ ] Add QuoteDocumentLinks component
- [ ] Integrate into QuoteDetailPage
- [ ] Add publish confirmation dialog

### Phase 5: Template Management (Day 5)
- [ ] Create QuoteTemplatesPage
- [ ] PDF page extraction (pdf.js)
- [ ] Template upload UI
- [ ] Table position configurator
- [ ] Style customization

### Phase 6: Testing & Polish (Day 6)
- [ ] Test with various quote sizes
- [ ] Test multi-page pagination
- [ ] Mobile responsiveness of HTML
- [ ] Error handling
- [ ] Loading states

---

## Assets Required From You

1. **Intro PDF** - First page(s) of the quote document
2. **Background PDF** - Single page used as background for quote tables
3. **Final PDF** - Last page(s) of the quote document
4. **Table Example** - Screenshot or description of desired table layout
5. **Supabase Details** - Bucket names if different from plan

---

## Questions Resolved

| Question | Answer |
|----------|--------|
| PDF Generation | Edge Function with pdf-lib |
| Table columns | Configurable per template |
| Quote number | Auto-generated (Q-YYYYMMDD-NNNN) |
| Storage | Supabase storage with signed URLs |
| Trigger | Manual "Publish" button click |

---

Ready to start implementation when you provide the template assets.
