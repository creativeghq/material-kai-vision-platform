# Products System with Quote/Proposal & Moodboard Integration Plan

**Comprehensive Implementation Plan**  
**Date**: 2025-10-19  
**Status**: Ready for Task Generation

---

## 📋 OVERVIEW

This plan extends the Products system with:
1. **Product Testing Framework** - Comprehensive .js test file
2. **Quote/Proposal System** - Cart → Request → Quote → Proposal
3. **Moodboard Integration** - Products in moodboards + commission tracking
4. **Admin Panel** - Proposal management and pricing

---

## 🎯 PHASE 1: PRODUCT TESTING FRAMEWORK

### 1.1 Test File: `scripts/test-products-complete-flow.js`

**Purpose**: Comprehensive testing of products system

**Test Coverage**:
- ✅ Product creation with all fields
- ✅ Product search by description
- ✅ Product search by relevancy (image + metadata)
- ✅ Product search by metadata fields (category, material type)
- ✅ Product fetch and validation
- ✅ Product update and verification
- ✅ Product deletion
- ✅ Batch operations
- ✅ Error handling

**Test Scenarios**:
1. Create product with complete metadata
2. Search by description (text similarity)
3. Search by image relevancy (CLIP embeddings)
4. Search by metadata (category, material, properties)
5. Verify embeddings are properly stored
6. Verify MIVAA API integration
7. Test pagination and filtering
8. Test concurrent operations

**Output Format**:
```
✅ Product Created: [ID] - [Name]
   - Description: [text]
   - Category: [category]
   - Metadata: [fields]
   - Embeddings: [status]
   - MIVAA Integration: [status]

✅ Search Results: [count] products found
   - Product 1: [name] (relevancy: 0.95)
   - Product 2: [name] (relevancy: 0.87)
   ...

✅ All Tests Passed: [count] tests
```

---

## 🛒 PHASE 2: QUOTE/PROPOSAL SYSTEM

### 2.1 Database Tables (Supabase MCP)

#### `shopping_carts`
```sql
CREATE TABLE shopping_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  workspace_id UUID,
  status VARCHAR DEFAULT 'active', -- active, submitted, quoted, ordered
  total_items INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `cart_items`
```sql
CREATE TABLE cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID REFERENCES shopping_carts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10,2),
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `quote_requests`
```sql
CREATE TABLE quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  cart_id UUID REFERENCES shopping_carts(id),
  workspace_id UUID,
  status VARCHAR DEFAULT 'pending', -- pending, updated, approved, rejected
  items_count INTEGER,
  total_estimated DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `proposals`
```sql
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID REFERENCES quote_requests(id),
  user_id UUID REFERENCES auth.users(id),
  admin_id UUID REFERENCES auth.users(id),
  workspace_id UUID,
  status VARCHAR DEFAULT 'draft', -- draft, sent, accepted, rejected
  items JSONB, -- Array of {product_id, quantity, unit_price, total}
  subtotal DECIMAL(10,2),
  tax DECIMAL(10,2),
  discount DECIMAL(10,2),
  total DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ
);
```

### 2.2 User Flow

```
User → Add Products to Cart
     → Submit Quote Request
     → View Status (Pending/Updated)
     
Admin → View Quote Requests
      → Create Proposal
      → Set Final Prices
      → Send to User
      
User → View Proposal
     → Accept/Reject
