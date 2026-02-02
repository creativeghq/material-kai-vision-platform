# Quote PDF/HTML Generation - Final Implementation Plan

## Overview

Generate branded PDF and HTML documents when a quote is published, using Supabase Edge Functions for consistent, reliable output.

---

## Architecture

```
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
```

---

## Phase 1: Database Schema

### 1.1 Migration: Add Quote Publishing Fields

```sql
-- Migration: add_quote_publishing_fields
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pdf_url TEXT,
ADD COLUMN IF NOT EXISTS html_url TEXT,
ADD COLUMN IF NOT EXISTS quote_number TEXT;

-- Auto-generate quote numbers
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.published_at IS NOT NULL AND OLD.published_at IS NULL THEN
    NEW.quote_number := 'Q-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                        LPAD(NEXTVAL('quote_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1;

CREATE TRIGGER set_quote_number
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION generate_quote_number();
```

### 1.2 Migration: Quote Templates Table

```sql
-- Migration: create_quote_templates
CREATE TABLE quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,

  -- Template pages (storage paths)
  intro_pages JSONB DEFAULT '[]',        -- ["templates/intro-1.png", "templates/intro-2.png"]
  background_page TEXT,                   -- "templates/background.png"
  final_pages JSONB DEFAULT '[]',         -- ["templates/final-1.png"]

  -- Table positioning & styling
  table_config JSONB DEFAULT '{
    "position": {"x": 50, "y": 180},
    "width": 500,
    "maxRowsPerPage": 12,
    "columns": ["image", "name", "size", "quantity", "unit_price", "total"],
    "showHeader": true,
    "headerHeight": 30,
    "rowHeight": 45
  }',

  -- Styling
  style_config JSONB DEFAULT '{
    "headerBgColor": "#1a1a2e",
    "headerTextColor": "#ffffff",
    "rowBgColor": "#ffffff",
    "altRowBgColor": "#f8f9fa",
    "borderColor": "#dee2e6",
    "fontFamily": "Helvetica",
    "fontSize": 10,
    "accentColor": "#3b82f6"
  }',

  -- Meta
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(workspace_id, name)
);

-- RLS Policies
ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their workspace templates"
  ON quote_templates FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage templates"
  ON quote_templates FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
  ));
```

---

## Phase 2: Supabase Storage Setup

### 2.1 Storage Buckets

```
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
```

### 2.2 Storage Policies

```sql
-- Templates: workspace members can read, admins can write
CREATE POLICY "Workspace members can read templates"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'quote-templates' AND ...);

-- Documents: quote owner and workspace admins can access
CREATE POLICY "Quote documents access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'quote-documents' AND ...);
```

---

## Phase 3: Edge Function - generate-quote-pdf

### 3.1 Function Structure

```
supabase/functions/generate-quote-pdf/
├── index.ts          # Main handler
├── pdf-generator.ts  # PDF creation logic
├── html-generator.ts # HTML creation logic
├── types.ts          # TypeScript interfaces
└── deno.json         # Dependencies
```

### 3.2 Main Handler (index.ts)

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { generatePDF } from "./pdf-generator.ts"
import { generateHTML } from "./html-generator.ts"

interface RequestBody {
  quote_id: string
  template_id?: string
}

