# Price Monitoring System - Remaining Tasks

**Last Updated:** December 25, 2024  
**Status:** In Progress - Core functionality complete, UI and advanced features remaining

---

## ✅ Completed Phases

### Phase 1: Remove Jina Integration ✅ COMPLETE
- Removed all Jina AI references from codebase
- Updated documentation and environment variables
- Cleaned up Edge Functions and UI components

### Phase 2: Database Schema ✅ COMPLETE
- All tables created: `price_monitoring_products`, `price_history`, `competitor_sources`, `price_monitoring_jobs`, `price_alerts`, `product_usage_stats`
- RLS policies implemented for role-based access
- Database functions for price comparison and change detection

### Phase 3: Firecrawl Credit System ✅ COMPLETE
- Firecrawl integrated with credit tracking
- AI usage logging configured
- Cost calculation and credit debit implemented

### Phase 4: Backend Services ✅ COMPLETE
- `PriceMonitoringService` - Core monitoring logic
- `CompetitorScraperService` - Firecrawl-based scraping
- `DataForSEOIntegration` - DataForSEO API integration for product search and pricing
- `PriceAnalyticsService` - Trend analysis and statistics
- FastAPI endpoints for all operations

---

## 🚧 In Progress Phases

### Phase 5: Product Monitor Tab (On-Demand) - ✅ 100% COMPLETE

**All Tasks Completed:**
- ✅ Monitor tab added to product detail pages
- ✅ Check Competitors button with on-demand price checking
- ✅ CompetitorPriceList component showing latest prices
- ✅ PriceHistoryChart with interactive Recharts visualization
- ✅ CompetitorSourceManager dialog for adding/editing URLs
- ✅ **Update Price Tracking button** - Configure automated monitoring with frequency settings

---

### Phase 6: Price Monitoring Page (Scheduled) - 20% Complete

**Completed:**
- ✅ Price Monitoring sidebar page created
- ✅ MonitoredProductsList component (basic table)

**Remaining:**

#### 1. ProductSearchAndAdd Component
- **File:** `src/components/PriceMonitoring/ProductSearchAndAdd.tsx`
- **Description:** Search interface to find and add products to monitoring list
- **Features:**
  - Search products by name, SKU, or category
  - Display search results with product details
  - "Add to Monitoring" button for each product
  - Bulk add multiple products
  - Integration with existing product search API

#### 2. ScheduleConfiguration Component
- **File:** `src/components/PriceMonitoring/ScheduleConfiguration.tsx`
- **Description:** UI to configure monitoring frequency
- **Features:**
  - Dropdown/radio buttons for frequency: Hourly, Daily, Weekly, On-Demand
  - Time picker for scheduled checks
  - Enable/disable monitoring toggle
  - Save configuration to `price_monitoring_products` table

#### 3. BulkActionsToolbar Component
- **File:** `src/components/PriceMonitoring/BulkActionsToolbar.tsx`
- **Description:** Toolbar for bulk operations on monitored products
- **Features:**
  - Checkbox selection for multiple products
  - Bulk enable/disable monitoring
  - Bulk delete from monitoring
  - Bulk update frequency
  - Export selected products data

#### 4. Role-Based Access Control
- **Files:** 
  - `src/pages/PriceMonitoring/PriceMonitoringPage.tsx`
  - `src/components/Layout/Sidebar.tsx`
- **Description:** Restrict page access to Factories, Stores, and Admins
- **Implementation:**
  - Check user role from auth context
  - Hide sidebar link for unauthorized roles
  - Redirect unauthorized users to dashboard
  - Show permission denied message

---

## 📋 Pending Phases

### Phase 7: Admin Analytics Tab - 0% Complete

**All Tasks Pending:**

#### 1. ProductUsageStatsService (Backend)
- **File:** `mivaa-pdf-extractor/app/services/product_usage_stats_service.py`
- **Description:** Track and aggregate product usage across platform
- **Features:**
  - Query `product_usage_stats` table
  - Aggregate usage by product, time period
  - Calculate trends and growth metrics
  - Export usage reports

#### 2. Admin-Only Analytics Tab
- **File:** `src/components/PriceMonitoring/ProductAnalyticsTab.tsx`
- **Description:** Hidden tab in product Monitor page for admins
- **Features:**
  - Only visible to admin role users
  - Display usage statistics
  - Show usage trends chart
  - Export analytics data

#### 3. UsageStatisticsDisplay Component
- **File:** `src/components/PriceMonitoring/UsageStatisticsDisplay.tsx`
- **Description:** Display product usage counts
- **Metrics:**
  - Times added to MoodBoards
  - Times added to Quotes
  - Search result appearances
  - Click-through rates
  - Conversion metrics

