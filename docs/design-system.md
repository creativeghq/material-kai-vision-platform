# Material KAI Vision Platform - Design System

## Global Design Patterns

This document defines the consistent design patterns used across the entire platform.

---

## 1. Tabs Component

### Standard Admin Page Tabs Pattern
**Reference:** `src/components/Admin/MaterialsData/MaterialsDataPage.tsx`

```tsx
<Tabs defaultValue="products" className="w-full">
  <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
    <TabsTrigger value="products" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
      <Package className="h-4 w-4 mr-2" />
      Products
    </TabsTrigger>
    <TabsTrigger value="chunks" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
      <Grid3X3 className="h-4 w-4 mr-2" />
      Chunks
    </TabsTrigger>
  </TabsList>
</Tabs>
```

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
```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <IconComponent className="h-5 w-5" />
      Title Text
    </CardTitle>
    <CardDescription>
      Brief description of the content
    </CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

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
```tsx
<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          Title
        </CardTitle>
        <CardDescription>Description</CardDescription>
      </div>
      <div className="flex items-center gap-2">
        {/* Filters and search */}
      </div>
    </div>
  </CardHeader>
  <CardContent className="p-0">
    {isLoading ? (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ) : filteredItems.length === 0 ? (
      <div className="text-center py-8 text-muted-foreground">
        No items found
      </div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Column 1</TableHead>
            <TableHead>Column 2</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">Content</TableCell>
              <TableCell>Content</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm">
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}

    {/* Pagination */}
    {totalCount > ITEMS_PER_PAGE && (
      <div className="mt-6">
        <SmartPagination
          currentPage={currentPage}
          totalPages={Math.ceil(totalCount / ITEMS_PER_PAGE)}
          onPageChange={setCurrentPage}
        />
      </div>
    )}
  </CardContent>
</Card>
```

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
```tsx
<CardContent>
  {isLoading ? (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ) : filteredImages.length === 0 ? (
    <div className="text-center py-8 text-muted-foreground">
      No images found
    </div>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--grid-gap)' }}>
      {images.map((image) => (
        <div
          key={image.id}
          className="dashboard-card transition-all duration-200 hover:shadow-md cursor-pointer"
          style={{ padding: 'var(--card-padding)' }}
          onClick={() => handleViewImage(image)}
        >
          {/* Image */}
          <div className="aspect-video bg-muted rounded-lg overflow-hidden" style={{ marginBottom: 'var(--space-sm)' }}>
            <img
              src={image.image_url}
              alt={image.caption}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Badges */}
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-xs)' }}>
            <Badge variant="outline" className="text-xs">{image.image_type}</Badge>
            {getSourceBadge(image.source_type)}
          </div>

          {/* Title */}
          <h4 className="font-medium truncate" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-xs)' }}>
            {image.filename}
          </h4>

          {/* Description */}
          {image.description && (
            <p className="text-muted-foreground line-clamp-2" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-xs)' }}>
              {image.description}
            </p>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2" style={{ fontSize: 'var(--text-xs)', color: 'hsl(var(--muted-foreground))' }}>
            <div><span className="font-medium">Page:</span> {image.page}</div>
            <div><span className="font-medium">Status:</span> {image.status}</div>
          </div>
        </div>
      ))}
    </div>
  )}

  {/* Pagination if needed */}
  {totalCount > ITEMS_PER_PAGE && (
    <div className="mt-6">
      <SmartPagination
        currentPage={currentPage}
        totalPages={Math.ceil(totalCount / ITEMS_PER_PAGE)}
        onPageChange={setCurrentPage}
      />
    </div>
  )}
</CardContent>
```

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
```tsx
import { SmartPagination } from '@/components/ui/smart-pagination';

{totalCount > ITEMS_PER_PAGE && (
  <div className="mt-6">
    <SmartPagination
      currentPage={currentPage}
      totalPages={Math.ceil(totalCount / ITEMS_PER_PAGE)}
      onPageChange={setCurrentPage}
    />
  </div>
)}
```

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
```tsx
const getSourceBadge = (sourceType: string) => {
  const badges: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    pdf_processing: { label: 'PDF', variant: 'default' },
    xml_import: { label: 'XML', variant: 'secondary' },
    web_scraping: { label: 'Web', variant: 'outline' },
  };
  const badge = badges[sourceType] || { label: sourceType, variant: 'outline' };
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
};
```

**Rules:**
- ✅ Consistent badge variants across platform
- ✅ PDF = default (primary color)
- ✅ XML = secondary
- ✅ Web = outline

---

## 6. Stat Cards

### Pattern (AdminStatCard)
```tsx
import { AdminStatCard } from '../AdminStatCard';

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <AdminStatCard
    title="Products"
    value={stats.products}
    icon={Package}
  />
  <AdminStatCard
    title="Chunks"
    value={stats.chunks}
    icon={Grid3X3}
  />
</div>
```

**Rules:**
- ✅ Always use AdminStatCard component for stats
- ✅ Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- ✅ Compact design with icon + title on same line
- ❌ Never create custom stat cards with big icons and spacing

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

