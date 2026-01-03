# Vision-Guided Extraction UI Implementation

## Overview
This document describes the UI components and features added to display vision-guided extraction metadata for product images in the Material KAI platform.

## Components Created

### 1. ExtractionMethodBadge Component
**Location:** `src/components/Images/ExtractionMethodBadge.tsx`

A reusable badge component that visually indicates how an image was extracted from a PDF:

#### Features:
- **Vision-Guided Badge**: Green badge with eye icon for AI-detected images
- **PyMuPDF Badge**: Gray badge with document icon for traditional extraction
- **Confidence Display**: Shows detection confidence percentage for vision-guided images
- **Tooltip**: Detailed information on hover including:
  - Extraction method name
  - Vision provider (e.g., "openai")
  - Vision model (e.g., "gpt-4o-mini")
  - Detection confidence score
- **Size Variants**: `sm`, `md`, `lg` for different contexts
- **Compact Icon Version**: `ExtractionMethodIcon` for minimal spaces

#### Props:
```typescript
interface ExtractionMethodBadgeProps {
  extractionMethod?: string | null;      // 'vision_guided' or 'pymupdf'
  detectionConfidence?: number | null;   // 0.0 to 1.0
  visionProvider?: string | null;        // e.g., 'openai'
  visionModel?: string | null;           // e.g., 'gpt-4o-mini'
  size?: 'sm' | 'md' | 'lg';
  showConfidence?: boolean;
  className?: string;
}
```

## Integration Points

### 1. ImagesTab Component
**Location:** `src/components/Admin/MaterialsData/ImagesTab.tsx`

#### Image Grid View:
- Added `ExtractionMethodBadge` to each image card
- Displays alongside image type and source badges
- Shows extraction method and confidence at a glance

#### Image Detail Modal:
- **Classification Section**: Shows extraction method badge prominently
- **New Vision-Guided Extraction Card**: Displays when `extraction_method === 'vision_guided'`
  - Product name (if available)
  - Detection confidence percentage
  - Bounding box coordinates
  - Vision provider
  - Vision model

### 2. MaterialKnowledgeBase Component
**Location:** `src/components/Admin/MaterialKnowledgeBase.tsx`

#### Images Tab - Grid View:
- Added `ExtractionMethodBadge` to image cards
- Positioned with image type and confidence badges

#### Image Detail Modal:
- Added extraction method badge to "Basic Information" section
- Shows extraction method alongside type, page, and confidence

## Visual Design

### Color Scheme:
- **Vision-Guided**: Green theme (`bg-green-100`, `text-green-800`, `border-green-300`)
  - Indicates AI-powered, intelligent extraction
  - Eye icon for visual recognition
- **PyMuPDF**: Gray theme (`bg-gray-100`, `text-gray-700`, `border-gray-300`)
  - Indicates traditional PDF extraction
  - Document icon for standard processing

### Icons:
- **Vision-Guided**: `Eye` icon from lucide-react
- **PyMuPDF**: `FileText` icon from lucide-react
- **Confidence**: `Sparkles` icon for AI confidence scores

## Database Fields Used

The components read the following fields from the `product_images` table:

```sql
- extraction_method: text          -- 'vision_guided' or 'pymupdf'
- detection_confidence: numeric    -- 0.0 to 1.0
- vision_provider: text            -- e.g., 'openai'
- vision_model: text               -- e.g., 'gpt-4o-mini'
- product_name: text               -- Detected product name
- bbox: jsonb                      -- Bounding box coordinates
```

## User Benefits

1. **Transparency**: Users can see exactly how each image was extracted
2. **Quality Indicators**: Confidence scores help assess extraction reliability
3. **Debugging**: Easy to identify which images used AI vs traditional extraction
4. **Trust**: Detailed metadata builds confidence in the extraction process
5. **Filtering**: Future enhancement could allow filtering by extraction method

## Future Enhancements

1. **Filtering**: Add filter dropdown to show only vision-guided or PyMuPDF images
2. **Statistics**: Dashboard showing % of images extracted via each method
3. **Comparison View**: Side-by-side comparison of extraction methods
4. **Confidence Threshold**: Highlight low-confidence extractions for review
5. **Re-extraction**: Button to re-process images with different method
6. **Batch Operations**: Bulk re-classify or re-extract images

## Testing Checklist

- [x] Badge displays correctly for vision-guided images
- [x] Badge displays correctly for PyMuPDF images
- [x] Confidence score shows when available
- [x] Tooltip shows detailed information
- [x] Badge integrates into ImagesTab grid view
- [x] Badge integrates into ImagesTab detail modal
- [x] Badge integrates into MaterialKnowledgeBase grid view
- [x] Badge integrates into MaterialKnowledgeBase detail modal
- [x] Vision-Guided Extraction card shows in detail modal
- [x] All metadata fields display correctly

## Code Quality

- ✅ TypeScript types defined
- ✅ Reusable component design
- ✅ Consistent with existing UI patterns
- ✅ Accessible (tooltips, semantic HTML)
- ✅ Responsive design
- ✅ Dark mode compatible
- ✅ No breaking changes to existing code