#### 4. UsageTrendsChart Component
- **File:** `src/components/PriceMonitoring/UsageTrendsChart.tsx`
- **Description:** Chart showing usage trends over time
- **Features:**
  - Line chart with Recharts
  - Multiple metrics on same chart
  - Time range selector (7d, 30d, 90d, all)
  - Export chart data

#### 5. Admin-Only Visibility Guards
- **Files:** Multiple component files
- **Description:** Ensure Analytics tab is hidden from non-admins
- **Implementation:**
  - Role check in ProductDetailModal
  - Conditional rendering of Analytics tab
  - API endpoint protection
  - Database RLS policies verification

---

### Phase 8: Notifications & Alerts System - 0% Complete

**All Tasks Pending:**

#### 1. PriceAlertService (Backend)
- **File:** `mivaa-pdf-extractor/app/services/price_alert_service.py`
- **Description:** Detect price changes and trigger notifications
- **Features:**
  - Monitor price changes against thresholds
  - Trigger alerts when conditions met
  - Support multiple alert types (email, in-app, webhook)
  - Batch alert processing
  - Alert deduplication

#### 2. NotificationPreferences Component
- **File:** `src/components/PriceMonitoring/NotificationPreferences.tsx`
- **Description:** UI for configuring price alert settings
- **Features:**
  - Enable/disable price alerts
  - Set price change threshold (percentage or absolute)
  - Choose notification channels (email, in-app)
  - Set alert frequency (immediate, daily digest)
  - Configure alert conditions (price drop, price increase, any change)

#### 3. PriceChangeNotification Component
- **File:** `src/components/Notifications/PriceChangeNotification.tsx`
- **Description:** Display price change alerts in UI
- **Features:**
  - Toast notification for real-time alerts
  - Notification center integration
  - Show old vs new price
  - Link to product detail page
  - Mark as read/unread

#### 4. Email Notification Templates
- **Files:**
  - `mivaa-pdf-extractor/app/templates/emails/price_drop_alert.html`
  - `mivaa-pdf-extractor/app/templates/emails/price_increase_alert.html`
- **Description:** HTML email templates for price alerts
- **Content:**
  - Product name and image
  - Old price vs new price
  - Percentage change
  - Competitor source information
  - Link to product page
  - Unsubscribe link

#### 5. Integrate with Existing Notification System
- **Files:**
  - `src/services/notificationService.ts`
  - `mivaa-pdf-extractor/app/services/notification_service.py`
- **Description:** Connect price alerts to platform notifications
- **Tasks:**
  - Add price alert notification type
  - Update notification service to handle price alerts
  - Integrate with email service
  - Add to notification center

#### 6. Notification History View
- **File:** `src/components/PriceMonitoring/NotificationHistory.tsx`
- **Description:** View past price change notifications
- **Features:**
  - List all price alerts received
  - Filter by product, date range, alert type
  - Search notifications
  - Mark all as read
  - Delete old notifications

---

### Phase 9: Scheduled Jobs & Cron - 17% Complete

**Completed:**
- ✅ Supabase Edge Function for cron created

**Remaining:**

#### 1. Configure pg_cron for Scheduled Jobs
- **Location:** Supabase Dashboard → Database → Extensions
- **Description:** Set up PostgreSQL cron jobs
- **Tasks:**
  - Enable pg_cron extension
  - Create cron job to call Edge Function
  - Configure job schedules (hourly, daily, weekly)
  - Set up job monitoring
  - Configure error notifications

#### 2. JobScheduler Service (Backend)
- **File:** `mivaa-pdf-extractor/app/services/job_scheduler_service.py`
- **Description:** Manage job scheduling, queuing, and execution
- **Features:**
  - Queue management for price monitoring jobs
  - Priority-based job execution
  - Concurrent job processing
  - Job status tracking
  - Resource management (rate limiting)

#### 3. Job Status Monitoring UI
- **File:** `src/components/PriceMonitoring/JobStatusMonitor.tsx`
- **Description:** Dashboard to view scheduled job status
- **Features:**
  - List all scheduled jobs
  - Show job status (pending, running, completed, failed)
  - Display execution history
  - Show next scheduled run time
  - Manual job trigger button
  - Job cancellation

#### 4. Job Retry and Error Handling
- **Files:**
  - `mivaa-pdf-extractor/app/services/job_scheduler_service.py`
  - `mivaa-pdf-extractor/app/services/price_monitoring_service.py`
