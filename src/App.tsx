import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/Layout/AuthGuard";
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
                <RAGManagementPanel />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
