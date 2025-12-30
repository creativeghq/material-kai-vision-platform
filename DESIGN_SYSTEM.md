# Material KAI Vision Platform - Design System

## Global Design Patterns

This document defines the consistent design patterns used across the entire platform.

---

## 1. Tabs Component

### Global Styling (src/components/ui/tabs.tsx)
```tsx
<TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
  <TabsTrigger>Tab 1</TabsTrigger>
  <TabsTrigger>Tab 2</TabsTrigger>
</TabsList>
```

**Rules:**
- ✅ Always use `bg-muted` background (defined in tabs.tsx)
- ✅ Standard height: `h-10`
- ✅ Standard border radius: `rounded-md`
- ❌ Never override with `bg-transparent` unless absolutely necessary for specific UI patterns

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

### Pattern for Table Tabs
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Column 1</TableHead>
          <TableHead>Column 2</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Content</TableCell>
          <TableCell>Content</TableCell>
          <TableCell className="text-right">
            <Button variant="ghost" size="sm">
              <Eye className="h-4 w-4" />
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

**Rules:**
- ✅ CardContent must have `className="p-0"` for tables
- ✅ NO wrapper divs around Table (no `<div className="rounded-md border">`)
- ✅ NO fixed column widths on TableHead (let table auto-size)
- ✅ NO wrapper divs inside TableCell (direct content only)
- ✅ First column typically has `className="font-medium"`
- ✅ Actions column has `className="text-right"`
- ✅ Table component has built-in overflow handling

---

## 4. Image Grids

### Pattern
```tsx
<CardContent>
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {items.map((item) => (
      <Card key={item.id} className="overflow-hidden">
        <CardContent className="p-0">
          <img src={item.url} alt={item.alt} className="w-full h-48 object-cover" />
          <div className="p-4 space-y-2">
            <p className="text-sm font-medium truncate">{item.title}</p>
            <Button variant="outline" size="sm" className="w-full">
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
</CardContent>
```

**Rules:**
- ✅ Responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- ✅ Fixed image height: `h-48` (not aspect-square for consistency)
- ✅ Simple structure: img → div.p-4 → content
- ✅ Use `truncate` for text overflow, not complex flex layouts
- ✅ CardContent keeps default padding (NOT p-0 like tables)

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

## Implementation Checklist

When creating new admin pages or tabs:

- [ ] Use global tabs styling (bg-muted, h-10, rounded-md)
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

