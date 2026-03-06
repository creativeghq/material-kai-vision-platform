import { lazy, Suspense } from 'react';
// @ts-ignore - QueryClient types are available at runtime
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { Toaster } from '@/components/core/ui/toaster';
import { Toaster as Sonner } from '@/components/core/ui/sonner';
import { TooltipProvider } from '@/components/core/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/core/AuthGuard';
import { AdminGuard } from './components/core/AdminGuard';
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
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage').then(m => ({ default: m.AuthCallbackPage })));
const MaterialsPage = lazy(() => import('./pages/Materials'));
const AgentHub = lazy(() => import('./pages/AgentHub'));
const PDFKnowledgeDemo = lazy(() => import('./pages/PDFKnowledgeDemo').then(m => ({ default: m.PDFKnowledgeDemo })));

// Feature pages
const MaterialRecognition = lazy(() => import('./components/features/recognition/MaterialRecognition').then(m => ({ default: m.MaterialRecognition })));
const MoodBoardPage = lazy(() => import('./components/business/moodboard/MoodBoardPage').then(m => ({ default: m.MoodBoardPage })));
const MoodBoardDetailPage = lazy(() => import('./components/business/moodboard/MoodBoardDetailPage').then(m => ({ default: m.MoodBoardDetailPage })));
const SVBRDFExtractionPage = lazy(() => import('./components/experimental/svbrdf/SVBRDFExtractionPage').then(m => ({ default: m.SVBRDFExtractionPage })));

// Billing & quotes (customer-facing)
const SubscriptionPlansPage = lazy(() => import('./components/business/billing/SubscriptionPlansPage').then(m => ({ default: m.SubscriptionPlansPage })));
const CreditPackagesPage = lazy(() => import('./components/business/billing/CreditPackagesPage').then(m => ({ default: m.CreditPackagesPage })));
const QuoteRequestsPage = lazy(() => import('./components/business/quotes/QuoteRequestsPage').then(m => ({ default: m.QuoteRequestsPage })));
const QuotesPage = lazy(() => import('./pages/QuotesPage').then(m => ({ default: m.QuotesPage })));
const QuoteDetailCustomerPage = lazy(() => import('./pages/QuoteDetailCustomerPage').then(m => ({ default: m.QuoteDetailCustomerPage })));

// CRM detail pages
const ContactDetailPage = lazy(() => import('./pages/ContactDetailPage').then(m => ({ default: m.ContactDetailPage })));
const CompanyDetailPage = lazy(() => import('./pages/CompanyDetailPage').then(m => ({ default: m.CompanyDetailPage })));
const UserDetailPage = lazy(() => import('./pages/UserDetailPage').then(m => ({ default: m.UserDetailPage })));

// ── Admin pages (only loaded for admin users) ───────────────────────
const AdminDashboard = lazy(() => import('./components/Admin/AdminDashboard'));
const KnowledgeBaseManagement = lazy(() => import('./components/Admin/KnowledgeBase').then(m => ({ default: m.KnowledgeBaseManagement })));
const MaterialsDataPage = lazy(() => import('./components/Admin/MaterialsData').then(m => ({ default: m.MaterialsDataPage })));
const LogViewer = lazy(() => import('./components/Admin/LogViewer').then(m => ({ default: m.LogViewer })));
const AgentConfigsPage = lazy(() => import('./components/Admin/AgentConfigs').then(m => ({ default: m.AgentConfigsPage })));
const PromptTemplatesPage = lazy(() => import('./components/Admin/PromptTemplates/PromptTemplatesPage').then(m => ({ default: m.PromptTemplatesPage })));
const ExtractionPromptsPage = lazy(() => import('./components/Admin/ExtractionPrompts/ExtractionPromptsPage').then(m => ({ default: m.ExtractionPromptsPage })));
const AdminPanel = lazy(() => import('./components/Admin/AdminPanel').then(m => ({ default: m.AdminPanel })));
const ApiGatewayAdmin = lazy(() => import('./components/Admin/ApiGatewayAdmin').then(m => ({ default: m.ApiGatewayAdmin })));
const AITestingPanel = lazy(() => import('./components/Admin/AITestingPanel').then(m => ({ default: m.AITestingPanel })));
const OperationsDashboard = lazy(() => import('./components/Admin/OperationsDashboard').then(m => ({ default: m.OperationsDashboard })));
const SystemPerformance = lazy(() => import('./components/Admin/SystemPerformance').then(m => ({ default: m.SystemPerformance })));
const MaterialSuggestionsPanel = lazy(() => import('./components/Admin/MaterialSuggestionsPanel').then(m => ({ default: m.MaterialSuggestionsPanel })));
const ModelDebuggingPanel = lazy(() => import('./components/Admin/ModelDebuggingPanel'));
const PackagesPanel = lazy(() => import('./components/Admin/PackagesPanel'));
const MetadataManagement = lazy(() => import('./components/Admin/MetadataManagement').then(m => ({ default: m.MetadataManagement })));
const RelevancyManagement = lazy(() => import('./components/Admin/RelevancyManagement').then(m => ({ default: m.RelevancyManagement })));
const CRMManagement = lazy(() => import('./components/Admin/CRMManagement').then(m => ({ default: m.CRMManagement })));
const AsyncJobQueueMonitor = lazy(() => import('./components/Admin/AsyncJobQueueMonitor').then(m => ({ default: m.AsyncJobQueueMonitor })));
const PDFDocumentDetails = lazy(() => import('./pages/Admin/PDFDocumentDetails').then(m => ({ default: m.PDFDocumentDetails })));
const DataImportHub = lazy(() => import('./components/Admin/DataImportHub'));
const SystemSettingsPage = lazy(() => import('./components/Admin/SystemSettingsPage').then(m => ({ default: m.SystemSettingsPage })));
const QuoteRequestsAdmin = lazy(() => import('./components/Admin/QuoteRequestsAdmin').then(m => ({ default: m.QuoteRequestsAdmin })));
const QuoteDetailPage = lazy(() => import('./components/Admin/QuoteDetailPage').then(m => ({ default: m.QuoteDetailPage })));
const StatusTagsManagement = lazy(() => import('./components/Admin/StatusTagsManagement').then(m => ({ default: m.StatusTagsManagement })));
const UpsellsManagement = lazy(() => import('./components/Admin/UpsellsManagement').then(m => ({ default: m.UpsellsManagement })));
const TimelineStepsManagement = lazy(() => import('./components/Admin/TimelineStepsManagement').then(m => ({ default: m.TimelineStepsManagement })));
const EmailManagement = lazy(() => import('./components/Admin/EmailManagement').then(m => ({ default: m.EmailManagement })));
const EmailTemplateBuilder = lazy(() => import('./pages/Admin/EmailTemplateBuilder').then(m => ({ default: m.EmailTemplateBuilder })));
const MessagingManagement = lazy(() => import('./components/Admin/MessagingManagement').then(m => ({ default: m.MessagingManagement })));
const FlowsManagement = lazy(() => import('./components/Admin/FlowsManagement').then(m => ({ default: m.FlowsManagement })));
const BackgroundAgentsPage = lazy(() => import('./components/Admin/BackgroundAgents/BackgroundAgentsPage').then(m => ({ default: m.BackgroundAgentsPage })));
const FactoryAnalyticsPage = lazy(() => import('./pages/FactoryAnalyticsPage'));

