# Product Management System

## Overview

The Product Management System provides comprehensive tools for creating, editing, viewing, and managing material products extracted from PDF catalogs or created manually. Products are the core entities that connect chunks, images, embeddings, and metadata into cohesive material records.

## Features

### 1. Product CRUD Operations

#### Create Product
- **Location**: Admin → Knowledge Base → Products Tab → "Create Product" button
- **Access**: Admin users only
- **Features**:
  - Product name (required)
  - Short description (150 character limit with counter)
  - Full description (unlimited)
  - Category selection
  - Status (draft, published, archived)
  - Dynamic properties (key-value pairs)
  - Dynamic specifications (key-value pairs)
  - Dynamic metadata (key-value pairs)

#### Edit Product
- **Location**: Admin → Knowledge Base → Products Tab → Edit button on product card
- **Access**: Admin users only
- **Features**:
  - Pre-populated form with existing product data
  - All fields editable
  - Preserves relationships (chunks, images, embeddings)

#### Delete Product
- **Location**: Admin → Knowledge Base → Products Tab → Delete button on product card
- **Access**: Admin users only
- **Features**:
  - Confirmation dialog with warnings
  - Shows relationship counts (chunks, images, metafields)
  - Safe deletion with error handling

#### View Product Details
- **Location**: Admin → Knowledge Base → Products Tab → "View Details" button on product card
- **Access**: Admin users only
- **Features**:
  - Full product information display
  - Basic info (name, description, category, status)
  - Properties, specifications, metadata
  - Relationship counts (source chunks, images, metafield values)
  - Embedding information (model, generation status)

### 2. Product Data Model

```typescript
interface Product {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  properties: Record<string, unknown> | null;
  specifications: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  status: 'draft' | 'published' | 'archived';
  created_from_type: 'pdf_extraction' | 'manual' | 'import';
  created_at: string;
  updated_at: string;
}
```

### 3. Product Relationships

Products maintain relationships with:
- **Chunks**: Source text chunks from PDF processing
- **Images**: Associated product images
- **Embeddings**: Vector embeddings for search (6 types: text, image, hybrid, color, texture, pattern)
- **Metafield Values**: Custom metadata fields

### 4. Product Creation Sources

Products can be created from:
1. **PDF Extraction**: Automatically detected during PDF processing using AI models
2. **Manual Creation**: Created by admins through the Product Form Modal
3. **Import**: Imported from XML or web scraping

## User Interface

### Product Form Modal

**Component**: `src/components/Admin/ProductFormModal.tsx`

**Features**:
- Dual mode: Create or Edit
- Form validation (product name required)
- Dynamic field management:
  - Add/remove property pairs
  - Add/remove specification pairs
  - Add/remove metadata pairs
- Character counter for short description
- Status selection dropdown
- Save/Cancel actions

**Usage**:
```typescript
<ProductFormModal
  open={productFormOpen}
  onOpenChange={setProductFormOpen}
  product={selectedProduct}
  onSave={handleSaveProduct}
  mode="create" // or "edit"
/>
```

### Product Delete Confirmation

**Component**: `src/components/Admin/ProductDeleteConfirmation.tsx`

**Features**:
- Alert dialog for safe deletion
- Shows product name
- Displays relationship warnings
- Loading state during deletion
- Error handling with toast notifications

**Usage**:
```typescript
<ProductDeleteConfirmation
  open={deleteConfirmOpen}
  onOpenChange={setDeleteConfirmOpen}
  product={productToDelete}
  onConfirm={handleConfirmDelete}
/>
```

### Product Preview Modal

**Component**: `src/components/Admin/ProductPreviewModal.tsx`

**Features**:
- Comprehensive product information display
- Organized sections:
  - Full Description
  - Basic Information (category, status, creation source)
  - Properties (key-value display)
  - Specifications (key-value display)
  - Metadata (key-value display)
  - Relationships (chunk count, image count, metafield count)
  - Embeddings (model, status, generation date)

**Usage**:
```typescript
<ProductPreviewModal
  open={previewModalOpen}
  onOpenChange={setPreviewModalOpen}
  product={productToPreview}
/>
```

## Integration with Knowledge Base

Products are integrated into the Material Knowledge Base component:

**Location**: `src/components/Admin/MaterialKnowledgeBase.tsx`

**Products Tab Features**:
- Product count badge
- "Create Product" button
- Product grid/list view
- Product cards with:
  - Product name and description
  - Category and status badges
  - Property count, specification count
  - Chunk count, image count
  - Action buttons (View Details, Edit, Delete)

## API Integration

Products are managed through Supabase:

```typescript
// Create product
const { data, error } = await supabase
  .from('products')
  .insert({
    name: 'Product Name',
    description: 'Description',
    workspace_id: workspaceId,
    created_from_type: 'manual',
    // ... other fields
  })
  .select()
  .single();

// Update product
const { data, error } = await supabase
  .from('products')
  .update({ name: 'New Name' })
  .eq('id', productId)
  .select()
  .single();

// Delete product
const { error } = await supabase
  .from('products')
  .delete()
  .eq('id', productId);

// Get products
const { data, error } = await supabase
  .from('products')
  .select('*')
  .eq('workspace_id', workspaceId)
  .order('created_at', { ascending: false });
```

## Best Practices

1. **Product Names**: Use clear, descriptive names that identify the material
2. **Descriptions**: 
   - Short description: Brief summary (max 150 chars)
   - Full description: Detailed information including applications, features
3. **Properties**: Use for physical characteristics (size, color, finish, pattern)
4. **Specifications**: Use for technical details (thermal properties, safety ratings)
5. **Metadata**: Use for additional context (manufacturer, collection, page numbers)
6. **Status Management**:
   - `draft`: Work in progress, not visible to end users
   - `published`: Complete and visible to end users
   - `archived`: Historical record, not actively used

## Workflow

### Manual Product Creation
1. Navigate to Admin → Knowledge Base → Products Tab
2. Click "Create Product" button
3. Fill in product information
4. Add properties, specifications, metadata as needed
5. Set status (draft/published/archived)
6. Click "Save Product"

### Editing Existing Products
1. Navigate to Admin → Knowledge Base → Products Tab
2. Find the product to edit
3. Click "Edit" button
4. Modify fields as needed
5. Click "Save Changes"

### Deleting Products
1. Navigate to Admin → Knowledge Base → Products Tab
2. Find the product to delete
3. Click "Delete" button
4. Review warnings in confirmation dialog
5. Click "Delete" to confirm

## Related Documentation

- [Materials Page](./materials-page.md) - User-facing materials catalog
- [Chunk Management](./chunk-management.md) - Managing text chunks
- [Knowledge Base](./knowledge-base.md) - Admin knowledge base overview
- [PDF Processing](./pdf-processing.md) - Automatic product extraction