```

### 2.3 Edge Functions

#### `shopping-cart-api`
- POST `/api/cart` - Create cart
- GET `/api/cart/:id` - Get cart
- POST `/api/cart/:id/items` - Add item
- DELETE `/api/cart/:id/items/:itemId` - Remove item
- PATCH `/api/cart/:id` - Update cart

#### `quote-request-api`
- POST `/api/quote-requests` - Submit request
- GET `/api/quote-requests` - List requests (admin)
- GET `/api/quote-requests/:id` - Get request
- PATCH `/api/quote-requests/:id` - Update status

#### `proposals-api`
- POST `/api/proposals` - Create proposal (admin)
- GET `/api/proposals` - List proposals
- GET `/api/proposals/:id` - Get proposal
- PATCH `/api/proposals/:id` - Update proposal (pricing)
- PATCH `/api/proposals/:id/send` - Send to user
- PATCH `/api/proposals/:id/accept` - User accepts

---

## 🎨 PHASE 3: MOODBOARD INTEGRATION

### 3.1 Database Tables (Supabase MCP)

#### `moodboard_products`
```sql
CREATE TABLE moodboard_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodboard_id UUID REFERENCES moodboards(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  position_x INTEGER,
  position_y INTEGER,
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `moodboard_quote_requests`
```sql
CREATE TABLE moodboard_quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodboard_id UUID REFERENCES moodboards(id),
  moodboard_creator_id UUID REFERENCES auth.users(id),
  requester_id UUID REFERENCES auth.users(id),
  quote_request_id UUID REFERENCES quote_requests(id),
  commission_percentage DECIMAL(5,2) DEFAULT 10.0,
  commission_amount DECIMAL(10,2),
  status VARCHAR DEFAULT 'pending', -- pending, quoted, accepted, rejected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 User Flow

```
User A → Create Moodboard
       → Add Products
       → Make Public
       
User B → View Public Moodboard
       → "Request Quote for This Moodboard"
       → Auto-create cart with all products
       → Submit quote request
       
User A → View Commission Status
       → See pending/accepted quotes
       → Earn commission on accepted proposals
```

### 3.3 Edge Functions

#### `moodboard-products-api`
- POST `/api/moodboards/:id/products` - Add product
- GET `/api/moodboards/:id/products` - List products
- DELETE `/api/moodboards/:id/products/:productId` - Remove product

#### `moodboard-quote-api`
- POST `/api/moodboards/:id/request-quote` - Request quote
- GET `/api/moodboards/:id/quote-requests` - List requests
- GET `/api/user/commissions` - View commissions

---

## 📊 PHASE 4: ADMIN PANEL ENHANCEMENTS

### 4.1 New Admin Sections

#### Quote Requests Dashboard
- List all pending quote requests
- View cart items
- View customer details
- Create proposal button

#### Proposals Management
- List all proposals (draft, sent, accepted, rejected)
- Edit proposal (change prices, add notes)
- Send proposal to customer
- Track acceptance status

#### Commission Tracking
- View all moodboard commissions
- Filter by status (pending, paid)
- Export commission reports

### 4.2 Components

- `QuoteRequestsPanel.tsx` - List and manage requests
- `ProposalEditor.tsx` - Create/edit proposals
- `CommissionTracker.tsx` - View commissions

---

## 📚 PHASE 5: DOCUMENTATION UPDATES

### 5.1 New Documentation Files

1. **products-quote-proposal-api.md**
   - All API endpoints
   - Request/response examples
   - Error codes

2. **moodboard-products-integration.md**
   - How to add products to moodboards
   - Commission system explanation
   - User flows

3. **shopping-cart-system.md**
   - Cart management
   - Quote request process
   - Proposal workflow

### 5.2 Updates to Existing Docs

- `api-documentation.md` - Add new endpoints
- `platform-functionality.md` - Add quote/proposal section
- `admin-panel-guide.md` - Add new admin features

---

## 🧪 PHASE 6: TESTING STRATEGY

### 6.1 Test File: `scripts/test-products-quote-proposal.js`

**Test Scenarios**:
1. Create product and add to cart
2. Submit quote request
3. Admin creates proposal
4. Admin updates pricing
5. Admin sends proposal
6. User accepts proposal
7. Commission tracking

**Output**:
```
✅ Cart Created: [ID]
✅ Product Added: [product] x [qty]
✅ Quote Request Submitted: [ID]
✅ Proposal Created: [ID]
✅ Pricing Updated: $[amount]
✅ Proposal Sent: [timestamp]
✅ Proposal Accepted: [timestamp]
✅ Commission Tracked: $[amount] (10%)
```

### 6.2 Test File: `scripts/test-moodboard-products.js`

**Test Scenarios**:
1. Create moodboard
2. Add products to moodboard
3. Make moodboard public
4. Request quote from moodboard
5. Verify commission tracking
6. Accept proposal and verify commission

---

## 🔄 IMPLEMENTATION PHASES

### Phase 1: Product Testing (Week 1)
- Create test file
- Test all product operations
- Verify MIVAA integration
- Verify embeddings

### Phase 2: Quote/Proposal System (Week 2-3)
- Create database tables (Supabase MCP)
- Create Edge Functions
- Create frontend services
- Create UI components

### Phase 3: Moodboard Integration (Week 3-4)
- Create database tables (Supabase MCP)
- Create Edge Functions
- Update moodboard components
- Add commission tracking

### Phase 4: Admin Panel (Week 4)
- Create admin components
- Add proposal management
- Add commission tracking
- Add reporting

### Phase 5: Documentation (Week 4)
- Create API documentation
- Update platform docs
- Create user guides

### Phase 6: Testing & Deployment (Week 5)
- Run comprehensive tests
- Fix issues
- Deploy to production

---

## 📋 DELIVERABLES

### Code
- ✅ 1 Product test file
- ✅ 2 Quote/Proposal test files
- ✅ 5 Edge Functions
- ✅ 5 Frontend services
- ✅ 8 React components
- ✅ 3 Database tables (Supabase MCP)

### Documentation
- ✅ 3 New API documentation files
- ✅ 5 Updated existing docs
- ✅ Complete user flows
- ✅ Admin guides

### Testing
- ✅ Comprehensive test coverage
- ✅ End-to-end workflows
- ✅ Error scenarios

---

## ✅ SUCCESS CRITERIA

- ✅ All products can be created with metadata
- ✅ Products searchable by description, image, metadata
- ✅ Shopping cart fully functional
- ✅ Quote requests work end-to-end
- ✅ Proposals can be created and priced
- ✅ Moodboard products integration works
- ✅ Commission tracking accurate
- ✅ Admin panel shows all features
- ✅ All tests pass
- ✅ Documentation complete

---

## 🚀 NEXT STEPS

1. ✅ Review this plan
2. ⏳ Generate task list from this plan
3. ⏳ Create database tables (Supabase MCP)
4. ⏳ Create test files
5. ⏳ Build Edge Functions
6. ⏳ Build frontend components
7. ⏳ Update documentation
8. ⏳ Run comprehensive tests
9. ⏳ Deploy to production

---

**Ready to generate tasks! 🚀**

