import { Suspense } from 'react';
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
// @ts-ignore - QueryClient types are available at runtime (react-query version conflict with React 18 types)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { Toaster } from '@/components/core/ui/toaster';
import { Toaster as Sonner } from '@/components/core/ui/sonner';
import { TooltipProvider } from '@/components/core/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthGuard } from '@/components/core/AuthGuard';
import { AdminGuard } from './components/core/AdminGuard';
import { CapabilityGuard } from './components/core/CapabilityGuard';
import { EntitlementGuard } from './components/core/EntitlementGuard';
import { Layout } from './components/core/Layout';
import {
  CriticalErrorBoundary,
  PageErrorBoundary,
} from './components/core/ErrorBoundary';

// Critical path pages — keep eager (small, needed immediately)
import Auth from './pages/Auth';
import NotFound from './pages/NotFound';
import HealthPage from './pages/Health';

// ── Lazy-loaded pages ──────────────────────────────────────────────
// Each import() creates a separate chunk, loaded only when the route is visited.
// Named exports use .then(m => ({ default: m.ExportName })) pattern.

// Core user pages
const Index = lazy(() => import('./pages/Index'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage').then(m => ({ default: m.UserProfilePage })));
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage').then(m => ({ default: m.PublicProfilePage })));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then(m => ({ default: m.DiscoverPage })));
const PublicKnowledgeBasePage = lazy(() => import('./pages/PublicKnowledgeBasePage').then(m => ({ default: m.PublicKnowledgeBasePage })));
const BrandKnowledgePage = lazy(() => import('./pages/BrandKnowledgePage').then(m => ({ default: m.BrandKnowledgePage })));
const BrandsIndexPage = lazy(() => import('./pages/BrandsIndexPage').then(m => ({ default: m.BrandsIndexPage })));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage').then(m => ({ default: m.AuthCallbackPage })));
const AgentHub = lazy(() => import('./pages/AgentHub'));
const InboxPage = lazy(() => import('./pages/Inbox/InboxPage'));
const PublicInboxThreadPage = lazy(() => import('./pages/PublicInboxThreadPage'));
const MarketplaceNetworkPage = lazy(() => import('./pages/MarketplaceNetworkPage'));
const FinancePage = lazy(() => import('./pages/Admin/FinancePage'));
const CRMPage = lazy(() => import('./modules/crm/pages/CRMPage'));
const CrmContactDetailPage = lazy(() => import('./modules/crm/pages/ContactDetailPage').then(m => ({ default: m.ContactDetailPage })));
const CrmCompanyDetailPage = lazy(() => import('./modules/crm/pages/CompanyDetailPage').then(m => ({ default: m.CompanyDetailPage })));
const InvoiceDetailPage = lazy(() => import('./pages/Admin/InvoiceDetailPage'));
const PosPage = lazy(() => import('./modules/finance/pages/PosPage'));
const SalesPage = lazy(() => import('./pages/Sales/SalesPage'));
const EmployeeSelfServicePage = lazy(() => import('./modules/hr/pages/EmployeeSelfServicePage'));
const BlueprintLibraryPage = lazy(() => import('./pages/Blueprints/BlueprintLibraryPage').then(m => ({ default: m.BlueprintLibraryPage })));
const BlueprintEditorPage = lazy(() => import('./pages/Blueprints/BlueprintEditorPage').then(m => ({ default: m.BlueprintEditorPage })));

// Feature pages
const MaterialRecognition = lazy(() => import('./components/features/recognition/MaterialRecognition').then(m => ({ default: m.MaterialRecognition })));
const MoodBoardPage = lazy(() => import('./components/business/moodboard/MoodBoardPage').then(m => ({ default: m.MoodBoardPage })));
const MoodBoardDetailPage = lazy(() => import('./components/business/moodboard/MoodBoardDetailPage').then(m => ({ default: m.MoodBoardDetailPage })));

// AR Preview (standalone page for QR handoff)
const ARPage = lazy(() => import('./components/features/ar/ARPage').then(m => ({ default: m.default })).catch(() => ({ default: () => null })));

// Billing & quotes (customer-facing)
const SubscriptionPlansPage = lazy(() => import('./components/business/billing/SubscriptionPlansPage').then(m => ({ default: m.SubscriptionPlansPage })));
const CreditPackagesPage = lazy(() => import('./components/business/billing/CreditPackagesPage').then(m => ({ default: m.CreditPackagesPage })));
// Quote pages live in `src/modules/quotes/` — registered through buildModuleRoutes().

// CRM pages live in `src/modules/crm/` — registered through buildModuleRoutes().

// ── Admin pages (only loaded for admin users) ───────────────────────
const AdminDashboard = lazy(() => import('./components/Admin/AdminDashboard'));
const KnowledgeBaseManagement = lazy(() => import('./components/Admin/KnowledgeBase').then(m => ({ default: m.KnowledgeBaseManagement })));
const MaterialsDataPage = lazy(() => import('./components/Admin/MaterialsData').then(m => ({ default: m.MaterialsDataPage })));
const LogViewer = lazy(() => import('./components/Admin/LogViewer').then(m => ({ default: m.LogViewer })));
const DataHealthPage = lazy(() => import('./components/Admin/DataHealthPage'));
const AgentConfigsPage = lazy(() => import('./components/Admin/AgentConfigs').then(m => ({ default: m.AgentConfigsPage })));
// ApiGatewayAdmin, ModelDebuggingPanel, AIDataPage, BackgroundAgentsPage moved into
// AI Configurations tabs (2026-07-15); their old routes now redirect there.
const OperationsDashboard = lazy(() => import('./components/Admin/OperationsDashboard').then(m => ({ default: m.OperationsDashboard })));
const AsyncJobQueueMonitor = lazy(() => import('./components/Admin/AsyncJobQueueMonitor').then(m => ({ default: m.AsyncJobQueueMonitor })));
const PDFDocumentDetails = lazy(() => import('./pages/Admin/PDFDocumentDetails').then(m => ({ default: m.PDFDocumentDetails })));
const DataImportHub = lazy(() => import('./components/Admin/DataImportHub'));
// Quote Settings page lives in `src/modules/quotes/pages/QuoteSettingsPage.tsx` —
// registered through buildModuleRoutes() at /admin/quote-settings, plus
// embedded in /admin/quote-requests via a Sheet panel. (Previously here as a
// SystemSettingsPage lazy import.)
// QuoteRequestsAdmin + QuoteDetailPage live in `src/modules/quotes/pages/` — registered through buildModuleRoutes().
// StatusTagsManagement, UpsellsManagement, TimelineStepsManagement live in `src/modules/quotes/pages/` — registered through buildModuleRoutes().
// Email pages live in `src/modules/email/` — registered through buildModuleRoutes().
// Messaging pages live in `src/modules/messaging/` — registered through buildModuleRoutes().
const FlowsManagement = lazy(() => import('./components/Admin/FlowsManagement').then(m => ({ default: m.FlowsManagement })));
const MonitoringPage = lazy(() => import('./pages/Admin/MonitoringPage'));
const SupplierClaimsPage = lazy(() => import('./pages/Admin/SupplierClaimsPage'));
const FreightQuoteRequestsPage = lazy(() => import('./pages/Admin/FreightQuoteRequestsPage'));
const SupplierPortalPage = lazy(() => import('./pages/SupplierPortalPage'));
// Social Media route (/admin/social-media/accounts) is registered by the `social-media` module via buildModuleRoutes().
const FactoryAnalyticsPage = lazy(() => import('./pages/FactoryAnalyticsPage'));
const MaterialComparePage = lazy(() => import('./pages/MaterialComparePage'));
const AIDataRedirect = lazy(() => import('./pages/Admin/AIDataRedirect'));
const PublicMoodBoardPage = lazy(() => import('./pages/PublicMoodBoardPage'));
const SheetSharePage = lazy(() => import('./pages/SheetSharePage'));
const ToolsHubPage = lazy(() => import('./pages/Tools/ToolsHubPage'));
const PublicCareersPage = lazy(() => import('./pages/Careers/PublicCareersPage'));
const PublicJobPage = lazy(() => import('./pages/Careers/PublicJobPage'));
const ClockInKioskPage = lazy(() => import('./modules/hr/pages/ClockInKioskPage'));
const PriceScanPage = lazy(() => import('./pages/Tools/PriceScanPage'));
const MentionScanPage = lazy(() => import('./pages/Tools/MentionScanPage'));
const ProjectPlanPage = lazy(() => import('./pages/Tools/ProjectPlanPage'));
const HeatPumpToolPage = lazy(() => import('./pages/Tools/HeatPumpToolPage'));
const HeatingCostPage = lazy(() => import('./pages/Tools/HeatingCostPage'));
const PublicQuotePage = lazy(() => import('./pages/PublicQuotePage'));
const PublicClientViewPage = lazy(() => import('./pages/PublicClientViewPage'));
const PublicContractSignPage = lazy(() => import('./pages/PublicContractSignPage'));
// Project Workspace passwordless invite flow (public landing + auth-required accept)
const ProjectInviteLandingPage = lazy(() => import('./modules/projects/pages/InviteLandingPage').then(m => ({ default: m.InviteLandingPage })));
const ProjectAcceptInvitePage = lazy(() => import('./modules/projects/pages/AcceptInvitePage').then(m => ({ default: m.AcceptInvitePage })));
const PublicCatalogPage = lazy(() => import('./components/business/catalogs/PublicCatalogPage').then(m => ({ default: m.PublicCatalogPage })));
const PayInvoicePage = lazy(() => import('./pages/PayInvoicePage'));
const ProviderReturnPage = lazy(() => import('./pages/ProviderReturnPage'));
const PublicAccountStatementPage = lazy(() => import('./pages/PublicAccountStatementPage'));
const TripExpensesPage = lazy(() => import('./pages/TripExpensesPage'));
const ClientPortalPage = lazy(() => import('./pages/ClientPortalPage'));
const PublicStorefrontPage = lazy(() => import('./pages/PublicStorefrontPage'));
const ModulesPage = lazy(() => import('./pages/Admin/ModulesPage'));
const PlansPage = lazy(() => import('./pages/Admin/PlansPage'));
const ModuleSettingsPage = lazy(() => import('./components/Admin/Secrets/ModuleSettingsPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/legal/PrivacyPolicyPage'));
const TermsOfServicePage = lazy(() => import('./pages/legal/TermsOfServicePage'));
const HomePage = lazy(() => import('./pages/HomePage'));

// Module system — registers module routes declared in src/modules/*/index.ts
import { buildModuleRoutes } from './modules/_core';

// ── Loading fallback ────────────────────────────────────────────────
// Shared with the module-route guards (ModuleGate / EntitlementGuard) so every route shows the
// same loader while lazy chunks / entitlement checks resolve — no blank screens on navigation.
import { PageLoader } from './components/core/PageLoader';

// Coverage page component
const CoveragePage = () => (
  <div style={{ width: '100%', height: '100vh' }}>
    <iframe
      src="/coverage/lcov-report/index.html"
      style={{ width: '100%', height: '100%', border: 'none' }}
      title="Test Coverage Report"
    />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — avoid redundant refetches on mount
      gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
      refetchOnWindowFocus: false, // don't refetch on tab switch
      retry: 1, // single retry on failure
    },
  },
});

