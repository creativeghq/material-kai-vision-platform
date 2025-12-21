// @ts-ignore - QueryClient types are available at runtime
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/Layout/AuthGuard';

import { AdminGuard } from './components/Layout/AdminGuard';

// @ts-ignore - Temporary workaround for import issue
// Import CORS debug utility for troubleshooting
import './debug/cors-debug';
import Index from './pages/Index';
import Auth from './pages/Auth';
import NotFound from './pages/NotFound';
import AdminDashboard from './components/Admin/AdminDashboard';
import { KnowledgeBaseManagement } from './components/Admin/KnowledgeBase';
import { PDFProcessingDataPage } from './components/Admin/PDFProcessingData';
import { LogViewer } from './components/Admin/LogViewer';

import { AgentConfigsPage } from './components/Admin/AgentConfigs';
import { PromptTemplatesPage } from './components/Admin/PromptTemplates/PromptTemplatesPage';
import { ExtractionPromptsPage } from './components/Admin/ExtractionPrompts/ExtractionPromptsPage';
import { AdminPanel } from './components/Admin/AdminPanel';
import { ApiGatewayAdmin } from './components/Admin/ApiGatewayAdmin';
import { AITestingPanel } from './components/Admin/AITestingPanel';
import { AIMonitoringDashboard } from './components/Admin/AIMonitoringDashboard';
import { AnalyticsDashboard } from './components/Admin/AnalyticsDashboard';
import { SystemPerformance } from './components/Admin/SystemPerformance';
import { MaterialRecognition } from './components/Recognition/MaterialRecognition';
import { MoodBoardPage } from './components/MoodBoard/MoodBoardPage';
import { MoodBoardDetailPage } from './components/MoodBoard/MoodBoardDetailPage';
import { SVBRDFExtractionPage } from './components/SVBRDF/SVBRDFExtractionPage';
import { Layout } from './components/Layout/Layout';
// Removed: SearchHub - functionality available on frontend
import AgentHub from './pages/AgentHub';
import { MaterialSuggestionsPanel } from './components/Admin/MaterialSuggestionsPanel';
import ModelDebuggingPanel from './components/Admin/ModelDebuggingPanel';
import PackagesPanel from './components/Admin/PackagesPanel';
// Removed: MaterialScraperPage - now integrated into DataImportHub
import { PDFKnowledgeDemo } from './pages/PDFKnowledgeDemo';
import { UserProfilePage } from './pages/UserProfilePage';
import HealthPage from './pages/Health';
import {
  CriticalErrorBoundary,
  PageErrorBoundary,
} from './components/ErrorBoundary/ErrorBoundary';
// Removed: MivaaDocsViewer - now external links in admin header
// Removed: QualityStabilityMetricsPanel and Phase3MetricsPanel - now consolidated in AnalyticsDashboard
import { MetadataManagement } from './components/Admin/MetadataManagement';
import { RelevancyManagement } from './components/Admin/RelevancyManagement';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { CRMManagement } from './components/Admin/CRMManagement';
import { ContactDetailPage } from './pages/ContactDetailPage';
import { AsyncJobQueueMonitor } from './components/Admin/AsyncJobQueueMonitor';
import MaterialsPage from './pages/Materials';
// Removed: ChunkQualityDashboard - now consolidated in AnalyticsDashboard
import { PDFDocumentDetails } from './pages/Admin/PDFDocumentDetails';
import DataImportHub from './components/Admin/DataImportHub';
import { SubscriptionPlansPage } from './components/Billing/SubscriptionPlansPage';
import { CreditPackagesPage } from './components/Billing/CreditPackagesPage';
import { QuoteRequestsPage } from './components/Quotes/QuoteRequestsPage';
import { QuotesPage } from './pages/QuotesPage';
import { QuoteDetailCustomerPage } from './pages/QuoteDetailCustomerPage';
import { SystemSettingsPage } from './components/Admin/SystemSettingsPage';
import { QuoteRequestsAdmin } from './components/Admin/QuoteRequestsAdmin';
import { QuoteDetailPage } from './components/Admin/QuoteDetailPage';
import { StatusTagsManagement } from './components/Admin/StatusTagsManagement';
import { UpsellsManagement } from './components/Admin/UpsellsManagement';
import { TimelineStepsManagement } from './components/Admin/TimelineStepsManagement';

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
                      <UserProfilePage />
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
                      <AnalyticsDashboard />
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
                path="/admin/analytics"
                element={
                  <AuthGuard>
                    <AdminGuard>
                      <Layout>
                        <AnalyticsDashboard />
                      </Layout>
                    </AdminGuard>
                  </AuthGuard>
                }
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
                path="/admin/pdf-data"
                element={
                  <AuthGuard>
                    <AdminGuard>
                      <Layout>
                        <PDFProcessingDataPage />
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
              {/* Redirect old route to new route */}
              <Route path="/admin/agent-configs" element={<Navigate to="/admin/ai-configs" replace />} />
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
                path="/admin/ai-monitoring"
                element={
                  <AuthGuard>
                    <AdminGuard>
                      <Layout>
                        <AIMonitoringDashboard />
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
              {/* Removed: /admin/search-hub - functionality available on frontend */}
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
              {/* Removed: /admin/mivaa-docs - now external links in admin header */}
              {/* Removed: /admin/quality-stability-metrics and /admin/phase3-metrics - now consolidated in /admin/analytics */}
              {/* Removed: /admin/chunk-quality - now consolidated in /admin/analytics */}
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
              {/* Redirect /scraper to /admin/data-import (web scraping tab) */}
              <Route
                path="/scraper"
                element={<Navigate to="/admin/data-import" replace />}
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
                path="/quotes/requests"
                element={
                  <AuthGuard>
                    <Layout>
                      <QuoteRequestsPage />
                    </Layout>
                  </AuthGuard>
                }
              />

              <Route path="/health" element={<HealthPage />} />
              <Route path="/ready" element={<HealthPage />} />
              <Route path="/coverage" element={<CoveragePage />} />
              <Route path="/coverage/*" element={<CoveragePage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </CriticalErrorBoundary>
);

export default App;
