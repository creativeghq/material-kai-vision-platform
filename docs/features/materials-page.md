# Materials Page

## Overview

The Materials Page is a user-facing catalog that displays all products from the knowledge base in a searchable, filterable interface. Unlike the admin Knowledge Base, this page is accessible to all authenticated users and provides a streamlined experience for browsing and discovering materials.

## Access

- **URL**: `/materials`
- **Access Level**: All authenticated users
- **Navigation**: Available from main navigation menu

## Features

### 1. Materials Catalog Display

The Materials Page integrates the `MaterialCatalogListing` component to provide a comprehensive catalog view.

**Component**: `src/pages/Materials.tsx`

**Features**:
- Product grid/list view
- Product cards with images and metadata
- Category filtering
- Search functionality
- Sorting options
- Responsive design

### 2. Product Information Display

Each product card shows:
- **Product Image**: Thumbnail or placeholder
- **Product Name**: Clear, descriptive title
- **Description**: Brief product description
- **Category**: Material category badge
- **Properties**: Key material properties
- **Metadata**: Additional information (finish, size, application)

### 3. Search and Filter

**Search**:
- Full-text search across product names and descriptions
- Real-time search results
- Search query highlighting

**Filters**:
- Category filter (tiles, panels, flooring, etc.)
- Property filters (finish, size, application)
- Metadata filters (custom fields)

**Sorting**:
- Name (A-Z, Z-A)
- Date added (newest, oldest)
- Category
- Custom sorting options

### 4. View Modes

**Grid View** (Default):
- Card-based layout
- Visual emphasis on product images
- Compact information display
- Responsive grid (1-4 columns based on screen size)

**List View**:
- Row-based layout
- Detailed information display
- Easier scanning of multiple products
- Better for text-heavy content

## User Interface

### Page Layout

```
┌─────────────────────────────────────────────────────────┐
│ Header                                                  │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 🏢 Materials Catalog              [245 Materials]│   │
│ │ Browse and search through our comprehensive     │   │
│ │ materials database                              │   │
│ └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│ Main Content                                            │
│ ┌─────────────────────────────────────────────────┐   │
│ │ MaterialCatalogListing Component                │   │
│ │                                                  │   │
│ │ [Search] [Filters] [Sort] [View Mode]          │   │
│ │                                                  │   │
│ │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │   │
│ │ │ Prod │ │ Prod │ │ Prod │ │ Prod │           │   │
│ │ │  1   │ │  2   │ │  3   │ │  4   │           │   │
│ │ └──────┘ └──────┘ └──────┘ └──────┘           │   │
│ │                                                  │   │
│ │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │   │
│ │ │ Prod │ │ Prod │ │ Prod │ │ Prod │           │   │
│ │ │  5   │ │  6   │ │  7   │ │  8   │           │   │
│ │ └──────┘ └──────┘ └──────┘ └──────┘           │   │
│ └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Empty State

When no materials are available:
```
┌─────────────────────────────────────────┐
│                                         │
│           📦                            │
│                                         │
│     No Materials Found                  │
│                                         │
│  There are no materials in your         │
│  catalog yet. Process PDFs or import    │
│  materials to get started.              │
│                                         │
│         [Refresh]                       │
│                                         │
└─────────────────────────────────────────┘
```

### Loading State

While loading materials:
```
┌─────────────────────────────────────────┐
│                                         │
│           ⟳                             │
│                                         │
│  Loading materials catalog...           │
│                                         │
└─────────────────────────────────────────┘
```

## Data Flow

### 1. Page Load
```typescript
// Get current user
const { data: { user } } = await supabase.auth.getUser();

// Get user's workspace
const { data: workspaceData } = await supabase
  .from('workspace_members')
  .select('workspace_id')
  .eq('user_id', user.id)
  .single();

// Load products
const { data: productsData } = await supabase
  .from('products')
  .select('*')
  .eq('workspace_id', workspaceData.workspace_id)
  .order('created_at', { ascending: false });