// ── Loading fallback ────────────────────────────────────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

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

const queryClient = new QueryClient();

const App = () => (
  <CriticalErrorBoundary name="Application Root">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
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
                <Route
                  path="/analytics"
                  element={
                    <AuthGuard>
                      <Layout>
                        <OperationsDashboard />
                      </Layout>
                    </AuthGuard>
                  }
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
                <Route
                  path="/admin/prompt-templates"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <PromptTemplatesPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/extraction-prompts"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <ExtractionPromptsPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/material-analysis"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <AITestingPanel />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/training-models"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <AdminPanel />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/performance"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <SystemPerformance />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
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
                  path="/admin/api-gateway"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <ApiGatewayAdmin />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/packages"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <PackagesPanel />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/svbrdf"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <SVBRDFExtractionPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />

                {/* Redirect /search-hub to /agent-hub */}
                <Route
                  path="/search-hub"
                  element={<Navigate to="/agent-hub" replace />}
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
                  path="/materials"
                  element={
                    <AuthGuard>
                      <Layout>
                        <MaterialsPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/3d-suggestions"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <MaterialSuggestionsPanel />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/3d-model-debugging"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <ModelDebuggingPanel />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/metadata"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <MetadataManagement />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/relevancy"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <RelevancyManagement />
                        </Layout>
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
                  path="/admin/system-settings"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <SystemSettingsPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/pdf-knowledge-demo"
                  element={
                    <AuthGuard>
                      <Layout>
                        <PDFKnowledgeDemo />
                      </Layout>
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
                <Route
                  path="/admin/crm"
                  element={
                    <AuthGuard>
                      <Layout>
                        <CRMManagement />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/crm/contacts/:id"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <ContactDetailPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/crm/companies/:id"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <CompanyDetailPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/crm/users/:id"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <UserDetailPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
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
                <Route
                  path="/quotes"
                  element={
                    <AuthGuard>
                      <Layout>
                        <QuotesPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/quotes/:id"
                  element={
                    <AuthGuard>
                      <Layout>
                        <QuoteDetailCustomerPage />
                      </Layout>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/quote-requests"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <QuoteRequestsAdmin />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/quotes/:id"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <QuoteDetailPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/status-tags"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <StatusTagsManagement />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/upsells"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <UpsellsManagement />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/timeline-steps"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <TimelineStepsManagement />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/emails"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <EmailManagement />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/messaging"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <MessagingManagement />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
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
                <Route
                  path="/admin/background-agents"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <BackgroundAgentsPage />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/admin/email-templates/:id/edit"
                  element={
                    <AuthGuard>
                      <AdminGuard>
                        <Layout>
                          <EmailTemplateBuilder />
                        </Layout>
                      </AdminGuard>
                    </AuthGuard>
                  }
                />
                <Route
                  path="/quotes/requests"
                  element={
                    <AuthGuard>
                      <Layout>
                        <QuoteRequestsPage />
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

                {/* Public Knowledge Base — no auth required */}
                <Route
                  path="/knowledge-base"
                  element={
                    <PageErrorBoundary name="Public Knowledge Base">
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
                        <Layout>
                          <DiscoverPage />
                        </Layout>
                      </AuthGuard>
                    </PageErrorBoundary>
                  }
                />

                <Route path="/health" element={<HealthPage />} />
                <Route path="/ready" element={<HealthPage />} />
                <Route path="/coverage" element={<CoveragePage />} />
                <Route path="/coverage/*" element={<CoveragePage />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </CriticalErrorBoundary>
);

export default App;
