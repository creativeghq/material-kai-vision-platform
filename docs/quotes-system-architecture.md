# Quotes System Architecture

## Overview

The Quotes System allows users to create multiple independent quotes, add materials to them from various sources (search, agents, 3D generation), and submit them as quote requests to receive pricing proposals.

## Key Features

✅ **Multiple Quotes** - Users can have multiple active quotes simultaneously  
✅ **Independent Quotes** - Each quote is completely independent (not tied to a cart)  
✅ **Auto-Expiration** - Quotes expire after 30 days of inactivity  
✅ **Activity Tracking** - Any activity extends the expiration by 30 days  
✅ **Source Tracking** - Track where each material was added from  
✅ **Quote Requests** - Convert quotes to formal quote requests  

## Database Schema

### `quotes` Table
```sql
CREATE TABLE quotes (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    workspace_id UUID REFERENCES workspaces(id),
    name TEXT,  -- Optional user-friendly name
    status TEXT DEFAULT 'draft',  -- 'draft', 'submitted', 'quoted', 'accepted', 'rejected', 'expired'
    total_items INTEGER DEFAULT 0,
    notes TEXT,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ
);
```

### `quote_items` Table
```sql
CREATE TABLE quote_items (
    id UUID PRIMARY KEY,
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    notes TEXT,
    added_from TEXT,  -- 'search', 'agent', '3d_generation', 'manual', 'product_page'
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(quote_id, product_id)  -- Prevent duplicate products in same quote
);
```

### `quote_requests` Table
```sql
-- Modified to reference quotes instead of carts
ALTER TABLE quote_requests 
    DROP COLUMN cart_id,
    ADD COLUMN quote_id UUID REFERENCES quotes(id);
```

## Auto-Expiration System

### How It Works

1. **Admin-Configurable Expiration**: Admins can set expiration days via System Settings page
2. **Default Expiration**: New quotes expire after X days (default: 30 days, configurable)
3. **Activity Extension**: Any activity (adding/removing items) extends expiration by X days
4. **Auto-Expire Function**: `expire_old_quotes()` marks expired quotes
5. **Scheduled Job**: Should be called daily via cron or Edge Function

### System Settings Table

The `system_settings` table stores platform-wide configuration:

```sql
CREATE TABLE system_settings (
    id UUID PRIMARY KEY,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Default setting
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('quote_expiration_days', '30'::jsonb, 'Number of days of inactivity before a draft quote expires');
```

### Admin Configuration

Admins can update the expiration days via:
- **UI**: Navigate to `/admin/system-settings`
- **Direct Update**: Update `system_settings` table where `setting_key = 'quote_expiration_days'`

### Triggers

- **`set_quote_expiration`** - Sets initial expiration when quote is created (uses current setting)
- **`update_quote_activity`** - Extends expiration when items are added/updated (uses current setting)
- **`update_quote_total_items`** - Keeps total_items count accurate

### Helper Function

```sql
-- Get current expiration days setting
SELECT get_quote_expiration_days(); -- Returns INTEGER (default: 30)
```

### Manual Expiration

```sql
-- Call this function daily to expire old quotes
SELECT expire_old_quotes(); -- Returns count of expired quotes
```

## Frontend Architecture

### Services

**`QuotesService`** (`src/services/quotes/QuotesService.ts`)
- `createQuote()` - Create new quote
- `getQuotes()` - List user's quotes
- `getQuote()` - Get quote with items
- `updateQuote()` - Update quote details
- `deleteQuote()` - Delete draft quote
- `addItem()` - Add material to quote
- `updateItem()` - Update item quantity/notes
- `removeItem()` - Remove item from quote
- `submitQuote()` - Convert to quote request
- `getExpirationInfo()` - Check expiration status

### Components

**`AddToQuoteButton`** - Reusable button for adding materials
- Can be placed on any product card
- Opens modal to select/create quote
- Supports custom styling and variants

**`AddToQuoteModal`** - Quote selection/creation modal
- Lists user's draft quotes
- Create new quote on the fly
- Set quantity and notes
- Shows product preview

**`QuoteManagementSidebar`** - Main quote management UI
- View all quotes
- Search quotes
- Create new quotes
- Delete quotes
- Navigate to quote details

**`QuoteBuilderView`** - Quote detail and material management
- View all materials in quote
- Add/remove materials
- Edit quantities and notes
- Send quote request

## User Workflow

### 1. Create Quote
```typescript
const quote = await quotesService.createQuote({
  name: 'Office Renovation Materials',
  notes: 'Materials for main office renovation'
});
```

