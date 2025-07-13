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
  Home,
  FileText,
  Globe,
  Upload
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const adminSections = [
    {
      title: "PDF Knowledge Base",
      description: "Upload and process PDF documents for material knowledge extraction",
      icon: FileText,
      path: "/admin/pdf-processing",
      status: "active",
      count: "Primary system",
      priority: 1
    },
    {
      title: "Search Hub",
      description: "Multi-modal search interface with text, image, and hybrid capabilities",
      icon: Search,
      path: "/admin/search-hub",
      status: "active",
      count: "Enhanced search",
      priority: 2
    },
    {
      title: "3D Material Suggestions",
      description: "AI-powered material recommendations for 3D generation",
      icon: Brain,
      path: "/admin/3d-suggestions",
      status: "active",
      count: "PDF-integrated",
      priority: 3
    },
    {
      title: "Knowledge Base Management",
      description: "Manage enhanced knowledge base entries from PDF processing",
      icon: Database,
      path: "/admin/knowledge-base",
      status: "active", 
      count: "1,247 entries",
      priority: 4
    },
    {
      title: "Material Catalog",
      description: "Browse and manage materials catalog with PDF integration",
      icon: Tags,
      path: "/catalog",
      status: "active",
      count: "342 materials",
      priority: 5
    },
    {
      title: "Analytics Dashboard",
      description: "System performance metrics and usage analytics",
      icon: BarChart3,
      path: "/admin/analytics",
      status: "active",
      count: "Real-time",
      priority: 6
    },
    {
      title: "API Gateway",
      description: "Manage API endpoints and access control",
      icon: Shield,
      path: "/admin/api-gateway",
      status: "active",
      count: "12 endpoints",
      priority: 7
    },
    {
      title: "System Performance",
      description: "Monitor processing queues and system health",
      icon: Activity,
      path: "/admin/performance", 
      status: "active",
      count: "99.8% uptime",
      priority: 8
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
        {/* Hero Section for PDF Upload */}
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileText className="h-6 w-6 text-primary" />
              PDF Knowledge Base - Core System
            </CardTitle>
            <CardDescription className="text-base">
              Upload PDF documents to extract materials knowledge and enhance the intelligent search system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button asChild size="lg" className="flex items-center gap-2">
                <Link to="/admin/pdf-processing">
                  <Upload className="h-5 w-5" />
                  Upload PDF Documents
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/admin/knowledge-base">
                  <Database className="h-5 w-5" />
                  Manage Knowledge Base
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminSections
            .sort((a, b) => (a.priority || 99) - (b.priority || 99))
            .map((section) => {
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
                  <span>PDF Documents</span>
                  <Badge variant="outline">156 Processed</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Knowledge Entries</span>
                  <Badge variant="outline">1,247 Active</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Search Queries</span>
                  <Badge variant="outline">8,432 Total</Badge>
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
                <div>• New PDF processed: Material Specifications v2.1</div>
                <div>• 3D material suggestions updated</div>
                <div>• Enhanced search index rebuilt</div>
                <div>• Knowledge base entries validated</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/admin/pdf-processing">Process New PDF</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/admin/search-hub">Test Search System</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/admin/3d-suggestions">Configure 3D Suggestions</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;