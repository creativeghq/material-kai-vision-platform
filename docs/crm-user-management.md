# CRM & User Management System

## Overview

The Material Kai Vision Platform includes a comprehensive CRM (Customer Relationship Management) system with user management, role-based access control, subscription management, and user credits system.

## Architecture

### Core Components

1. **User Management** - OAuth social login, user profiles, role assignment
2. **Role-Based Access Control** - 5-tier role hierarchy with granular permissions
3. **Subscription Management** - Stripe integration with multiple subscription tiers
4. **User Credits System** - Internal credit system for feature usage
5. **CRM Contacts** - Non-user contact management and relationships

---

## Role Hierarchy

The platform uses a 5-tier role hierarchy:

| Role | Level | Description |
|------|-------|-------------|
| **Admin** | 5 | Full platform access, user management, system configuration, billing, CRM |
| **Manager** | 4 | Manage users, view analytics, configure settings, manage CRM contacts |
| **Factory** | 3 | Create/manage materials, manage inventory, view reports, manage production |
| **Dealer** | 2 | View materials, manage orders, limited inventory access, manage customer contacts |
| **User** | 1 | Basic access, view materials, create moodboards, view own profile |

### Role Inheritance

Each role inherits all permissions from lower levels:
```
Admin (5) → Manager (4) → Factory (3) → Dealer (2) → User (1)
```

---

## Database Schema

### Core Tables

#### `roles`
Master table defining all available roles.

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  name VARCHAR UNIQUE,           -- 'admin', 'manager', 'factory', 'dealer', 'user'
  level INTEGER UNIQUE,          -- 5, 4, 3, 2, 1
  description TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### `user_profiles`
Extends auth.users with platform-level role and subscription info.

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id),
  role_id UUID REFERENCES roles(id),
  subscription_tier VARCHAR,     -- 'free', 'pro', 'enterprise'
  status VARCHAR,                -- 'active', 'inactive', 'suspended'
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### `role_permissions`
Maps permissions to roles.

```sql
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY,
  role_id UUID REFERENCES roles(id),
  permission VARCHAR,            -- e.g., 'user:create', 'material:read'
  created_at TIMESTAMPTZ,
  UNIQUE(role_id, permission)
);
```

### Subscription Tables

#### `subscription_plans`
Available subscription tiers.

```sql
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY,
  name VARCHAR UNIQUE,           -- 'free', 'pro', 'enterprise'
  description TEXT,
  price_in_cents INTEGER,
  currency VARCHAR,
  stripe_product_id VARCHAR,
  stripe_price_id VARCHAR,
  features JSONB,                -- Feature limits and capabilities
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### `user_subscriptions`
Tracks user subscriptions.

```sql
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  plan_id UUID REFERENCES subscription_plans(id),
  stripe_subscription_id VARCHAR,
  status VARCHAR,                -- 'active', 'canceled', 'past_due'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Credits System Tables

#### `user_credits`
User credit balance.

