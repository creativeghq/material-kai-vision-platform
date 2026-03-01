# Material KAI Vision Platform - Design System

## Global Design Patterns

This document defines the consistent design patterns used across the entire platform.

---

## 0. Premium "Rich Aesthetic" Standard (2026)

### Glassmorphism (Liquid Glass)

- ✅ **Opacity**: Base at 0.7, hover at 0.85
- ✅ **Blur**: 10px-16px range
- ✅ **Border**: Subtle white translucent border for edge definition

### Bento Grid Layout
**Standard for Dashboards:**
- ✅ **Gap**: Use `gap-6` (24px) for distinct compartments
- ✅ **Variable Heights**: Use a mix of spans to create visual interest

---

## 1. Tabs Component

### Standard Admin Page Tabs Pattern
**Reference:** `src/components/Admin/MaterialsData/MaterialsDataPage.tsx`

**Critical Rules:**
- ✅ **TabsList**: `className="w-full h-auto flex-wrap justify-start gap-2 p-2"`
  - `w-full` = background spans full width
  - `h-auto` = auto height for wrapping
  - `flex-wrap` = tabs wrap to next line if needed
  - `justify-start` = tabs aligned to left (NOT stretched across)
  - `gap-2` = spacing between tab buttons
  - `p-2` = padding around tabs
- ✅ **TabsTrigger**: `className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"`
  - Active state uses primary color
  - Icons with `h-4 w-4 mr-2`
- ✅ Background is `bg-muted` (from base component in tabs.tsx)
- ❌ **NEVER** use `grid w-full grid-cols-X` (makes tabs stretch full width)
- ❌ **NEVER** use `bg-transparent` (removes background)

---

## 2. Card Headers with Icons

### Pattern

**Rules:**
- ✅ Always include an icon in CardTitle using `flex items-center gap-2`
- ✅ Icon size: `h-5 w-5`
- ✅ Always include CardDescription for context
- ✅ Use lucide-react icons that match the content type

**Icon Guidelines:**
- `Package` - Products, items, materials
- `Grid3X3` - Chunks, text blocks, segments
- `Image` - Images, photos, visuals
- `Database` - Embeddings, vectors, data
- `Link2` - Relations, connections, links
- `FileText` - Documents, files, PDFs
- `Globe` - Web scraping, external sources

---

## 3. Tables

### EXACT Pattern (Copy from ProductsTab.tsx)

**CRITICAL RULES - DO NOT DEVIATE:**
- ✅ CardContent MUST have `className="p-0"`
- ✅ Table is DIRECT child of ternary (NO wrapper divs!)
- ✅ Pagination is INSIDE CardContent with `mt-6` for spacing
- ✅ Loading/empty states have `py-8` for vertical padding
- ✅ NO `<div className="rounded-md border">` wrapper
- ✅ NO fixed column widths on TableHead
- ✅ First column has `className="font-medium"`
- ✅ Actions column has `className="text-right"`

**Reference File:** `src/components/Admin/MaterialsData/ProductsTab.tsx`

---

## 4. Image Grids (Dashboard Card Style)

### EXACT Pattern (Copy from ImagesTab.tsx)

**CRITICAL RULES - DO NOT DEVIATE:**
- ✅ Use `dashboard-card` class (NOT Card component)
- ✅ Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` with `gap: var(--grid-gap)`
- ✅ Card: `className="dashboard-card transition-all duration-200 hover:shadow-md cursor-pointer"`
- ✅ Card padding: `style={{ padding: 'var(--card-padding)' }}`
- ✅ Image container: `aspect-video bg-muted rounded-lg overflow-hidden`
- ✅ Image: `w-full h-full object-cover`
- ✅ Use CSS variables for ALL spacing: `var(--space-sm)`, `var(--space-xs)`, `var(--text-sm)`, etc.
- ✅ Whole card is clickable with `onClick`
- ✅ NO separate button - entire card is the click target
- ✅ Pagination INSIDE CardContent with `mt-6`

**Reference File:** `src/components/Admin/MaterialsData/ImagesTab.tsx`

---

## 7. Smart Pagination

### Pattern

Use the `SmartPagination` component from `@/components/ui/smart-pagination`. Wrap it in a div with `className="mt-6"` and only render it when `totalCount > ITEMS_PER_PAGE`.

**Behavior:**
- Shows: `Previous 1 2 3 4 ... 10 Next`
- When on page 4: `Previous 1 ... 3 4 5 ... 10 Next`
- When on page 10: `Previous 1 ... 8 9 10 Next`
- Always shows first page, last page, current page ± 1
- Ellipsis (...) for gaps

**Rules:**
- ✅ Always use SmartPagination component
- ✅ Wrapper div with `className="mt-6"`
- ✅ Calculate totalPages with `Math.ceil(totalCount / ITEMS_PER_PAGE)`
- ❌ Never create custom pagination with all page numbers

**Reference File:** `src/components/ui/smart-pagination.tsx`

---

## 5. Source Badges

### Pattern

Maintain a consistent mapping from `sourceType` to badge variant: `pdf_processing` → default (primary color), `xml_import` → secondary, `web_scraping` → outline.

**Rules:**
- ✅ Consistent badge variants across platform
- ✅ PDF = default (primary color)
- ✅ XML = secondary
- ✅ Web = outline

---

## 6. Stat Cards

### Pattern (AdminStatCard)

Use `AdminStatCard` from `../AdminStatCard` inside a responsive grid with `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`.

**Rules:**
- ✅ Always use AdminStatCard component for stats
- ✅ Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- ✅ Compact design with icon + title on same line
- ❌ Never create custom stat cards with big icons and spacing

---

## 8. Agentic UI Patterns

### Thinking / Reasoning Logs
When an AI agent is performing a multi-step task, use the `ThinkingLog` pattern with an animated `Brain` icon and a list of log entries.

**Reference:** `src/pages/AgentHub.tsx`

### Source Badges (Floating)
Display PDF sources as floating glass badges near the relevant content, showing the file name and page number with a `FileText` icon.

---

## Implementation Checklist

When creating new admin pages or tabs:

- [ ] Use standard tabs pattern: `TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2"`
- [ ] Add active state to TabsTrigger: `className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"`
- [ ] Add icon to CardTitle with `flex items-center gap-2`
- [ ] Include CardDescription
- [ ] For tables: CardContent with `className="p-0"`
- [ ] For tables: NO wrapper divs, NO fixed widths
- [ ] For grids: Use responsive grid pattern
- [ ] Use consistent source badges
- [ ] Match existing icon patterns

---

## Files to Reference

- **Tabs**: `src/components/ui/tabs.tsx`
- **Table Example**: `src/components/Admin/MaterialsData/ProductsTab.tsx`
- **Grid Example**: `src/components/Admin/MaterialsData/ImagesTab.tsx`
- **Relations Example**: `src/components/Admin/MaterialsData/RelationsTab.tsx`