- **Description:** Implement retry logic and error recovery
- **Features:**
  - Exponential backoff for retries
  - Maximum retry attempts configuration
  - Dead letter queue for failed jobs
  - Error categorization (transient vs permanent)
  - Alert on repeated failures

#### 5. Job Execution Logs
- **File:** `src/components/PriceMonitoring/JobExecutionLogs.tsx`
- **Description:** Logging system for job executions
- **Features:**
  - View detailed job execution logs
  - Filter by job type, status, date
  - Search logs
  - Export logs for analysis
  - Log retention policy

---

### Phase 10: Testing & Documentation - 10% Complete

**Completed:**
- ✅ Price monitoring documentation created

**Remaining:**

#### 1. Unit Tests for Price Monitoring Services
- **Files:** `mivaa-pdf-extractor/tests/services/test_price_monitoring_*.py`
- **Description:** Test coverage for backend services
- **Tests:**
  - PriceMonitoringService methods
  - CompetitorScraperService scraping logic
  - GoogleProductsIntegration API calls
  - PriceAnalyticsService calculations
  - PriceAlertService alert triggering

#### 2. Integration Tests for API Endpoints
- **Files:** `mivaa-pdf-extractor/tests/api/test_price_monitoring_*.py`
- **Description:** Test all price monitoring API endpoints
- **Tests:**
  - Start/stop monitoring endpoints
  - On-demand price check endpoint
  - Price history retrieval
  - Alert configuration endpoints
  - Job management endpoints

#### 3. E2E Tests for UI Components
- **Files:** `src/tests/e2e/price-monitoring/*.spec.ts`
- **Description:** Test user flows for monitoring
- **Tests:**
  - Add product to monitoring
  - Configure monitoring frequency
  - Trigger on-demand price check
  - View price history chart
  - Configure price alerts
  - Receive and view notifications

#### 4. Update API Documentation
- **File:** `docs/api/price-monitoring-api.md`
- **Description:** Document all new API endpoints
- **Content:**
  - Endpoint descriptions
  - Request/response schemas
  - Authentication requirements
  - Rate limiting information
  - Example requests with curl
  - Error codes and handling

#### 5. Create Admin Guide
- **File:** `docs/admin/price-monitoring-admin-guide.md`
- **Description:** Admin documentation for managing system
- **Content:**
  - System architecture overview
  - Database schema explanation
  - Cron job configuration
  - Monitoring and alerting setup
  - Troubleshooting guide
  - Performance optimization tips

---

## 📊 Overall Progress Summary

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Remove Jina | ✅ Complete | 100% |
| Phase 2: Database Schema | ✅ Complete | 100% |
| Phase 3: Firecrawl Credits | ✅ Complete | 100% |
| Phase 4: Backend Services | ✅ Complete | 100% |
| Phase 5: Product Monitor Tab | ✅ Complete | 100% |
| Phase 6: Price Monitoring Page | 🚧 In Progress | 20% |
| Phase 7: Admin Analytics | ⏳ Pending | 0% |
| Phase 8: Notifications & Alerts | ⏳ Pending | 0% |
| Phase 9: Scheduled Jobs & Cron | 🚧 In Progress | 17% |
| Phase 10: Testing & Documentation | 🚧 In Progress | 10% |

**Overall Project Completion: ~58%**

---

## 🎯 Recommended Next Steps

### Immediate Priority (Complete Phase 5 & 6)
1. Add "Update Price Tracking" button to ProductMonitorTab
2. Create ProductSearchAndAdd component
3. Create ScheduleConfiguration component
4. Create BulkActionsToolbar component
5. Implement role-based access control for Price Monitoring page

### Short-term Priority (Phase 9 - Scheduled Jobs)
1. Configure pg_cron in Supabase
2. Create JobScheduler service
3. Build Job Status Monitoring UI
4. Implement retry and error handling

### Medium-term Priority (Phase 8 - Notifications)
1. Create PriceAlertService backend
2. Build NotificationPreferences UI
3. Create email templates
4. Integrate with notification system

### Long-term Priority (Phase 7 & 10)
1. Build admin analytics features
2. Write comprehensive tests
3. Complete documentation

---

## 🔧 Technical Notes

### Backend Location
All Python backend services are in: `mivaa-pdf-extractor/app/services/`

### Frontend Location
All React components are in: `src/components/PriceMonitoring/`

### Database
All tables are in Supabase with proper RLS policies

### API Endpoints
FastAPI endpoints are in: `mivaa-pdf-extractor/app/api/`

---

## 📝 Notes