serve(async (req) => {
  try {
    const { quote_id, template_id } = await req.json() as RequestBody

    // Initialize Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Fetch quote with items
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select(`
        *,
        quote_items (
          *,
          products (id, name, sku, primary_image_url, base_price)
        ),
        quote_upsells (
          *,
          upsells (name, price)
        ),
        users (full_name, email, company_name, phone)
      `)
      .eq('id', quote_id)
      .single()

    if (quoteError) throw quoteError

    // 2. Fetch template
    const { data: template } = await supabase
      .from('quote_templates')
      .select('*')
      .eq('id', template_id || quote.workspace_id)
      .or(`is_default.eq.true,workspace_id.eq.${quote.workspace_id}`)
      .order('is_default', { ascending: false })
      .limit(1)
      .single()

    // 3. Generate PDF
    const pdfBuffer = await generatePDF(quote, template, supabase)

    // 4. Generate HTML
    const htmlContent = await generateHTML(quote, template, supabase)

    // 5. Generate quote number if not exists
    const quoteNumber = quote.quote_number ||
      `Q-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`

    // 6. Upload PDF to storage
    const pdfPath = `${quote.workspace_id}/${quote_id}/quote-${quoteNumber}.pdf`
    const { error: pdfUploadError } = await supabase.storage
      .from('quote-documents')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      })

    if (pdfUploadError) throw pdfUploadError

    // 7. Upload HTML to storage
    const htmlPath = `${quote.workspace_id}/${quote_id}/quote-${quoteNumber}.html`
    const { error: htmlUploadError } = await supabase.storage
      .from('quote-documents')
      .upload(htmlPath, htmlContent, {
        contentType: 'text/html',
        upsert: true
      })

    if (htmlUploadError) throw htmlUploadError

    // 8. Get signed URLs (valid for 7 days)
    const { data: pdfUrl } = await supabase.storage
      .from('quote-documents')
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 7)

    const { data: htmlUrl } = await supabase.storage
      .from('quote-documents')
      .createSignedUrl(htmlPath, 60 * 60 * 24 * 7)

    // 9. Update quote record
    const { error: updateError } = await supabase
      .from('quotes')
      .update({
        published_at: new Date().toISOString(),
        pdf_url: pdfUrl?.signedUrl,
        html_url: htmlUrl?.signedUrl,
        quote_number: quoteNumber,
        status: 'quoted'
      })
      .eq('id', quote_id)

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({
        success: true,
        quote_number: quoteNumber,
        pdf_url: pdfUrl?.signedUrl,
        html_url: htmlUrl?.signedUrl
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

### 3.3 PDF Generator (pdf-generator.ts)

```typescript
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1"

export async function generatePDF(
  quote: QuoteData,
  template: TemplateConfig,
  supabase: SupabaseClient
): Promise<Uint8Array> {

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // 1. Add intro pages
  for (const introPath of template.intro_pages) {
    const introBytes = await fetchImage(supabase, introPath)
    const introImage = await pdfDoc.embedPng(introBytes)
    const page = pdfDoc.addPage([introImage.width, introImage.height])
    page.drawImage(introImage, {
      x: 0, y: 0,
      width: introImage.width,
      height: introImage.height
    })
  }

  // 2. Add table pages with background
  const bgBytes = await fetchImage(supabase, template.background_page)
  const bgImage = await pdfDoc.embedPng(bgBytes)

  const tableConfig = template.table_config
  const items = quote.quote_items
  const rowsPerPage = tableConfig.maxRowsPerPage
  const totalPages = Math.ceil(items.length / rowsPerPage)

  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const page = pdfDoc.addPage([bgImage.width, bgImage.height])

    // Draw background
    page.drawImage(bgImage, {
      x: 0, y: 0,
      width: bgImage.width,
      height: bgImage.height
    })

    // Draw table
    const startIdx = pageNum * rowsPerPage
    const pageItems = items.slice(startIdx, startIdx + rowsPerPage)

    await drawTable(page, pageItems, tableConfig, font, fontBold, pdfDoc, supabase)

    // Draw totals on last table page
    if (pageNum === totalPages - 1) {
      await drawTotals(page, quote, tableConfig, font, fontBold)
    }
  }

  // 3. Add final pages
  for (const finalPath of template.final_pages) {
    const finalBytes = await fetchImage(supabase, finalPath)
    const finalImage = await pdfDoc.embedPng(finalBytes)
    const page = pdfDoc.addPage([finalImage.width, finalImage.height])
    page.drawImage(finalImage, {
      x: 0, y: 0,
      width: finalImage.width,
      height: finalImage.height
    })
  }

  return await pdfDoc.save()
}

async function drawTable(
  page: PDFPage,
  items: QuoteItem[],
  config: TableConfig,
  font: PDFFont,
  fontBold: PDFFont,
  pdfDoc: PDFDocument,
  supabase: SupabaseClient
) {
  const { position, width, headerHeight, rowHeight, columns } = config
  const colWidths = calculateColumnWidths(columns, width)

  let y = page.getHeight() - position.y

  // Draw header
  if (config.showHeader) {
    // Header background
    page.drawRectangle({
      x: position.x,
      y: y - headerHeight,
      width: width,
      height: headerHeight,
      color: rgb(0.1, 0.1, 0.18) // Dark header
    })

    // Header text
    let x = position.x + 5
    for (const col of columns) {
      page.drawText(getColumnLabel(col), {
        x, y: y - headerHeight + 10,
        font: fontBold,
        size: 10,
        color: rgb(1, 1, 1)
      })
      x += colWidths[col]
    }

    y -= headerHeight
  }

  // Draw rows
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const isAlt = i % 2 === 1

    // Row background
    page.drawRectangle({
      x: position.x,
      y: y - rowHeight,
      width: width,
      height: rowHeight,
      color: isAlt ? rgb(0.97, 0.98, 0.99) : rgb(1, 1, 1)
    })

    // Row content
    let x = position.x + 5

    // Product image (thumbnail)
    if (columns.includes('image') && item.products?.primary_image_url) {
      try {
        const imgBytes = await fetch(item.products.primary_image_url).then(r => r.arrayBuffer())
        const img = await pdfDoc.embedJpg(new Uint8Array(imgBytes))
        page.drawImage(img, {
          x, y: y - rowHeight + 5,
          width: 35, height: 35
        })
      } catch {}
      x += colWidths['image']
    }

    // Product name
    if (columns.includes('name')) {
      page.drawText(item.products?.name || 'N/A', {
        x, y: y - rowHeight + 15,
        font, size: 9
      })
      x += colWidths['name']
    }

    // Size/Color
    if (columns.includes('size')) {
      const size = [item.selected_size, item.selected_color].filter(Boolean).join(' / ')
      page.drawText(size || '-', {
        x, y: y - rowHeight + 15,
        font, size: 9
      })
      x += colWidths['size']
    }

    // Quantity
    if (columns.includes('quantity')) {
      page.drawText(String(item.quantity || 1), {
        x, y: y - rowHeight + 15,
        font, size: 9
      })
      x += colWidths['quantity']
    }

    // Unit price
    if (columns.includes('unit_price')) {
      const price = item.products?.base_price || 0
      page.drawText(`€${price.toFixed(2)}`, {
        x, y: y - rowHeight + 15,
        font, size: 9
      })
      x += colWidths['unit_price']
    }

    // Total
    if (columns.includes('total')) {
      const total = (item.products?.base_price || 0) * (item.quantity || 1)
      page.drawText(`€${total.toFixed(2)}`, {
        x, y: y - rowHeight + 15,
        fontBold, size: 9
      })
    }

    y -= rowHeight
  }

  // Draw border
  page.drawRectangle({
    x: position.x,
    y: y,
    width: width,
    height: page.getHeight() - position.y - y,
    borderColor: rgb(0.87, 0.89, 0.91),
    borderWidth: 1
  })
}
```

---

## Phase 4: Frontend Integration

### 4.1 QuoteDocumentService

**File**: `src/services/QuoteDocumentService.ts`

```typescript
import { supabase } from '@/lib/supabase'

export class QuoteDocumentService {

  static async publishQuote(quoteId: string, templateId?: string): Promise<{
    success: boolean
    quoteNumber?: string
    pdfUrl?: string
    htmlUrl?: string
    error?: string
  }> {
    const { data, error } = await supabase.functions.invoke('generate-quote-pdf', {
      body: { quote_id: quoteId, template_id: templateId }
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return data
  }

  static async regenerateDocuments(quoteId: string): Promise<...> {
    // Same as publish, but for already-published quotes
  }

  static async getDocumentUrls(quoteId: string): Promise<{
    pdfUrl: string | null
    htmlUrl: string | null
  }> {
    const { data } = await supabase
      .from('quotes')
      .select('pdf_url, html_url')
      .eq('id', quoteId)
      .single()

    return {
      pdfUrl: data?.pdf_url || null,
      htmlUrl: data?.html_url || null
    }
  }
}
```

### 4.2 Publish Button Component

**File**: `src/components/admin/QuotePublishButton.tsx`

```typescript
export function QuotePublishButton({ quoteId, onPublished }: Props) {
  const [isPublishing, setIsPublishing] = useState(false)

  const handlePublish = async () => {
    setIsPublishing(true)

    const result = await QuoteDocumentService.publishQuote(quoteId)

    if (result.success) {
      toast.success(`Quote ${result.quoteNumber} published!`)
      onPublished?.(result)
    } else {
      toast.error(`Failed to publish: ${result.error}`)
    }

    setIsPublishing(false)
  }

  return (
    <Button onClick={handlePublish} disabled={isPublishing}>
      {isPublishing ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <FileText className="mr-2 h-4 w-4" />
          Publish Quote
        </>
      )}
    </Button>
  )
}
```

### 4.3 Document Download Links

**File**: `src/components/admin/QuoteDocumentLinks.tsx`

```typescript
export function QuoteDocumentLinks({ quote }: { quote: Quote }) {
  if (!quote.published_at) return null

  return (
    <div className="flex gap-2">
      <Badge variant="outline">
        {quote.quote_number}
      </Badge>

      {quote.pdf_url && (
        <Button variant="outline" size="sm" asChild>
          <a href={quote.pdf_url} target="_blank" download>
            <FileDown className="mr-1 h-4 w-4" />
            PDF
          </a>
        </Button>
      )}

      {quote.html_url && (
        <Button variant="outline" size="sm" asChild>
          <a href={quote.html_url} target="_blank">
            <Globe className="mr-1 h-4 w-4" />
            Web View
          </a>
        </Button>
      )}
    </div>
  )
}
```

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

Use client-side pdf.js to extract pages as images before uploading:

```typescript
import * as pdfjsLib from 'pdfjs-dist'

async function extractPdfPages(file: File): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise
  const pages: Blob[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const scale = 2 // High quality
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({
      canvasContext: canvas.getContext('2d')!,
      viewport
    }).promise

    const blob = await new Promise<Blob>(resolve =>
      canvas.toBlob(b => resolve(b!), 'image/png', 1.0)
    )
    pages.push(blob)
  }

  return pages
}
```

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
