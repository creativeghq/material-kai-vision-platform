# Comprehensive CRM & Subscription Platform Implementation Plan

## Executive Summary
This plan outlines the implementation of a complete CRM system with OAuth social login, user management, Stripe subscription integration, and role-based access control for the Material Kai Vision Platform.

---

## Phase 1: OAuth Social Login Integration

### 1.1 Functionality
- **Social Providers**: Google, GitHub, Microsoft (configurable)
- **Supabase Auth Configuration**: Enable OAuth providers in Supabase dashboard
- **Frontend Integration**: Update AuthContext to support OAuth flows
- **User Profile Sync**: Auto-populate user metadata from OAuth providers
- **Email Verification**: Automatic email verification for OAuth users

### 1.2 Development Approach
1. **Supabase Configuration**:
   - Enable OAuth providers in Supabase Auth settings
   - Configure redirect URLs for each provider
   - Store provider credentials in GitHub Secrets

2. **Frontend Changes**:
   - Extend `AuthContext.tsx` with OAuth sign-in methods
   - Create OAuth button components in login page
   - Handle OAuth callback and session management
   - Store provider info in user metadata

3. **Database Schema**:
   - Add `oauth_provider` and `oauth_id` fields to auth.users metadata
   - Track provider connection timestamp

---

## Phase 2: User Management Backend & Admin Panel

### 2.1 Functionality
- **User List View**: Display all users with pagination
- **User Actions**: Edit, enable/disable, delete users
- **Role Assignment**: Assign/change user roles (Admin, Manager, User, Guest)
- **User Status**: Active/Inactive/Suspended states
- **Bulk Operations**: Bulk enable/disable, role changes
- **User Search & Filter**: By email, name, role, status, subscription
- **User Activity Tracking**: Last login, creation date, activity logs

### 2.2 Development Approach
1. **Database Schema**:
   - Create `user_profiles` table (extends auth.users)
   - Add fields: `status`, `role`, `subscription_tier`, `metadata`
   - Create `user_activity_logs` table for audit trail
   - Add RLS policies for admin access

2. **Backend API Endpoints** (Supabase Edge Functions):
   - `GET /api/users` - List users with filters
   - `GET /api/users/{id}` - Get user details
   - `PATCH /api/users/{id}` - Update user (role, status)
   - `DELETE /api/users/{id}` - Delete user
   - `POST /api/users/bulk-action` - Bulk operations
   - `GET /api/users/{id}/activity` - User activity logs

3. **Frontend Components**:
   - Extend `AdminDashboard.tsx` with proper user management tab
   - Create `UserManagementTable` component with sorting/filtering
   - Create `UserEditModal` for editing user details
   - Create `UserRoleSelector` component
   - Add user status badge component

4. **Admin Panel Features**:
   - Real-time user count metrics
   - User status distribution chart
   - Recent user activity feed
   - User search with advanced filters

---

## Phase 3: Stripe Integration & Subscription Management

### 3.1 Functionality
- **Subscription Plans**: Define pricing tiers (Free, Pro, Enterprise)
- **Payment Processing**: Secure Stripe payment handling
- **Subscription Management**: Create, update, cancel subscriptions
- **Billing Portal**: Customer self-service billing management
- **Invoice Management**: Generate and track invoices
- **Payment History**: Display transaction records
- **Webhook Handling**: Sync Stripe events with database

### 3.2 Development Approach
1. **Stripe Setup**:
   - Create Stripe account and configure products/prices
   - Set up webhook endpoints for payment events
   - Configure Stripe API keys in GitHub Secrets

2. **Database Schema**:
   - Create `subscription_plans` table (Free, Pro, Enterprise)
   - Create `user_subscriptions` table (user_id, plan_id, status, dates)
   - Create `invoices` table (tracking billing records)
   - Create `stripe_customers` table (stripe_id mapping)
   - Add RLS policies for subscription access

3. **Backend API Endpoints** (Supabase Edge Functions):
   - `POST /api/subscriptions/create-checkout` - Create Stripe session
   - `GET /api/subscriptions/plans` - List available plans
   - `GET /api/subscriptions/current` - Get user's current subscription
   - `POST /api/subscriptions/cancel` - Cancel subscription
   - `POST /api/subscriptions/update` - Change subscription plan
   - `GET /api/invoices` - List user invoices
   - `POST /api/webhooks/stripe` - Handle Stripe webhooks