- **No Python files should be created in the frontend** (`src/` or `backend/` directories)
- All backend services must be in `mivaa-pdf-extractor/app/services/`
- Frontend components use TypeScript/React
- Backend uses Python/FastAPI
- Database is Supabase (PostgreSQL)
- Price scraping uses Firecrawl API with credit tracking
- Product search and pricing data uses DataForSEO API (replaces Google Merchant API)

---

---

## 🔐 Required Environment Variables & Secrets

**IMPORTANT:** This project does NOT use `.env` files for the backend. All secrets are managed through GitHub Secrets and passed to the systemd service during deployment.

---

### 1. Firecrawl API (Required for Price Scraping)

**Where to Add:**
- ✅ **GitHub Secrets** (REQUIRED - for backend deployment)
- ✅ **Supabase Edge Functions** (REQUIRED - for cron jobs)

**Variables:**
```bash
FIRECRAWL_API_KEY=fc-your-api-key-here
```

**How to Get:**
1. Sign up at https://firecrawl.dev
2. Go to Dashboard → API Keys
3. Copy your API key (starts with `fc-`)

---

### 2. DataForSEO API (Required - for product search and pricing data)

**Where to Add:**
- ✅ **GitHub Secrets** (REQUIRED - for product discovery and pricing)
- ✅ **Supabase Edge Functions** (REQUIRED - for scheduled jobs)

**Variables:**
```bash
DATAFORSEO_LOGIN=your-dataforseo-login
DATAFORSEO_PASSWORD=your-dataforseo-password
```

**How to Get:**
1. Sign up at https://dataforseo.com
2. Go to Dashboard → API Access
3. Copy your login credentials (username and password)
4. Note: DataForSEO uses Basic Authentication with login/password

**Note:** DataForSEO is used instead of Google Merchant API for product search and competitive pricing data.

---

### 3. GitHub Repository Secrets (Main Configuration)

**Repository:** `creativeghq/material-kai-vision-platform`

**Path:** Settings → Secrets and variables → Actions → Repository secrets

**How to Add:**
1. Go to https://github.com/creativeghq/material-kai-vision-platform/settings/secrets/actions
2. Click "New repository secret"
3. Add each secret below

**Required Secrets to Add:**

| Secret Name | Value | Required? |
|-------------|-------|-----------|
| `FIRECRAWL_API_KEY` | `fc-your-api-key-here` | ✅ YES |
| `DATAFORSEO_LOGIN` | `your-dataforseo-login` | ✅ YES |
| `DATAFORSEO_PASSWORD` | `your-dataforseo-password` | ✅ YES |

**Existing Secrets (Should Already Exist):**
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `SUPABASE_ANON_KEY`
- ✅ `SUPABASE_PROJECT_ID`

---

### 4. Supabase Edge Function Secrets

**Where to Add:**
Supabase Dashboard → Edge Functions → Manage secrets

**Command Line:**
```bash
# Set Firecrawl API key
supabase secrets set FIRECRAWL_API_KEY=fc-your-api-key-here

# Set DataForSEO credentials
supabase secrets set DATAFORSEO_LOGIN=your-dataforseo-login
supabase secrets set DATAFORSEO_PASSWORD=your-dataforseo-password

# Verify secrets
supabase secrets list
```

**Required Secrets:**
```bash
FIRECRAWL_API_KEY=fc-your-api-key-here
DATAFORSEO_LOGIN=your-dataforseo-login
DATAFORSEO_PASSWORD=your-dataforseo-password
```

---

## 📋 Setup Checklist

### ✅ Required (System Won't Work Without These)
- [ ] `FIRECRAWL_API_KEY` - Added to GitHub Secrets
- [ ] `FIRECRAWL_API_KEY` - Added to Supabase Edge Functions
- [ ] `DATAFORSEO_LOGIN` - Added to GitHub Secrets
- [ ] `DATAFORSEO_PASSWORD` - Added to GitHub Secrets
- [ ] `DATAFORSEO_LOGIN` - Added to Supabase Edge Functions
- [ ] `DATAFORSEO_PASSWORD` - Added to Supabase Edge Functions
- [ ] Verify existing Supabase secrets in GitHub

### 🚀 Deployment Verification
- [ ] All secrets added to GitHub repository
- [ ] Supabase Edge Function secrets configured
- [ ] Secrets verified with `supabase secrets list`
- [ ] Backend deployment successful (systemd service updated)

---

**Document Created:** December 25, 2024
**Last Updated:** December 25, 2024 (Updated to use DataForSEO API instead of Google Merchant API)

