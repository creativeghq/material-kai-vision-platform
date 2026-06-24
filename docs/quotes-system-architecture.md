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
✅ **Accepted → Order + Pre-invoice** - Accepting a quote auto-creates a sales [Order](orders-system.md) (from the quote items) and a draft **pre-invoice**, via the `generate_order_from_quote` trigger (any acceptance path; idempotent)
✅ **Admin Management** - Comprehensive admin interface for quote management

## Database Schema

### Core Tables

#### `quotes` Table

Stores core quote data. Key fields include: `id`, `user_id`, `workspace_id`, `name` (optional user-friendly name), `status` ('draft', 'submitted', 'quoted', 'accepted', 'rejected', 'expired'), `status_tag_id`, `total_items`, `notes`, `custom_request_text`, `expires_at` (defaults to 30 days), `last_activity_at`, `created_at`, `updated_at`, and `submitted_at`.

#### `quote_items` Table

Stores quote line items. Key fields include: `id`, `quote_id`, `product_id`, `quantity`, `width`, `height`, `area`, `unit`, `notes`, and `added_from` ('search', 'agent', '3d_generation', 'manual', 'product_page', 'moodboard'). A unique constraint prevents duplicate products in the same quote.

### Status Tags System

#### `status_tags` Table

Stores custom status tags. Fields include `id`, `name`, `color` (hex code), `description`, `is_system` (system tags cannot be deleted), and `display_order`. Default system tags are: `pending`, `in_progress`, `quoted`, `accepted`, `rejected`, and `expired`.

### Upsells/Extras System

#### `upsells` Table

Admin-managed upsell items with `id`, `name`, `description`, `price`, `is_active`, and `display_order`.

#### `quote_upsells` Table (Junction)

Links upsells to quotes. The `customer_accepted` field is `null` for pending, `true` for accepted, and `false` for rejected. A unique constraint prevents duplicate upsell entries per quote.

### Project Timeline System

#### `timeline_steps` Table

Defines the ordered steps in the project timeline: Quote Accepted, Materials Ordered, Materials Received, Production Started, Quality Check, Packaging, Shipped, Delivered, Project Completed.

#### `quote_timeline` Table

Tracks progress for each quote through the timeline steps. The `status` field can be 'pending', 'in_progress', 'completed', or 'skipped'. Includes `notes`, `completed_at`, and a unique constraint per quote/step combination.

## Auto-Expiration System

### How It Works

1. **Admin-Configurable Expiration**: Admins can set expiration days via System Settings page
2. **Default Expiration**: New quotes expire after X days (default: 30 days, configurable)
3. **Activity Extension**: Any activity (adding/removing items) extends expiration by X days
4. **Auto-Expire Function**: `expire_old_quotes()` marks expired quotes
5. **Scheduled Job**: Should be called daily via cron or Edge Function

### System Settings Table

The `system_settings` table stores platform-wide configuration using a `setting_key`/`setting_value` JSONB pattern. The default setting for `quote_expiration_days` is `30`.

### Admin Configuration

Admins can update the expiration days via:
- **UI**: Navigate to `/admin/system-settings`
- **Direct Update**: Update `system_settings` table where `setting_key = 'quote_expiration_days'`

### Triggers

- **`set_quote_expiration`** - Sets initial expiration when quote is created (uses current setting)
- **`update_quote_activity`** - Extends expiration when items are added/updated (uses current setting)
- **`update_quote_total_items`** - Keeps total_items count accurate

### Helper Functions

- `get_quote_expiration_days()` — Returns the current expiration days setting as an INTEGER (default: 30)
- `expire_old_quotes()` — Marks expired quotes; should be called daily; returns count of expired quotes

## Frontend Architecture

### Services

**`QuotesService`** (`src/modules/quotes/services/QuotesService.ts`)

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

Use `quotesService.createQuote()` with an optional name and notes to create a new quote.

#### 2. Add Materials or Custom Request

Either add specific products via `quotesService.addItem()` with quantity, dimensions, area, unit, notes, and source tracking — or add free-text custom requests via `quotesService.updateQuote()` with a `custom_request_text` field.

#### 3. Submit Quote Request

Call `quotesService.submitQuote()` with the quote ID and an optional message.

#### 4. Review Quote with Extras
- Admin attaches upsells/extras to quote
- Customer views quote with extras
- Customer accepts/rejects each extra
- All extras must be decided before quote acceptance

#### 5. Accept Quote

The system validates all extras are accepted or rejected, then changes quote status to 'accepted' and automatically initializes the project timeline.

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

Use `quotesService.updateQuoteStatusTag()` with the quote ID and status tag ID.

#### 3. Attach Upsells/Extras

Use `quotesService.addUpsellToQuote()` with the quote ID and upsell ID.

#### 4. Monitor Customer Response
- View which extras were accepted/rejected
- See customer acceptance status

#### 5. Update Project Timeline

Use `quotesService.updateTimelineStep()` with the timeline entry ID, status, and notes.

#### 6. Manage System Configuration
- Create/edit status tags at `/admin/status-tags`
- Manage upsell items at `/admin/upsells`
- Configure timeline steps at `/admin/timeline-steps`

## Integration Points

### Search Results

Place `AddToQuoteButton` on product cards with `productId`, `productName`, `productImage`, and appropriate variant/size props.

### Agent Responses

Map over returned materials and render `AddToQuoteButton` for each with `productId`, `productName`, `defaultQuantity`, and `added_from="agent"`.

### 3D Generation Results

Render `AddToQuoteButton` with `added_from="3d_generation"` on generated material cards.

## Quote Expiration Management

### Check Expiration Status

Use `quotesService.getExpirationInfo()` to get `days_until_expiration` and `is_expired` for a given quote.

### Extend Expiration
Any activity automatically extends expiration:
- Adding items
- Removing items
- Updating items

### Manual Cleanup
Create a Supabase Edge Function to run daily that calls the `expire_old_quotes` RPC and returns the count of expired quotes.

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

## FF&E Specification Fields

The quote items table includes FF&E (Furniture, Fixtures & Equipment) specification fields for interior design procurement workflows.

### New Fields on `quote_items`

| Field | Type | Description |
|-------|------|-------------|
| `room` | text | Room or area assignment (e.g., "Living Room", "Master Bedroom") |
| `dimensions` | text | Product dimensions in W×H×D format (e.g., "120×60×45") |
| `installation_requirements` | text | Installation notes (e.g., "Requires wall anchoring, electrical outlet within 1m") |
| `delivery_date` | date | Expected delivery date for procurement tracking |

### UI Integration

- **QuoteItemsList**: Room shown as a dedicated column. Dimensions appended to product name (e.g., "Marble Slab, 120×60"). Expandable detail row shows notes, installation requirements, and delivery date.
- **AddProductsSheet**: FF&E section in custom product form with room, dimensions, installation, and delivery fields. Catalog products have a room field in the selection table.
- **PDF Generation**: Room column in items table. Dimensions in product name. "SPECIFICATIONS & DELIVERY" section at bottom of items pages listing installation requirements and delivery dates per item.

### Service Methods

`QuotesService.addItem()`, `addCustomItem()`, and `updateItem()` all accept the FF&E fields:
- `room?: string`
- `dimensions?: string`
- `installation_requirements?: string`
- `delivery_date?: string`
