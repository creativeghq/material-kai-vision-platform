# Quotes System Architecture

## Overview

The Quotes System is a comprehensive quote management platform that allows users to create quotes, add materials, submit quote requests, and track project timelines. Admins can manage quotes, add custom status tags, attach upsells/extras, and monitor project progress through an interactive timeline system.

## Key Features

✅ **Multiple Quotes** - Users can have multiple active quotes simultaneously
✅ **Independent Quotes** - Each quote is completely independent (not tied to a cart)
✅ **Custom Requests** - Support for text-based custom requests without products
✅ **Auto-Expiration** - Quotes expire after 30 days of inactivity
✅ **Activity Tracking** - Any activity extends the expiration by 30 days
✅ **Source Tracking** - Track where each material was added from
✅ **Quote Requests** - Convert quotes to formal quote requests
✅ **Status Tags** - Custom status tags with colors for quote organization
✅ **Upsells/Extras** - Admin-managed upsell items with customer acceptance tracking
✅ **Project Timeline** - Track project progress through predefined timeline steps
✅ **Quote Acceptance** - Customer quote acceptance with validation workflow
✅ **Admin Management** - Comprehensive admin interface for quote management

## Database Schema

### Core Tables

#### `quotes` Table
```sql
CREATE TABLE quotes (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    workspace_id UUID REFERENCES workspaces(id),
    name TEXT,  -- Optional user-friendly name
    status TEXT DEFAULT 'draft',  -- 'draft', 'submitted', 'quoted', 'accepted', 'rejected', 'expired'
    status_tag_id UUID REFERENCES status_tags(id),  -- Custom status tag
    total_items INTEGER DEFAULT 0,
    notes TEXT,
    custom_request_text TEXT,  -- For text-based custom requests
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ
);
```

#### `quote_items` Table
```sql
CREATE TABLE quote_items (
    id UUID PRIMARY KEY,
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    width NUMERIC,
    height NUMERIC,
    area NUMERIC,
    unit TEXT,
    notes TEXT,
    added_from TEXT,  -- 'search', 'agent', '3d_generation', 'manual', 'product_page', 'moodboard'
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(quote_id, product_id)  -- Prevent duplicate products in same quote
);
```

### Status Tags System

#### `status_tags` Table
```sql
CREATE TABLE status_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,  -- Hex color code
    description TEXT,
    is_system BOOLEAN DEFAULT false,  -- System tags cannot be deleted
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default system tags
INSERT INTO status_tags (name, color, is_system, display_order) VALUES
    ('pending', '#FFA500', true, 1),
    ('in_progress', '#3B82F6', true, 2),
    ('quoted', '#8B5CF6', true, 3),
    ('accepted', '#10B981', true, 4),
    ('rejected', '#EF4444', true, 5),
    ('expired', '#6B7280', true, 6);
```

### Upsells/Extras System

#### `upsells` Table
```sql
CREATE TABLE upsells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `quote_upsells` Table (Junction)
```sql
CREATE TABLE quote_upsells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    upsell_id UUID REFERENCES upsells(id) ON DELETE CASCADE,
    customer_accepted BOOLEAN,  -- null = pending, true = accepted, false = rejected
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(quote_id, upsell_id)
);
```

### Project Timeline System

#### `timeline_steps` Table
```sql
CREATE TABLE timeline_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default timeline steps
INSERT INTO timeline_steps (name, description, display_order) VALUES
    ('Quote Accepted', 'Customer has accepted the quote', 1),
    ('Materials Ordered', 'Materials have been ordered from suppliers', 2),
    ('Materials Received', 'Materials have been received and inspected', 3),
    ('Production Started', 'Production/fabrication has begun', 4),
    ('Quality Check', 'Quality control inspection completed', 5),
    ('Packaging', 'Items are being packaged for shipment', 6),
    ('Shipped', 'Order has been shipped to customer', 7),
    ('Delivered', 'Order has been delivered to customer', 8),
    ('Project Completed', 'Project is complete and closed', 9);
```

#### `quote_timeline` Table
```sql
CREATE TABLE quote_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    timeline_step_id UUID REFERENCES timeline_steps(id),
    status TEXT DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'skipped'
    notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(quote_id, timeline_step_id)
);
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

**Core Quote Operations:**
- `createQuote()` - Create new quote
- `getQuotes()` - List user's quotes
- `getQuote()` - Get quote with items
- `updateQuote()` - Update quote details (including status)
- `deleteQuote()` - Delete draft quote
- `addItem()` - Add material to quote
- `updateItem()` - Update item quantity/notes
- `removeItem()` - Remove item from quote
- `submitQuote()` - Convert to quote request
- `getExpirationInfo()` - Check expiration status

