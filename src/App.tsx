// @ts-ignore - QueryClient types are available at runtime
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/Layout/AuthGuard';
import { monitoringService } from '@/services/monitoring/monitoringService';

import { AdminGuard } from './components/Layout/AdminGuard';

// @ts-ignore - Temporary workaround for import issue
// Import CORS debug utility for troubleshooting
import './debug/cors-debug';
import Index from './pages/Index';
import Auth from './pages/Auth';
import NotFound from './pages/NotFound';
import AdminDashboard from './components/Admin/AdminDashboard';
import { MaterialKnowledgeBase } from './components/Admin/MaterialKnowledgeBase';
import AgentMLCoordination from './components/Admin/AgentMLCoordination';
import { AdminPanel } from './components/Admin/AdminPanel';
import { ApiGatewayAdmin } from './components/Admin/ApiGatewayAdmin';
import { MetadataFieldsManagement } from './components/Admin/MetadataFieldsManagement';
import { AITestingPanel } from './components/Admin/AITestingPanel';
import { AIMonitoringDashboard } from './components/Admin/AIMonitoringDashboard';
import { AnalyticsDashboard } from './components/Admin/AnalyticsDashboard';
import { SystemPerformance } from './components/Admin/SystemPerformance';
import { MaterialRecognition } from './components/Recognition/MaterialRecognition';
import { MoodBoardPage } from './components/MoodBoard/MoodBoardPage';
import { Designer3DPage } from './components/3D/Designer3DPage';
import { AIStudioPage } from './components/AI/AIStudioPage';
import { SVBRDFExtractionPage } from './components/SVBRDF/SVBRDFExtractionPage';
import { Layout } from './components/Layout/Layout';
import { IntegratedRAGManagement } from './components/Admin/IntegratedRAGManagement';
import PDFProcessing from './pages/PDFProcessing';
import SearchHub from './pages/SearchHub';
import { MaterialSuggestionsPanel } from './components/Admin/MaterialSuggestionsPanel';
import ModelDebuggingPanel from './components/Admin/ModelDebuggingPanel';
import PackagesPanel from './components/Admin/PackagesPanel';
import { MaterialScraperPage } from './components/Scraper/MaterialScraperPage';
import { PDFKnowledgeDemo } from './pages/PDFKnowledgeDemo';
import HealthPage from './pages/Health';
import { CriticalErrorBoundary, PageErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { MivaaDocsViewer } from './components/Admin/MivaaDocsViewer';
import QualityStabilityMetricsPanel from './components/Admin/QualityStabilityMetricsPanel';
import Phase3MetricsPanel from './components/Admin/Phase3MetricsPanel';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { CRMManagement } from './components/Admin/CRMManagement';
import { AsyncJobQueueMonitor } from './components/Admin/AsyncJobQueueMonitor';
import MaterialsPage from './pages/Materials';
import { ChunkQualityDashboard } from './components/Admin/ChunkQualityDashboard';
import { PDFProcessingMonitor } from './components/Admin/PDFProcessingMonitor';
import { PDFDocumentDetails } from './pages/Admin/PDFDocumentDetails';

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

// Initialize monitoring service with basic config
monitoringService.initialize({
  enabled: false,
  environment: 'development',
  version: '1.0.0',
  providers: {},
});

const App = () => (
  <CriticalErrorBoundary name="Application Root">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <Routes>
            <Route path="/auth" element={
              <PageErrorBoundary name="Auth Page">
                <Auth />
              </PageErrorBoundary>
            } />
            <Route path="/" element={
              <PageErrorBoundary name="Home Page">
                <AuthGuard>
                  <Index />
                </AuthGuard>
              </PageErrorBoundary>
            } />
            <Route path="/recognition" element={
              <AuthGuard>
                <Layout>
                  <MaterialRecognition />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/moodboard" element={
              <AuthGuard>
                <Layout>
                  <MoodBoardPage />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/3d" element={
              <AuthGuard>
                <Layout>
                  <Designer3DPage />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/agents" element={
              <AuthGuard>
                <Layout>
                  <AIStudioPage />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/analytics" element={
              <AuthGuard>
                <Layout>
                  <AnalyticsDashboard />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/admin" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <AdminDashboard />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/analytics" element={
              <AuthGuard>
                <AdminGuard>
                  <AnalyticsDashboard />
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/pdf-processing-monitor" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <PDFProcessingMonitor />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/knowledge-base" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <MaterialKnowledgeBase />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/documents/:documentId" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <PDFDocumentDetails />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/agent-ml" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <AgentMLCoordination />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/material-analysis" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <AITestingPanel />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/training-models" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <AdminPanel />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/performance" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <SystemPerformance />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/rag" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <IntegratedRAGManagement />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/metadata" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <MetadataFieldsManagement />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/api-gateway" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <ApiGatewayAdmin />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/ai-monitoring" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <AIMonitoringDashboard />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/packages" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <PackagesPanel />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/svbrdf" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <SVBRDFExtractionPage />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />


            <Route path="/admin/pdf-processing" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <PDFProcessing />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/pdf-processing" element={
              <AuthGuard>
                <Layout>
                  <PDFProcessing />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/search-hub" element={
              <AuthGuard>
                <Layout>
                  <SearchHub />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/materials" element={
              <AuthGuard>
                <Layout>
                  <MaterialsPage />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/admin/search-hub" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <SearchHub />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/3d-suggestions" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <MaterialSuggestionsPanel />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/3d-model-debugging" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <ModelDebuggingPanel />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/mivaa-docs" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <MivaaDocsViewer />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/quality-stability-metrics" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <QualityStabilityMetricsPanel />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/phase3-metrics" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <Phase3MetricsPanel />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/chunk-quality" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <ChunkQualityDashboard />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/admin/async-queue-monitor" element={
              <AuthGuard>
                <AdminGuard>
                  <Layout>
                    <AsyncJobQueueMonitor />
                  </Layout>
                </AdminGuard>
              </AuthGuard>
            } />
            <Route path="/scraper" element={
              <AuthGuard>
                <Layout>
                  <MaterialScraperPage />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/pdf-knowledge-demo" element={
              <AuthGuard>
                <Layout>
                  <PDFKnowledgeDemo />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/auth/callback" element={
              <PageErrorBoundary name="Auth Callback">
                <AuthCallbackPage />
              </PageErrorBoundary>
            } />
            <Route path="/admin/crm" element={
              <AuthGuard>
                <Layout>
                  <CRMManagement />
                </Layout>
              </AuthGuard>
            } />
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
