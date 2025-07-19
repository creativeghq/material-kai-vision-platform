import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/Layout/AuthGuard";

// Import configuration to ensure initialization
import "@/config";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./components/Admin/AdminDashboard";
import KnowledgeBaseManagement from "./components/Admin/KnowledgeBaseManagement";
import AgentMLCoordination from "./components/Admin/AgentMLCoordination";
import { AdminPanel } from "./components/Admin/AdminPanel";
import { ApiGatewayAdmin } from "./components/Admin/ApiGatewayAdmin";
import { MetadataFieldsManagement } from "./components/Admin/MetadataFieldsManagement";
import { RAGManagementPanel } from "./components/Admin/RAGManagementPanel";
import { AITestingPanel } from "./components/Admin/AITestingPanel";
import { AnalyticsDashboard } from "./components/Admin/AnalyticsDashboard";
import { SystemPerformance } from "./components/Admin/SystemPerformance";
import { MaterialRecognition } from "./components/Recognition/MaterialRecognition";

import { MoodBoardPage } from "./components/MoodBoard/MoodBoardPage";
import { Designer3DPage } from "./components/3D/Designer3DPage";
import { AIStudioPage } from "./components/AI/AIStudioPage";
import { Layout } from "./components/Layout/Layout";
import { SVBRDFExtractionPage } from "./components/SVBRDF/SVBRDFExtractionPage";
import { NeRFReconstructionPage } from "./components/NeRF/NeRFReconstructionPage";
import { OCRProcessor } from "./components/OCR/OCRProcessor";
import { IntegratedRAGManagement } from "./components/Admin/IntegratedRAGManagement";
import PDFProcessing from "./pages/PDFProcessing";
import SearchHub from "./pages/SearchHub";
import { MaterialSuggestionsPanel } from "./components/Admin/MaterialSuggestionsPanel";
import ModelDebuggingPanel from "./components/Admin/ModelDebuggingPanel";
import { MaterialScraperPage } from "./components/Scraper/MaterialScraperPage";
import { PDFKnowledgeDemo } from "./pages/PDFKnowledgeDemo";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={
              <AuthGuard>
                <Index />
              </AuthGuard>
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
                <AdminDashboard />
              </AuthGuard>
            } />
            <Route path="/admin/analytics" element={
              <AuthGuard>
                <AnalyticsDashboard />
              </AuthGuard>
            } />
            <Route path="/admin/knowledge-base" element={
              <AuthGuard>
                <KnowledgeBaseManagement />
              </AuthGuard>
            } />
            <Route path="/admin/agent-ml" element={
              <AuthGuard>
                <AgentMLCoordination />
              </AuthGuard>
            } />
            <Route path="/admin/material-analysis" element={
              <AuthGuard>
                <AITestingPanel />
              </AuthGuard>
            } />
            <Route path="/admin/training-models" element={
              <AuthGuard>
                <AdminPanel />
              </AuthGuard>
            } />
            <Route path="/admin/performance" element={
              <AuthGuard>
                <SystemPerformance />
              </AuthGuard>
            } />
            <Route path="/admin/rag" element={
              <AuthGuard>
                <IntegratedRAGManagement />
              </AuthGuard>
            } />
            <Route path="/admin/metadata" element={
              <AuthGuard>
                <MetadataFieldsManagement />
              </AuthGuard>
            } />
            <Route path="/admin/api-gateway" element={
              <AuthGuard>
                <ApiGatewayAdmin />
              </AuthGuard>
            } />
            <Route path="/admin/svbrdf" element={
              <AuthGuard>
                <SVBRDFExtractionPage />
              </AuthGuard>
            } />
            <Route path="/admin/nerf" element={
              <AuthGuard>
                <NeRFReconstructionPage />
              </AuthGuard>
            } />
            <Route path="/admin/ocr" element={
              <AuthGuard>
                <OCRProcessor />
              </AuthGuard>
            } />
            <Route path="/admin/pdf-processing" element={
              <AuthGuard>
                <Layout>
                  <PDFProcessing />
                </Layout>
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
            <Route path="/admin/search-hub" element={
              <AuthGuard>
                <Layout>
                  <SearchHub />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/admin/3d-suggestions" element={
              <AuthGuard>
                <Layout>
                  <MaterialSuggestionsPanel />
                </Layout>
              </AuthGuard>
            } />
            <Route path="/admin/3d-model-debugging" element={
              <AuthGuard>
                <ModelDebuggingPanel />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