const App = () => (
  <CriticalErrorBoundary name="Application Root">
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceProvider>
        <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes — no auth required */}
                {/* Public marketing landing / OAuth branding home page (no login). */}
                <Route path="/home" element={<PageErrorBoundary name="Home Landing"><HomePage /></PageErrorBoundary>} />
                <Route path="/board/:id" element={<PageErrorBoundary name="Public Moodboard"><PublicMoodBoardPage /></PageErrorBoundary>} />
                <Route path="/sheets/share/:token" element={<PageErrorBoundary name="Shared Sheet"><SheetSharePage /></PageErrorBoundary>} />
                <Route path="/q/:token" element={<PageErrorBoundary name="Public Quote"><PublicQuotePage /></PageErrorBoundary>} />
                <Route path="/cv/:token" element={<PageErrorBoundary name="Client View"><PublicClientViewPage /></PageErrorBoundary>} />
                <Route path="/sign/:token" element={<PageErrorBoundary name="Contract Signing"><PublicContractSignPage /></PageErrorBoundary>} />
                {/* #209 — public customer inbox thread (tokenized, no auth) */}
                <Route path="/i/:token" element={<PageErrorBoundary name="Inbox Thread"><PublicInboxThreadPage /></PageErrorBoundary>} />
                <Route path="/careers/:slug" element={<PageErrorBoundary name="Careers"><PublicCareersPage /></PageErrorBoundary>} />
                <Route path="/careers/:slug/:job" element={<PageErrorBoundary name="Job posting"><PublicJobPage /></PageErrorBoundary>} />
                {/* #252 — public workspace clock-in kiosk: app.materialshub.gr/{workspace-slug}/clockin */}
                <Route path="/:slug/clockin" element={<PageErrorBoundary name="Clock-in Kiosk"><ClockInKioskPage /></PageErrorBoundary>} />
                <Route path="/tools" element={<PageErrorBoundary name="Tools Hub"><ToolsHubPage /></PageErrorBoundary>} />
                <Route path="/tools/price-scan" element={<PageErrorBoundary name="Price Scan"><PriceScanPage /></PageErrorBoundary>} />
                <Route path="/tools/mention-scan" element={<PageErrorBoundary name="Mention Scan"><MentionScanPage /></PageErrorBoundary>} />
                <Route path="/tools/project-plan" element={<PageErrorBoundary name="Project Plan Estimator"><ProjectPlanPage /></PageErrorBoundary>} />
                <Route path="/tools/heat-pump" element={<PageErrorBoundary name="Heat Pump Sizer"><HeatPumpToolPage /></PageErrorBoundary>} />
                <Route path="/tools/heating-cost" element={<PageErrorBoundary name="Heating Cost Comparison"><HeatingCostPage /></PageErrorBoundary>} />
                {/* Public legal pages — no auth required */}
                <Route path="/privacy" element={<PageErrorBoundary name="Privacy Policy"><PrivacyPolicyPage /></PageErrorBoundary>} />
                <Route path="/terms" element={<PageErrorBoundary name="Terms of Service"><TermsOfServicePage /></PageErrorBoundary>} />
                <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
                <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
                {/* Project Workspace invitations — passwordless flow, no AuthGuard. The accept page
                    expects a Supabase session (established by the magic-link callback) — if it isn't there,
                    its internal redirect bounces back to the invite landing. */}
                <Route path="/projects/invite/:token" element={<PageErrorBoundary name="Project Invite"><ProjectInviteLandingPage /></PageErrorBoundary>} />
                <Route path="/projects/accept-invite" element={<PageErrorBoundary name="Accept Project Invite"><ProjectAcceptInvitePage /></PageErrorBoundary>} />

                <Route
                  path="/auth"
                  element={
                    <PageErrorBoundary name="Auth Page">
                      <Auth />
                    </PageErrorBoundary>
                  }
                />
                <Route
                  path="/"
                  element={
                    <PageErrorBoundary name="Home Page">
                      <AuthGuard>
                        <Index />
                      </AuthGuard>
                    </PageErrorBoundary>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <PageErrorBoundary name="User Profile">
                      <AuthGuard>
                        <Layout>
                          <UserProfilePage />
                        </Layout>
                      </AuthGuard>
                    </PageErrorBoundary>
                  }
                />
                {/* The standalone /apps hub was folded into Profile → Modules, which lists the
                    same Hub-grouped catalog plus cost, credit and subscription state. */}
                <Route path="/apps" element={<Navigate to="/profile?tab=modules" replace />} />
                <Route
                  path="/recognition"
                  element={
                    <AuthGuard>
                      <Layout>
                        <MaterialRecognition />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/network"
                  element={
                    <AuthGuard>
                      <CapabilityGuard capability="network.manage">
                        <Layout>
                          <MarketplaceNetworkPage />
                        </Layout>
                      </CapabilityGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/finance"
                  element={
                    <AuthGuard>
                      <CapabilityGuard capability="finance.manage">
                        <EntitlementGuard moduleSlug="sales-finance" moduleName="Finance">
                          <Layout>
                            <FinancePage />
                          </Layout>
                        </EntitlementGuard>
                      </CapabilityGuard>
                    </AuthGuard>
                  }
                />
                {/* Client Portal — customer self-serve account (orders, invoices, receipts, balance).
                    Any authenticated user; non-customers just see the empty state. */}
                <Route
                  path="/portal"
                  element={
                    <AuthGuard>
                      <Layout>
                        <ClientPortalPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                {/* Sales-rep trip expense cards — any authenticated workspace member; NOT finance-gated. */}
                <Route
                  path="/trip-expenses"
                  element={
                    <AuthGuard>
                      <Layout>
                        <TripExpensesPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/crm"
                  element={
                    <AuthGuard>
                      <CapabilityGuard capability="crm.view">
                        <Layout>
                          <CRMPage />
                        </Layout>
                      </CapabilityGuard>
                    </AuthGuard>
                  }
                />
                {/* #252 — employee HR self-service. Gated by hr.self (persona 'employee' only),
                    so an invited employee sees ONLY their own record and never CRM/sales/finance. */}
                <Route
                  path="/my-hr"
                  element={
                    <AuthGuard>
                      <CapabilityGuard capability="hr.self">
                        <Layout>
                          <EmployeeSelfServicePage />
                        </Layout>
                      </CapabilityGuard>
                    </AuthGuard>
                  }
                />
                {/* Non-admin CRM customer detail — capability-gated (crm.view) so sales reps
                    and staff can open a customer + its Account overview. The admin dashboard
                    keeps its own /admin/crm/* deep-links (AdminGuard). */}
                <Route
                  path="/crm/contacts/:id"
                  element={
                    <AuthGuard>
                      <CapabilityGuard capability="crm.view">
                        <Layout>
                          <CrmContactDetailPage />
                        </Layout>
                      </CapabilityGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/crm/companies/:id"
                  element={
                    <AuthGuard>
                      <CapabilityGuard capability="crm.view">
                        <Layout>
                          <CrmCompanyDetailPage />
                        </Layout>
                      </CapabilityGuard>
                    </AuthGuard>
                  }
                />
                {/* #177 — the procurement inbox merged into the Quotes page as a tab.
                    Keep the old path alive as a redirect for bookmarks/notifications. */}
                <Route path="/requests" element={<Navigate to="/quotes?tab=requests" replace />} />
                {/* Workspace Settings retired — its content merged into Finance → Settings
                    (branding → Business identity, members → Team) and User Profile (credits).
                    Redirect old bookmarks/notifications to Finance. */}
                <Route path="/settings" element={<Navigate to="/finance" replace />} />
                <Route
                  path="/pos"
                  element={
                    <AuthGuard>
                      <CapabilityGuard capability="invoice.issue">
                        <Layout>
                          <PosPage />
                        </Layout>
                      </CapabilityGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/sales"
                  element={
                    <AuthGuard>
                      <CapabilityGuard capability="sales.portal">
                        <Layout>
                          <SalesPage />
                        </Layout>
                      </CapabilityGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/finance/invoices/:invoiceId"
                  element={
                    <AuthGuard>
                      <CapabilityGuard capability="finance.manage">
                        <Layout>
                          <InvoiceDetailPage />
                        </Layout>
                      </CapabilityGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/moodboard"
                  element={
                    <AuthGuard>
                      <Layout>
                        <MoodBoardPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/moodboard/:id"
                  element={
                    <AuthGuard>
                      <Layout>
                        <MoodBoardDetailPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                {/* Legacy alias — was accessible to any authenticated user; redirected
                    to admin-gated path so non-admins can no longer view ops data. */}
                <Route
                  path="/analytics"
                  element={<Navigate to="/admin/operations" replace />}
                />
                <Route
                  path="/admin"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <AdminDashboard />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/operations"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <OperationsDashboard />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                {/* Legacy route redirect */}
                <Route
                  path="/admin/analytics"
                  element={<Navigate to="/admin/operations" replace />}
                />

                <Route
                  path="/admin/knowledge-base"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <KnowledgeBaseManagement />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/materials-data"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <MaterialsDataPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/documents/:documentId"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <PDFDocumentDetails />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/ai-configs"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <AgentConfigsPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                {/* Redirect old routes to new routes */}
                <Route path="/admin/agent-configs" element={<Navigate to="/admin/ai-configs" replace />} />
                <Route path="/tasks" element={<Navigate to="/admin/operations" replace />} />
                {/* Relocated into AI Configurations tabs (2026-06-09) — keep deep-links alive. */}
                <Route path="/admin/prompt-templates" element={<Navigate to="/admin/ai-configs?tab=templates" replace />} />
                <Route path="/admin/extraction-prompts" element={<Navigate to="/admin/ai-configs?tab=extraction" replace />} />
                <Route path="/admin/material-analysis" element={<Navigate to="/admin/ai-configs?tab=sandbox" replace />} />
                {/* Retired (2026-06-09): misnamed "training" panel. Factory approvals moved to Operations. */}
                <Route path="/admin/training-models" element={<Navigate to="/admin/operations?tab=factory-onboarding" replace />} />
                {/* Folded into Operations → Performance tab (2026-06-09). */}
                <Route path="/admin/performance" element={<Navigate to="/admin/operations?tab=performance" replace />} />
                <Route
                  path="/admin/logs"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <LogViewer />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />

                <Route
                  path="/admin/data-health"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <DataHealthPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />

                {/* Relocated into AI Configurations → API Gateway tab (2026-07-15). */}
                <Route path="/admin/api-gateway" element={<Navigate to="/admin/ai-configs?tab=api-gateway" replace />} />

                {/* Material Search moved under Discover → Products ("Smart search" mode). The
                    standalone /search + legacy /search-hub now redirect there; the universal
                    Mac-style Spotlight (⌘K) is the always-available quick-search entry point. */}
                <Route
                  path="/search"
                  element={<Navigate to="/discover?tab=products&mode=smart" replace />}
                />
                <Route
                  path="/search-hub"
                  element={<Navigate to="/discover?tab=products&mode=smart" replace />}
                />
                <Route
                  path="/agent-hub"
                  element={
                    <AuthGuard>
                      <Layout>
                        <AgentHub />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/inbox"
                  element={
                    <AuthGuard>
                      <CapabilityGuard capability="inbox.use">
                        <Layout>
                          <InboxPage />
                        </Layout>
                      </CapabilityGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/compare"
                  element={
                    <AuthGuard>
                      <Layout>
                        <MaterialComparePage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/duplicate-detection"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <AIDataRedirect />
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                {/* Relocated into AI Configurations → AI Data / 3D Debugging tabs (2026-07-15). */}
                <Route path="/admin/batch-categorization" element={<Navigate to="/admin/ai-configs?tab=ai-data" replace />} />
                <Route path="/admin/3d-suggestions" element={<Navigate to="/admin/ai-configs?tab=3d-debug" replace />} />
                <Route path="/admin/3d-model-debugging" element={<Navigate to="/admin/ai-configs?tab=3d-debug" replace />} />
                <Route path="/admin/ai-data" element={<Navigate to="/admin/ai-configs?tab=ai-data" replace />} />
                <Route
                  path="/admin/metadata"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <AIDataRedirect />
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/relevancy"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <AIDataRedirect />
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/async-queue-monitor"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <AsyncJobQueueMonitor />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/data-import"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <DataImportHub />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/auth/callback"
                  element={
                    <PageErrorBoundary name="Auth Callback">
                      <AuthCallbackPage />
                    </PageErrorBoundary>
                  }
                />
                {/* CRM routes (/admin/crm, /contacts/:id, /companies/:id, /users/:id)
                    are registered by the `crm` module via buildModuleRoutes(). */}
                <Route
                  path="/billing/subscriptions"
                  element={
                    <AuthGuard>
                      <Layout>
                        <SubscriptionPlansPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/billing/credits"
                  element={
                    <AuthGuard>
                      <Layout>
                        <CreditPackagesPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                {/* Blueprint Estimating Engine (#242) — reusable scope-of-works library. */}
                <Route
                  path="/blueprints"
                  element={
                    <AuthGuard>
                      <Layout>
                        <BlueprintLibraryPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/blueprints/:id"
                  element={
                    <AuthGuard>
                      <Layout>
                        <BlueprintEditorPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                {/* Quote routes (/quotes, /quotes/:id, /quotes/:id/preview,
                    /quotes/requests, /admin/quote-requests, /admin/quotes/:id,
                    /admin/status-tags, /admin/upsells, /admin/timeline-steps)
                    are registered by the `quotes` module via buildModuleRoutes(). */}
                {/* Email routes (/admin/emails, /admin/email-templates/:id/edit)
                    are registered by the `email` module via buildModuleRoutes().
                    Messaging route (/admin/messaging) is registered by the
                    `messaging` module via buildModuleRoutes(). */}
                <Route
                  path="/admin/flows"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <FlowsManagement />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                {/* Relocated into AI Configurations → Background Agents tab (2026-07-15). */}
                <Route path="/admin/background-agents" element={<Navigate to="/admin/ai-configs?tab=background-agents" replace />} />
                {/* #244 B — unified monitoring (Price / Mention / Job) */}
                <Route
                  path="/admin/monitoring"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <MonitoringPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                {/* #247 F — operator review queue for supplier identity claims */}
                <Route
                  path="/admin/supplier-claims"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <SupplierClaimsPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                {/* Operator queue for tenant freight-quote requests (no-BYOK → request to operator) */}
                <Route
                  path="/admin/freight-quotes"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <FreightQuoteRequestsPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                {/* #247 F — supplier portal (claimed suppliers; RPC-gated, not admin) */}
                <Route
                  path="/supplier-portal"
                  element={
                    <AuthGuard>
                      <Layout>
                        <SupplierPortalPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                {/* Factory Analytics — factory users + admins */}
                <Route
                  path="/factory-analytics"
                  element={
                    <AuthGuard>
                      <Layout>
                        <FactoryAnalyticsPage />
                      </Layout>
                    </AuthGuard>
                  }
                />

                {/* Public Knowledge Base — no auth required. Global (not per-workspace). */}
                <Route
                  path="/knowledge-base"
                  element={
                    <PageErrorBoundary name="Public Knowledge Base">
                      <PublicKnowledgeBasePage />
                    </PageErrorBoundary>
                  }
                />
                {/* Brand/Factory main page + directory (top-level, public). The
                    brand's KB docs live UNDER this page as its Documentation
                    section — it is the canonical "company page" for a brand. */}
                <Route
                  path="/brands"
                  element={
                    <PageErrorBoundary name="Brands Index">
                      <BrandsIndexPage />
                    </PageErrorBoundary>
                  }
                />
                <Route
                  path="/brand/:slug"
                  element={
                    <PageErrorBoundary name="Brand Page">
                      <BrandKnowledgePage />
                    </PageErrorBoundary>
                  }
                />
                {/* Back-compat: the brand hub used to live under /knowledge-base */}
                <Route path="/knowledge-base/brands" element={<Navigate to="/brands" replace />} />
                <Route path="/knowledge-base/brand/:slug" element={<BrandKnowledgePage />} />
                {/* Individual article — real, slug-based, SEO-friendly URL */}
                <Route
                  path="/knowledge-base/:slug"
                  element={
                    <PageErrorBoundary name="Public Knowledge Base Article">
                      <PublicKnowledgeBasePage />
                    </PageErrorBoundary>
                  }
                />


                {/* Public profile — no auth required */}
                <Route
                  path="/u/:userId"
                  element={
                    <PageErrorBoundary name="Public Profile">
                      <PublicProfilePage />
                    </PageErrorBoundary>
                  }
                />

                {/* Discover creators — authenticated */}
                <Route
                  path="/discover"
                  element={
                    <PageErrorBoundary name="Discover">
                      <AuthGuard>
                        <CapabilityGuard capability="marketplace.browse">
                          <Layout>
                            <DiscoverPage />
                          </Layout>
                        </CapabilityGuard>
                      </AuthGuard>
                    </PageErrorBoundary>
                  }
                />

                <Route path="/health" element={<AuthGuard><HealthPage /></AuthGuard>} />
                <Route path="/ready" element={<AuthGuard><HealthPage /></AuthGuard>} />
                <Route path="/coverage" element={<AuthGuard><CoveragePage /></AuthGuard>} />
                <Route path="/coverage/*" element={<AuthGuard><CoveragePage /></AuthGuard>} />
                {/* AR Material Preview (public, no layout — for QR handoff from desktop) */}
                <Route path="/ar/:productId" element={<PageErrorBoundary name="AR Preview"><ARPage /></PageErrorBoundary>} />

                {/* Public Presentation Catalog (email-gated, no layout) */}
                <Route path="/c/:slug" element={<PageErrorBoundary name="Public Catalog"><PublicCatalogPage /></PageErrorBoundary>} />

                {/* Public invoice payment (token-gated, no auth, no layout) */}
                <Route path="/pay/:token" element={<PageErrorBoundary name="Pay invoice"><PayInvoicePage /></PageErrorBoundary>} />
                {/* #273 — providers whose return URL is account-configured (Viva) land here
                    with ?t=&s=; we map the order code back to the right invoice. */}
                <Route path="/pay/return" element={<PageErrorBoundary name="Payment return"><ProviderReturnPage /></PageErrorBoundary>} />

                {/* Public account statement (token + VAT/email gated, no auth, no layout) */}
                <Route path="/statement/:token" element={<PageErrorBoundary name="Account statement"><PublicAccountStatementPage /></PageErrorBoundary>} />

                {/* Public online storefront (slug-gated, no auth, no layout) */}
                <Route path="/store/:slug" element={<PageErrorBoundary name="Store"><PublicStorefrontPage /></PageErrorBoundary>} />

                {/* Admin: Modules registry */}
                <Route
                  path="/admin/modules"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <ModulesPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />

                {/* Admin: Plans & Pricing — module→plan grid + per-plan quotas (#214) */}
                <Route
                  path="/admin/plans"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <PlansPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />

                {/* Admin: Generic per-module Settings page (renders SecretsManagerCard for the slug).
                    Every module that declares secrets in platform_secrets gets this page automatically.
                    Modules with bespoke pages still override via their own route. */}
                <Route
                  path="/admin/modules/:slug/settings"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <ModuleSettingsPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />

                {/* Routes contributed by registered modules (see src/modules/*) */}
                {buildModuleRoutes()}

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
        </ThemeProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </QueryClientProvider>
    </HelmetProvider>
  </CriticalErrorBoundary>
);

export default App;