```

### 2. Data Transformation

Products are transformed from database format to Material format:

```typescript
const transformedMaterials: Material[] = productsData.map((product) => ({
  id: product.id,
  name: product.name,
  description: product.description || '',
  category: product.category_id || 'other',
  properties: {
    ...(product.properties || {}),
  },
  metadata: {
    ...(product.metadata || {}),
    finish: product.properties?.finish,
    size: product.properties?.size,
    installationMethod: product.properties?.installation_method,
    application: product.properties?.application,
  },
  standards: [],
  createdAt: product.created_at,
  updatedAt: product.updated_at,
  thumbnailUrl: product.metadata?.thumbnail_url,
  imageUrl: product.metadata?.image_url,
}));
```

### 3. Display

Materials passed to `MaterialCatalogListing` component:

```typescript
<MaterialCatalogListing
  materials={materials}
  loading={loading}
  onMaterialSelect={handleMaterialSelect}
  onMaterialEdit={handleMaterialEdit}
  showImages={true}
  showMetaFields={true}
  allowFiltering={true}
  allowSorting={true}
  viewMode="grid"
/>
```

## User Interactions

### Selecting a Material

**Action**: Click on a material card

**Result**: 
- Material details displayed (future: detail modal or page)
- Toast notification confirms selection
- Material ID logged for tracking

**Future Enhancement**: Navigate to dedicated material detail page

### Editing a Material

**Action**: Click "Edit" button on material card (if permissions allow)

**Result**:
- Edit modal opens (future implementation)
- Material data pre-populated
- Save changes updates database

**Note**: Currently shows toast notification; full edit functionality planned

### Refreshing Catalog

**Action**: Click "Refresh" button (in empty state)

**Result**:
- Reloads materials from database
- Updates display with latest data
- Shows loading state during refresh

## Integration with MaterialCatalogListing

The Materials Page uses the existing `MaterialCatalogListing` component:

**Component**: `src/components/Materials/MaterialCatalogListing.tsx`

**Props**:
```typescript
interface MaterialCatalogListingProps {
  materials: Material[];
  loading?: boolean;
  onMaterialSelect?: (material: Material) => void;
  onMaterialEdit?: (material: Material) => void;
  showImages?: boolean;
  showMetaFields?: boolean;
  allowFiltering?: boolean;
  allowSorting?: boolean;
  viewMode?: 'grid' | 'list';
}
```

**Features Provided**:
- Responsive grid/list layout
- Image display with fallbacks
- Category badges
- Property display
- Metadata display
- Search and filter UI
- Sort controls
- View mode toggle

## Material Data Model

```typescript
interface Material {
  id: string;
  name: string;
  description: string;
  category: string;
  properties: {
    finish?: string;
    size?: string;
    color?: string;
    pattern?: string;
    texture?: string;
    // ... additional properties
  };
  metadata: {
    finish?: string;
    size?: string;
    installationMethod?: string;
    application?: string;
    thumbnailUrl?: string;
    imageUrl?: string;
    // ... additional metadata
  };
  standards: string[];
  createdAt: string;
  updatedAt: string;
  thumbnailUrl?: string;
  imageUrl?: string;
}
```

## Best Practices

### For Users

1. **Use Search**: Quickly find materials by name or description
2. **Apply Filters**: Narrow down results by category or properties
3. **Switch Views**: Use grid view for visual browsing, list view for detailed comparison
4. **Check Metadata**: Review properties and specifications before selection

### For Administrators

1. **Ensure Product Quality**: Complete product information improves user experience
2. **Add Images**: Products with images are more engaging
3. **Categorize Properly**: Accurate categories enable effective filtering
4. **Maintain Metadata**: Rich metadata improves searchability

## Performance Considerations

### Data Loading
- Products loaded once on page mount
- No pagination (loads all products)
- Suitable for catalogs up to ~1000 products
- Future: Implement pagination for larger catalogs

### Search and Filter
- Client-side filtering for instant results
- No server round-trips for filter changes
- Efficient for current data volumes

### Image Loading
- Lazy loading for product images
- Placeholder images for missing thumbnails
- Optimized image sizes

## Future Enhancements

1. **Material Detail Page**: Dedicated page for each material with full information
2. **Advanced Filters**: More filter options (price range, availability, etc.)
3. **Comparison Tool**: Compare multiple materials side-by-side
4. **Favorites**: Save favorite materials for quick access
5. **Export**: Export material lists to PDF or Excel
6. **Pagination**: Support for larger catalogs (1000+ products)
7. **Infinite Scroll**: Alternative to pagination for better UX

## Related Documentation

- [Product Management](./product-management.md) - Admin product management
- [Knowledge Base](./knowledge-base.md) - Admin knowledge base overview
- [Search System](./search-system.md) - Search functionality
- [PDF Processing](./pdf-processing.md) - How materials are created from PDFs