4. **Frontend Components**:
   - Create `SubscriptionPlans` component (pricing page)
   - Create `CheckoutModal` for payment flow
   - Create `BillingPortal` component in user settings
   - Create `InvoiceHistory` component
   - Add subscription status badge

5. **Webhook Integration**:
   - Handle `customer.subscription.created`
   - Handle `customer.subscription.updated`
   - Handle `customer.subscription.deleted`
   - Handle `invoice.payment_succeeded`
   - Handle `invoice.payment_failed`

---

## Phase 4: User Roles & Subscription Linking

### 4.1 Functionality
- **Role Hierarchy**: Admin (5) > Manager (4) > Factory (3) > Dealer (2) > User (1)
  - **Admin**: Full platform access, user management, system configuration, billing, CRM
  - **Manager**: Manage users, view analytics, configure settings, manage CRM contacts
  - **Factory**: Create/manage materials, manage inventory, view reports, manage production
  - **Dealer**: View materials, manage orders, limited inventory access, manage customer contacts
  - **User**: Basic access, view materials, create moodboards, view own profile
- **No Guest Access**: Platform is login-only, all users must be authenticated
- **Role-Based Permissions**: Different features per role
- **Subscription-Linked Roles**: Certain roles require specific subscriptions
- **Permission Matrix**: Define what each role can do
- **Dynamic Role Assignment**: Auto-assign roles based on subscription
- **Role Management UI**: Admin interface to manage roles

### 4.2 Development Approach
1. **Database Schema** (Create new platform-level role system):
   - Create `roles` table (id, name, level, description)
   - Create `user_profiles` table (user_id, role_id, subscription_tier, status)
   - Create `role_permissions` table (role_id, permission)
   - Create `subscription_role_mapping` table (subscription_plan_id, role_id)
   - Add RLS policies to enforce role-based access
   - Migrate existing workspace_members to use new role system

2. **Backend API Endpoints** (Supabase Edge Functions):
   - `GET /api/roles` - List all roles with permissions
   - `GET /api/users/{id}/role` - Get user's current role
   - `PATCH /api/users/{id}/role` - Update user role (admin only)
   - `GET /api/roles/{id}/permissions` - Get role permissions
   - `GET /api/permissions` - List all available permissions
   - `POST /api/roles/check-permission` - Check if user has permission

3. **Frontend Components**:
   - Create `RoleManagementPanel` in admin dashboard
   - Create `PermissionMatrix` component showing role capabilities
   - Create `RoleSelector` dropdown for user assignment
   - Create `RoleBadge` component for displaying user roles
   - Add role-based feature visibility throughout app

---

## Phase 5: CRM Entity Management (Non-User Contacts)

### 5.1 Functionality
- **Contact Management**: Add contacts not registered as users
- **Contact Attributes**: Name, email, phone, company, notes, custom fields
- **Contact Status**: Active, Inactive, Lead, Customer
- **Contact Relationships**: Link contacts to users
- **Contact Groups**: Organize contacts by category
- **Contact Activity**: Track interactions and communications
- **Bulk Import**: Import contacts from CSV/Excel

### 5.2 Development Approach
1. **Database Schema**:
   - Create `crm_contacts` table (name, email, phone, company, status)
   - Create `crm_contact_metadata` table (custom fields)
   - Create `crm_contact_relationships` table (contact_id, user_id)
   - Create `crm_contact_activity` table (interaction logs)
   - Create `crm_contact_groups` table (categorization)

2. **Backend API Endpoints**:
   - `GET /api/crm/contacts` - List contacts
   - `POST /api/crm/contacts` - Create contact
   - `PATCH /api/crm/contacts/{id}` - Update contact
   - `DELETE /api/crm/contacts/{id}` - Delete contact
   - `POST /api/crm/contacts/{id}/attach-user` - Link to user
   - `POST /api/crm/contacts/bulk-import` - Import contacts
   - `GET /api/crm/contacts/{id}/activity` - Contact activity

3. **Frontend Components**:
   - Create `CRMContactsPanel` in admin
   - Create `ContactTable` with search/filter
   - Create `ContactForm` for add/edit
   - Create `ContactDetailView` with activity timeline
   - Create `BulkImportModal` for CSV import
   - Create `ContactGroupManager` component