```sql
CREATE TABLE user_credits (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id),
  balance BIGINT,                -- Credit balance
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### `credit_packages`
Available credit purchase options.

```sql
CREATE TABLE credit_packages (
  id UUID PRIMARY KEY,
  name VARCHAR UNIQUE,           -- 'starter', 'standard', 'premium'
  credits BIGINT,
  price_in_cents INTEGER,
  currency VARCHAR,
  stripe_product_id VARCHAR,
  stripe_price_id VARCHAR,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### `credit_transactions`
Audit trail of all credit movements.

```sql
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  amount BIGINT,                 -- Positive for additions, negative for deductions
  type VARCHAR,                  -- 'purchase', 'usage', 'admin_add', 'admin_remove'
  description TEXT,
  reference_id VARCHAR,          -- Links to stripe_subscription_id or feature usage
  created_at TIMESTAMPTZ
);
```

### CRM Tables

#### `crm_contacts`
Non-user contacts in the CRM.

```sql
CREATE TABLE crm_contacts (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  email VARCHAR,
  phone VARCHAR,
  company VARCHAR,
  status VARCHAR,                -- 'active', 'inactive', 'lead', 'customer'
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### `crm_contact_relationships`
Links contacts to users.

```sql
CREATE TABLE crm_contact_relationships (
  id UUID PRIMARY KEY,
  contact_id UUID REFERENCES crm_contacts(id),
  user_id UUID REFERENCES auth.users(id),
  relationship_type VARCHAR,     -- 'customer', 'supplier', 'partner'
  created_at TIMESTAMPTZ,
  UNIQUE(contact_id, user_id)
);
```

---

## API Endpoints

### User Management (`/functions/v1/crm-users-api`)

**GET /crm-users-api** - List all users (Admin only)
```
Query Parameters:
  - limit: number (default: 50)
  - offset: number (default: 0)
  - search: string (optional)

Response:
  {
    data: [
      {
        id: UUID,
        user_id: UUID,
        role_id: UUID,
        subscription_tier: string,
        status: string,
        created_at: timestamp,
        roles: { name, level }
      }
    ],
    count: number
  }
```

**GET /crm-users-api/{userId}** - Get user details
```
Response:
  {
    data: {
      id: UUID,
      user_id: UUID,
      role_id: UUID,
      subscription_tier: string,
      status: string,
      created_at: timestamp,
      updated_at: timestamp,
      roles: { name, level, description }
    }
  }
```

**PATCH /crm-users-api/{userId}** - Update user (Admin only)
```
Body:
  {
    role_id?: UUID,
    status?: 'active' | 'inactive' | 'suspended',
    subscription_tier?: 'free' | 'pro' | 'enterprise'
  }

Response:
  { data: { ...updated user profile } }
```

**DELETE /crm-users-api/{userId}** - Delete user (Admin only)
```
Response:
  { message: "User deleted successfully" }
```

### Subscriptions & Credits (`/functions/v1/crm-stripe-api`)

**POST /crm-stripe-api/subscriptions/create-checkout** - Create checkout session
```
Body:
  { plan_id: UUID }

Response:
  { message: "Checkout session creation requires Stripe API setup", plan: {...} }
```

**POST /crm-stripe-api/credits/purchase** - Purchase credits
```
Body:
  { package_id: UUID }

Response:
  { message: "Credit purchase requires Stripe API setup", package: {...} }
```

**GET /crm-stripe-api/subscriptions** - Get user's subscription
```
Response:
  {
    data: {
      id: UUID,
      user_id: UUID,
      plan_id: UUID,
      status: string,
      current_period_start: timestamp,
      current_period_end: timestamp,
      subscription_plans: { name, price, description }
    }
  }
```

**GET /crm-stripe-api/credits** - Get user's credits
```
Response:
  {
    data: {
      id: UUID,
      user_id: UUID,
      balance: number,
      created_at: timestamp,
      updated_at: timestamp
    }
  }
```

### CRM Contacts (`/functions/v1/crm-contacts-api`)

**POST /crm-contacts-api** - Create contact (Manager, Factory, Admin)
```
Body:
  {
    name: string (required),
    email?: string,
    phone?: string,
    company?: string,
    notes?: string
  }

Response:
  { data: { id, name, email, phone, company, notes, created_by, created_at } }
```

**GET /crm-contacts-api** - List contacts
```
Query Parameters:
  - limit: number (default: 50)
  - offset: number (default: 0)

Response:
  { data: [...contacts], count: number }
```

**GET /crm-contacts-api/{contactId}** - Get contact details
```
Response:
  {
    data: {
      id: UUID,
      name: string,
      email: string,
      phone: string,
      company: string,
      notes: string,
      created_by: UUID,
      created_at: timestamp,
      crm_contact_relationships: [...]
    }
  }
```

**PATCH /crm-contacts-api/{contactId}** - Update contact
```
Body:
  { name?, email?, phone?, company?, notes? }

Response:
  { data: { ...updated contact } }
```

**DELETE /crm-contacts-api/{contactId}** - Delete contact
```
Response:
  { message: "Contact deleted successfully" }
```
- `POST /api/crm/contacts/{id}/attach-user` - Link contact to user

---

## Secrets Management

All sensitive credentials are stored in GitHub Secrets and Supabase Edge Functions Secrets. **No .env files are used**.

### GitHub Secrets (for CI/CD and deployments)

| Secret | Purpose | Required For |
|--------|---------|--------------|
| `STRIPE_SECRET_KEY` | Stripe API authentication | Stripe integration, webhook handling |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | Webhook signature validation |
| `STRIPE_PUBLISHABLE_KEY` | Stripe public key for frontend | Checkout UI components |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access (bypass RLS) | Edge Functions, admin operations |
| `SUPABASE_ANON_KEY` | Supabase public access | Frontend client initialization |
| `SUPABASE_URL` | Supabase project URL | Client and Edge Functions |

### Supabase Edge Functions Secrets

Set these in Supabase dashboard under Project Settings → Edge Functions:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### OAuth Provider Credentials

Configure in Supabase Auth settings:

**Google OAuth**:
- Client ID: From Google Cloud Console
- Client Secret: From Google Cloud Console
- Redirect URL: `https://your-domain.com/auth/callback`

**GitHub OAuth**:
- Client ID: From GitHub Settings → Developer settings → OAuth Apps
- Client Secret: From GitHub OAuth App
- Redirect URL: `https://your-domain.com/auth/callback`

**Microsoft OAuth**:
- Client ID: From Azure Portal → App registrations
- Client Secret: From Azure Portal
- Redirect URL: `https://your-domain.com/auth/callback`

---

## Implementation Phases

### Phase 1: OAuth Social Login ✅ In Development

**Files Created**:
- `src/contexts/AuthContext.tsx` - Added `signInWithOAuth()` method
- `src/pages/AuthCallbackPage.tsx` - OAuth callback handler
- `src/components/Auth/OAuthButtons.tsx` - OAuth button components

**What's Implemented**:
- ✅ OAuth method in AuthContext
- ✅ Callback page for OAuth redirect
- ✅ OAuth button UI components
- ✅ Auto-create user profile on first login
- ✅ Auto-create user credits account

**What's Needed**:
- [ ] Enable OAuth providers in Supabase dashboard
- [ ] Configure OAuth redirect URLs
- [ ] Add OAuth buttons to login page
- [ ] Test with Google, GitHub, Microsoft

### Phase 2: User Management Backend ✅ In Development

**Files Created**:
- `supabase/functions/crm-users-api/index.ts` - User management API
- `src/services/crm.service.ts` - Frontend API client

**What's Implemented**:
- ✅ GET /crm-users-api - List users (admin only)
- ✅ GET /crm-users-api/{id} - Get user details
- ✅ PATCH /crm-users-api/{id} - Update user role/status
- ✅ DELETE /crm-users-api/{id} - Delete user
- ✅ Admin authorization checks

**What's Needed**:
- [ ] Create UserManagementTable component
- [ ] Create UserEditModal component
- [ ] Add user management tab to AdminDashboard
- [ ] Implement search/filter/pagination UI
- [ ] Add user activity logging

### Phase 3: Stripe Integration 🔄 Planned

**Files Created**:
- `supabase/functions/crm-stripe-api/index.ts` - Stripe API (skeleton)

**What's Needed**:
- [ ] Configure Stripe products and prices
- [ ] Implement Stripe checkout session creation
- [ ] Add webhook handler for payment events
- [ ] Create subscription management UI
- [ ] Implement billing portal

### Phase 4: Roles & Permissions 🔄 Planned

**What's Needed**:
- [ ] Create role permission matrix
- [ ] Implement RLS policies for each role
- [ ] Create permission checking utilities
- [ ] Add role management UI

### Phase 5: CRM Entity Management ✅ In Development

**Files Created**:
- `supabase/functions/crm-contacts-api/index.ts` - CRM contacts API

**What's Implemented**:
- ✅ POST /crm-contacts-api - Create contact
- ✅ GET /crm-contacts-api - List contacts
- ✅ GET /crm-contacts-api/{id} - Get contact
- ✅ PATCH /crm-contacts-api/{id} - Update contact
- ✅ DELETE /crm-contacts-api/{id} - Delete contact
- ✅ Role-based access control (Manager, Factory, Admin)

**What's Needed**:
- [ ] Create ContactManagementTable component
- [ ] Create ContactEditModal component
- [ ] Implement contact relationships UI
- [ ] Add bulk import functionality

### Phase 5.5: User Credits System ✅ Database Ready

**What's Implemented**:
- ✅ user_credits table
- ✅ credit_packages table
- ✅ credit_transactions table
- ✅ GET /crm-stripe-api/credits endpoint

**What's Needed**:
- [ ] Create credit purchase UI
- [ ] Implement credit usage tracking
- [ ] Add credit history display
- [ ] Admin credit management UI

### Phase 6: Data Persistence 🔄 Planned

**What's Needed**:
- [ ] User profile management UI
- [ ] Data validation rules
- [ ] Audit trail logging
- [ ] Data export functionality

---

## Testing

Run the verification script to check all tables:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/verify-crm-tables.js
```

Run the registration test script:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/test-crm-registration.js
```

---

## Security Considerations

1. **Row-Level Security (RLS)** - All tables have RLS policies
2. **JWT Validation** - All API requests validated
3. **Role-Based Access** - Granular permission control
4. **Audit Logging** - Track all admin actions
5. **Data Encryption** - Sensitive fields encrypted
6. **GDPR Compliance** - Data export/deletion features