**Status Tags:**
- `getStatusTags()` - Get all status tags
- `createStatusTag()` - Create new status tag
- `updateQuoteStatusTag()` - Assign status tag to quote

**Upsells/Extras:**
- `getUpsells()` - Get all upsell items
- `createUpsell()` - Create new upsell item
- `updateUpsell()` - Update upsell details
- `deleteUpsell()` - Delete upsell item
- `getQuoteUpsells()` - Get upsells attached to quote
- `addUpsellToQuote()` - Attach upsell to quote
- `updateUpsellAcceptance()` - Customer accept/reject upsell
- `removeUpsellFromQuote()` - Remove upsell from quote

**Project Timeline:**
- `getTimelineSteps()` - Get all timeline steps
- `createTimelineStep()` - Create new timeline step
- `getQuoteTimeline()` - Get timeline for quote
- `initializeQuoteTimeline()` - Create timeline entries when quote accepted
- `updateTimelineStep()` - Update step status and notes

### Components

#### Quote Management

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
- Custom request text input
- Expiration countdown display
- Submit quote request

**`QuoteRequestModal`** - Customer quote view
- View quote details and items
- View attached extras/upsells
- Accept/reject individual extras
- Accept quote button with validation
- View project timeline (when accepted)

#### Admin Components

**`QuoteDetailPage`** - Full-page admin quote management
- Tab-based interface (Overview, Items, Extras, Timeline, Activity)
- Status tag assignment
- Attach/remove upsells
- View all quote information
- Customer and workspace details

**`QuoteRequestsAdmin`** - Admin quote list
- View all quote requests
- Filter by status tags
- Navigate to quote details
- Create quotes for users

**`StatusTagsManagement`** - Status tags admin page
- Create/edit/delete custom status tags
- Color picker for tag colors
- System vs custom tag distinction
- Display order management

**`UpsellsManagement`** - Upsells admin page
- Create/edit/delete upsell items
- Set pricing and descriptions
- Active/inactive status toggle
- Display order management

**`TimelineStepsManagement`** - Timeline steps admin page
- Create/edit/delete timeline steps
- Set step descriptions
- Display order management
- Active/inactive status

**`ProjectTimelineModal`** - Project timeline viewer/editor
- Side modal with timeline tree view
- Visual status indicators
- Admin can edit step status and notes
- Customer can view progress (read-only)
- Timeline connector lines
- Completed timestamps

## User Workflows

### Customer Workflow

#### 1. Create Quote
```typescript
const quote = await quotesService.createQuote({
  name: 'Office Renovation Materials',
  notes: 'Materials for main office renovation'
});
```

#### 2. Add Materials or Custom Request
```typescript
// Option A: Add products
await quotesService.addItem({
  quote_id: quote.id,
  product_id: 'product-uuid',
  quantity: 5,
  width: 100,
  height: 200,
  area: 20,
  unit: 'sqm',
  notes: 'Need matte finish',
  added_from: 'product_page'
});

// Option B: Add custom request text
await quotesService.updateQuote(quote.id, {
  custom_request_text: 'Looking for sustainable flooring options for 500 sqm office space'
});

```

#### 3. Submit Quote Request
```typescript
await quotesService.submitQuote(quote.id, 'Please provide pricing for these materials');
```

#### 4. Review Quote with Extras
- Admin attaches upsells/extras to quote
- Customer views quote with extras
- Customer accepts/rejects each extra
- All extras must be decided before quote acceptance

#### 5. Accept Quote
```typescript
// System validates all extras are accepted/rejected
// Changes quote status to 'accepted'
// Automatically initializes project timeline
```

#### 6. Track Project Progress
- View timeline button appears
- Customer can view project progress
- See current step status
- View notes from admin
- Track completion timestamps

### Admin Workflow

#### 1. View Quote Requests
- Navigate to `/admin/quote-requests`
- Filter by status tags
- Click quote to view details

#### 2. Assign Status Tag
```typescript
await quotesService.updateQuoteStatusTag(quoteId, statusTagId);
```

#### 3. Attach Upsells/Extras
```typescript
await quotesService.addUpsellToQuote(quoteId, upsellId);
```

#### 4. Monitor Customer Response
- View which extras were accepted/rejected
- See customer acceptance status

#### 5. Update Project Timeline
```typescript
await quotesService.updateTimelineStep(timelineEntryId, {
  status: 'completed',
  notes: 'Materials delivered on schedule'
});
```

#### 6. Manage System Configuration
- Create/edit status tags at `/admin/status-tags`
- Manage upsell items at `/admin/upsells`
- Configure timeline steps at `/admin/timeline-steps`

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

### Quote Access
- Users can only view/edit their own quotes
- Only draft quotes can be modified
- Submitted quotes are read-only
- Quote items inherit quote permissions