---

## Phase 5.5: User Credits System

### 5.5.1 Functionality
- **Credit Accounts**: Each user has a credit balance
- **Credit Purchase**: Users can buy credits via Stripe
- **Credit Usage**: Deduct credits for internal functionality
- **Credit History**: Track all credit transactions
- **Credit Packages**: Predefined credit bundles (e.g., 100 credits, 500 credits, 1000 credits)
- **Credit Expiration**: Optional expiration dates for promotional credits
- **Admin Control**: Admins can manually add/remove credits

### 5.5.2 Development Approach
1. **Database Schema**:
   - Create `user_credits` table (user_id, balance, updated_at)
   - Create `credit_packages` table (name, credits, price_in_cents, stripe_product_id)
   - Create `credit_transactions` table (user_id, amount, type, description, created_at)
   - Create `credit_usage_logs` table (user_id, feature, credits_used, created_at)

2. **Backend API Endpoints**:
   - `GET /api/credits/balance` - Get user's credit balance
   - `POST /api/credits/purchase` - Create Stripe checkout for credits
   - `GET /api/credits/packages` - List available credit packages
   - `POST /api/credits/deduct` - Deduct credits for feature usage
   - `GET /api/credits/history` - Get credit transaction history
   - `PATCH /api/credits/admin/add` - Admin add credits (admin only)
   - `PATCH /api/credits/admin/remove` - Admin remove credits (admin only)

3. **Frontend Components**:
   - Create `CreditBalance` component (display in header/dashboard)
   - Create `CreditPurchaseModal` for buying credits
   - Create `CreditPackageSelector` component
   - Create `CreditHistoryPanel` in user settings
   - Add credit cost indicators on features that use credits

---

## Phase 6: Data Persistence & Profile Management

### 6.1 Functionality
- **Profile Updates**: Users can update their own profiles
- **Profile Validation**: Email, phone, company validation
- **Profile Completeness**: Track profile completion percentage
- **Data Consistency**: Ensure data integrity across tables
- **Audit Trail**: Track all profile changes
- **Data Export**: Export user/contact data

### 6.2 Development Approach
1. **Backend API Endpoints**:
   - `GET /api/profile` - Get current user profile
   - `PATCH /api/profile` - Update profile
   - `POST /api/profile/avatar` - Upload avatar
   - `GET /api/profile/export` - Export user data

2. **Frontend Components**:
   - Create `ProfileSettings` component
   - Create `ProfileForm` with validation
   - Create `AvatarUploader` component
   - Add profile completion indicator

3. **Data Validation**:
   - Email format validation
   - Phone number validation
   - Required field validation
   - Duplicate email checking

---

## Implementation Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: OAuth | 1-2 weeks | Supabase config |
| Phase 2: User Management | 2-3 weeks | Phase 1 complete |
| Phase 3: Stripe Integration | 2-3 weeks | Phase 2 complete |
| Phase 4: Roles & Permissions | 1-2 weeks | Phase 3 complete |
| Phase 5: CRM Entities | 2-3 weeks | Phase 4 complete |
| Phase 5.5: User Credits | 1-2 weeks | Phase 3 complete |
| Phase 6: Data Persistence | 1 week | All phases |
| **Total** | **11-16 weeks** | Sequential |

---

## Technology Stack

- **Frontend**: React + TypeScript + Shadcn/UI
- **Backend**: Supabase Edge Functions (TypeScript)
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth + OAuth
- **Payments**: Stripe API
- **Storage**: Supabase Storage (for avatars, exports)
- **Real-time**: Supabase Realtime subscriptions

---

## Security Considerations

1. **RLS Policies**: Implement row-level security for all tables
2. **API Key Management**: Store Stripe keys in GitHub Secrets
3. **JWT Validation**: Validate all API requests
4. **Data Encryption**: Encrypt sensitive fields (phone, SSN if needed)
5. **Audit Logging**: Track all admin actions
6. **GDPR Compliance**: Implement data export/deletion features

---

## Success Metrics

- ✅ OAuth login working with 3+ providers
- ✅ Admin can manage 100+ users efficiently
- ✅ Stripe payments processing successfully
- ✅ Role-based access control enforced
- ✅ CRM contacts fully functional
- ✅ All data persisting correctly
- ✅ Admin panel showing real-time metrics

