import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { 
  BarChart3, 
  Brain, 
  Database, 
  Microscope, 
  Settings, 
  Activity,
  Search,
  Tags,
  Shield,
  ArrowLeft,
  Home
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const adminSections = [
    {
      title: "API Gateway",
      description: "Manage API endpoints, access control, and rate limiting",
      icon: Shield,
      path: "/admin/api-gateway",
      status: "active",
      count: "24 endpoints"
    },
    {
      title: "Analytics Dashboard",
      description: "AI performance metrics and system analytics",
      icon: BarChart3,
      path: "/admin/analytics",
      status: "active",
      count: "15 active models"
    },
    {
      title: "Agent ML Coordination", 
      description: "Monitor agent assignments and ML task distribution",
      icon: Brain,
      path: "/admin/agent-ml",
      status: "processing",
      count: "8 active tasks"
    },
    {
      title: "Knowledge Base Management",
      description: "View, edit, and manage knowledge base entries",
      icon: Database,
      path: "/admin/knowledge-base",
      status: "active", 
      count: "1,247 entries"
    },
    {
      title: "Material Analysis",
      description: "Advanced material properties and analysis results",
      icon: Microscope,
      path: "/admin/material-analysis",
      status: "active",
      count: "342 analyses"
    },
    {
      title: "Training & Models",
      description: "ML model training, CLIP, and classification management",
      icon: Settings,
      path: "/admin/training-models",
      status: "training",
      count: "3 training"
    },
    {
      title: "System Performance",
      description: "Processing queues, performance metrics, and monitoring",
      icon: Activity,
      path: "/admin/performance", 
      status: "active",
      count: "99.8% uptime"
    },
    {
      title: "RAG Management",
      description: "Enhanced RAG system configuration and optimization",
      icon: Search,
      path: "/admin/rag",
      status: "active",
      count: "5 providers"
    },
    {
      title: "Metadata Fields",
      description: "Configure dynamic material metadata fields",
      icon: Tags,
      path: "/admin/metadata",
      status: "active", 
      count: "23 fields"
    },
    {
      title: "SVBRDF Processing",
      description: "Standalone SVBRDF material extraction tools",
      icon: Microscope,
      path: "/admin/svbrdf",
      status: "active",
      count: "Advanced tools"
    },
    {
      title: "NeRF Reconstruction",
      description: "3D scene reconstruction from images",
      icon: Brain,
      path: "/admin/nerf",
      status: "active",
      count: "Standalone mode"
    },
    {
      title: "OCR Processing",
      description: "Text extraction from material images",
      icon: Search,
      path: "/admin/ocr",
      status: "active",
      count: "Text analysis"
    },
    {
      title: "Enhanced RAG Interface",
      description: "Direct access to enhanced search interface",
      icon: Database,
      path: "/admin/rag-interface",
      status: "active",
      count: "Search tools"
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-600';
      case 'processing': return 'bg-blue-500/20 text-blue-600';
      case 'training': return 'bg-orange-500/20 text-orange-600';
      default: return 'bg-gray-500/20 text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/')}
                className="flex items-center gap-2"
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                System administration and management tools
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-sm">
            Administrator Access
          </Badge>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminSections.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.path} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Icon className="h-8 w-8 text-primary" />
                    <Badge className={getStatusColor(section.status)}>
                      {section.status}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                  <CardDescription className="text-sm">
                    {section.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {section.count}
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <Link to={section.path}>
                        Manage
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>AI Models</span>
                  <Badge variant="outline">15 Active</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Processing Queue</span>
                  <Badge variant="outline">8 Tasks</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Knowledge Entries</span>
                  <Badge variant="outline">1,247</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>Material analysis completed</div>
                <div>CLIP training started</div>
                <div>New knowledge entry added</div>
                <div>Agent specialization updated</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/admin/training-models">Start New Training</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/admin/knowledge-base">Add Knowledge Entry</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/admin/agent-ml">Monitor Agents</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;