### Admin Access
- Admins can view all quotes
- Admins can manage status tags, upsells, and timeline steps
- Admins can update quote status tags
- Admins can attach/remove upsells
- Admins can update timeline progress

### Status Tags
- Admins can create/edit/delete custom tags
- System tags cannot be deleted
- All users can view status tags

### Upsells
- Admins can manage upsell items
- Users can view upsells attached to their quotes
- Users can accept/reject upsells

### Timeline
- Admins can manage timeline steps
- Admins can update timeline progress
- Users can view timeline for their accepted quotes (read-only)

## Implementation Status

### ✅ Completed - Core Quote System (100%)

1. ✅ **Database Schema** - All tables created
   - `quotes` - Core quote data with status and custom request support
   - `quote_items` - Quote items with dimensions and area
   - `status_tags` - Custom status tags with 6 default system tags
   - `upsells` - Admin-managed upsell items
   - `quote_upsells` - Junction table with customer acceptance tracking
   - `timeline_steps` - 9 predefined timeline steps
   - `quote_timeline` - Timeline progress tracking
   - `system_settings` - Platform configuration

2. ✅ **Migration Executed** - All tables, triggers, functions, and RLS policies created

3. ✅ **QuotesService** - Complete service with 30+ methods
   - Core quote operations (CRUD)
   - Status tags management
   - Upsells management
   - Timeline management
   - Expiration tracking

4. ✅ **Customer Components**
   - `AddToQuoteButton` - Reusable button component
   - `AddToQuoteModal` - Quote selection/creation modal
   - `QuoteManagementSidebar` - Main quote management UI
   - `QuoteBuilderView` - Quote detail and material management
   - `QuoteRequestModal` - Customer quote view with extras and timeline

5. ✅ **Admin Components**
   - `QuoteDetailPage` - Full-page admin quote management with tabs
   - `QuoteRequestsAdmin` - Admin quote list with status filtering
   - `StatusTagsManagement` - Status tags CRUD interface
   - `UpsellsManagement` - Upsells CRUD interface
   - `TimelineStepsManagement` - Timeline steps CRUD interface
   - `ProjectTimelineModal` - Timeline viewer/editor

6. ✅ **Status Tags System**
   - Create/edit/delete custom status tags
   - Color picker for tag colors
   - System vs custom tag distinction
   - Filter quotes by status tags
   - Assign status tags to quotes

7. ✅ **Upsells/Extras System**
   - Admin can create/manage upsell items
   - Admin can attach upsells to quotes
   - Customer can accept/reject each upsell
   - Visual feedback for acceptance status
   - Validation before quote acceptance

8. ✅ **Project Timeline System**
   - 9 predefined timeline steps
   - Auto-initialization when quote accepted
   - Admin can update step status and notes
   - Customer can view progress (read-only)
   - Visual timeline tree with connector lines
   - Status icons and color-coded badges

9. ✅ **Quote Acceptance Workflow**
   - Validation requiring all upsells to be decided
   - Status change to 'accepted'
   - Automatic timeline initialization
   - Timeline button visibility

10. ✅ **Admin Configuration**
    - SystemSettingsPage for managing expiration days
    - Dynamic expiration configuration
    - Activity tracking with automatic extension
    - Helper functions for expiration management

11. ✅ **Custom Request Support**
    - Text-based custom requests without products
    - Custom request text field in quotes table
    - UI support in QuoteBuilderView

12. ✅ **Dimensions and Area Tracking**
    - Width, height, area, and unit fields
    - Support for square meter calculations
    - Display in quote items

### ⏳ Pending - Integration & Advanced Features

13. ⏳ Integrate AddToQuoteButton into search results
14. ⏳ Integrate AddToQuoteButton into agent responses
15. ⏳ Integrate AddToQuoteButton into 3D generation
16. ⏳ Implement proposal PDF/HTML generation
17. ⏳ Create daily expiration cron job (Supabase Edge Function)
18. ⏳ Email notifications for quote status changes
19. ⏳ Activity log for quote history

## Admin Pages

**Quote Management**:
- `/admin/quote-requests` - View all quote requests with filtering
- `/admin/quotes/:id` - Full-page quote detail view

**Configuration**:
- `/admin/status-tags` - Manage custom status tags
- `/admin/upsells` - Manage upsell items
- `/admin/timeline-steps` - Manage timeline steps
- `/admin/system-settings` - Configure quote expiration days

## API Routes

All quote operations are handled through the `QuotesService` which interfaces with Supabase:
- No custom API routes required
- Direct Supabase client integration
- Real-time updates via Supabase subscriptions
- RLS policies enforce security

## Migration Files

**Database Migrations**:
- `supabase/migrations/20250106_quote_system_enhancements.sql` - Status tags, upsells, timeline system

All migrations have been executed and verified in production.