### 2. Add Materials
```typescript
// From product page
await quotesService.addItem({
  quote_id: quote.id,
  product_id: 'product-uuid',
  quantity: 5,
  notes: 'Need matte finish',
  added_from: 'product_page'
});

// From agent response
await quotesService.addItem({
  quote_id: quote.id,
  product_id: 'product-uuid',
  quantity: 2,
  added_from: 'agent'
});

// From 3D generation
await quotesService.addItem({
  quote_id: quote.id,
  product_id: 'product-uuid',
  quantity: 10,
  added_from: '3d_generation'
});
```

### 3. Submit Quote Request
```typescript
await quotesService.submitQuote(quote.id, 'Please provide pricing for these materials');
```

### 4. Admin Creates Proposal
- Admin views quote request
- Adds pricing to each material
- Creates proposal with totals
- Sends proposal to user

### 5. User Reviews Proposal
- User receives notification
- Views proposal with pricing
- Accepts or rejects proposal

## Integration Points

### Search Results
```tsx
<AddToQuoteButton
  productId={product.id}
  productName={product.name}
  productImage={product.image}
  variant="outline"
  size="sm"
/>
```

### Agent Responses
```tsx
{materials.map(material => (
  <MaterialCard key={material.id}>
    <MaterialInfo {...material} />
    <AddToQuoteButton
      productId={material.id}
      productName={material.name}
      defaultQuantity={1}
      added_from="agent"
    />
  </MaterialCard>
))}
```

### 3D Generation Results
```tsx
<AddToQuoteButton
  productId={generatedMaterial.id}
  productName={generatedMaterial.name}
  added_from="3d_generation"
/>
```

## Quote Expiration Management

### Check Expiration Status
```typescript
const info = await quotesService.getExpirationInfo(quoteId);
console.log(`Expires in ${info.days_until_expiration} days`);
console.log(`Is expired: ${info.is_expired}`);
```

### Extend Expiration
Any activity automatically extends expiration:
- Adding items
- Removing items
- Updating items

### Manual Cleanup
Create a Supabase Edge Function to run daily:
```typescript
// supabase/functions/expire-quotes/index.ts
Deno.serve(async () => {
  const { data, error } = await supabase.rpc('expire_old_quotes');
  return new Response(JSON.stringify({ expired_count: data }));
});
```

## Security (RLS Policies)

- Users can only view/edit their own quotes
- Only draft quotes can be modified
- Submitted quotes are read-only
- Quote items inherit quote permissions

## Implementation Status

### ✅ Completed - Core Quote System

1. ✅ **Database Schema** - Created `quotes`, `quote_items`, `system_settings` tables
2. ✅ **Migration Executed** - All tables, triggers, functions, and RLS policies created
3. ✅ **QuotesService** - Complete service with all CRUD operations
4. ✅ **AddToQuoteButton** - Reusable button component
5. ✅ **AddToQuoteModal** - Quote selection/creation modal (uses QuotesService)
6. ✅ **QuoteManagementSidebar** - Main quote management UI (uses QuotesService)
   - View all draft quotes
   - Search quotes by name or ID
   - Create new quotes
   - Delete quotes
   - Expiration status indicators (expired, expiring soon, active)
   - Navigate to quote details
7. ✅ **QuoteBuilderView** - Quote detail and material management (uses QuotesService)
   - View all materials in quote
   - Update material quantities inline
   - Remove materials
   - Add notes
   - Expiration countdown display
   - Submit quote request
8. ✅ **Admin Configuration** - SystemSettingsPage for managing expiration days
9. ✅ **Dynamic Expiration** - Expiration days configurable by admin via UI
10. ✅ **Activity Tracking** - Automatic expiration extension on any activity
11. ✅ **Helper Functions** - `get_quote_expiration_days()`, `expire_old_quotes()`
12. ✅ **Expiration UI** - Visual indicators for quote expiration status

### ⏳ Pending - Integration & Advanced Features

13. ⏳ Integrate AddToQuoteButton into search results
14. ⏳ Integrate AddToQuoteButton into agent responses
15. ⏳ Integrate AddToQuoteButton into 3D generation
16. ⏳ Create admin quote management interface (view requests, add pricing)
17. ⏳ Implement proposal PDF/HTML generation
18. ⏳ Create daily expiration cron job (Supabase Edge Function)

## Admin Access

**System Settings Page**: `/admin/system-settings`

Admins can configure:
- Quote expiration days (how long before inactive quotes expire)
- Future settings can be added to the same interface

