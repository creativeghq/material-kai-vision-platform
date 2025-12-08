import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Database as DatabaseIcon,
  Link2,
  Microscope,
  Settings,
  Home,
  FileText,
  Globe,
  Users,
  Package,
  Bot,
  ExternalLink,
  Book,
  AlertTriangle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

// Types for our data structures
type SystemMetrics = {
  processedDocuments: number;
  knowledgeEntries: number;
  activeSessions: number;
};

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [, setSystemMetrics] = useState<SystemMetrics>({
    processedDocuments: 0,
    knowledgeEntries: 0,
    activeSessions: 0,
  });
  const [, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load system metrics from database
      const { count: processedDocs } = await supabase
        .from('processing_results')
        .select('*', { count: 'exact', head: true });

      const { count: knowledgeEntries } = await supabase
        .from('materials_catalog')
        .select('*', { count: 'exact', head: true });

      const { count: activeSessions } = await supabase
        .from('scraping_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      setSystemMetrics({
        processedDocuments: processedDocs || 0,
        knowledgeEntries: knowledgeEntries || 0,
        activeSessions: activeSessions || 0,
      });
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load real data from Supabase
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Organize admin sections by category
  const adminSections = {
    'Core Systems': [
      {
        title: 'Knowledge Base & Documentation',
        description:
          'User-created guides, manuals, and documentation with AI embeddings',
        icon: DatabaseIcon,
        path: '/admin/knowledge-base',
        status: 'active',
        count: 'User Docs',
      },
      {
        title: 'PDF Processing Data',
        description:
          'View all products, chunks, images, and embeddings generated from PDF processing',
        icon: DatabaseIcon,
        path: '/admin/pdf-data',
        status: 'active',
        count: 'Extraction Data',
      },
    ],
    'AI & Intelligence': [
      {
        title: 'Agent Configurations',
        description: 'Manage AI agent system prompts and behavior settings',
        icon: Bot,
        path: '/admin/agent-configs',
        status: 'active',
        count: 'Agent Prompts',
      },
    ],
    'Data Management': [
      {
        title: 'Data Import Hub',
        description: 'Import products from XML files and web scraping with AI-assisted field mapping',
        icon: DatabaseIcon,
        path: '/admin/data-import',
        status: 'active',
        count: 'XML & Web',
      },
      {
        title: 'Material Scraper',
        description: 'Scrape material data from websites and external sources',
        icon: Globe,
        path: '/scraper',
        status: 'active',
        count: 'Web scraping',
      },
      {
        title: 'Metadata Management',
        description: 'View and manage extracted metadata with scope detection and filtering',
        icon: Settings,
        path: '/admin/metadata',
        status: 'active',
        count: 'AI-powered',
      },
      {
        title: 'Relevancy Management',
        description: 'Manage entity relationships and relevance scoring algorithms',
        icon: Link2,
        path: '/admin/relevancy',
        status: 'active',
        count: '3 algorithms',
      },
      {
        title: 'API Gateway Admin',
        description: 'Manage API endpoints and gateway configuration',
        icon: Settings,
        path: '/admin/api-gateway',
        status: 'active',
        count: 'API management',
      },
    ],
    'CRM & User Management': [
      {
        title: 'User Management',
        description: 'Manage users, roles, subscriptions, and access control',
        icon: Users,
        path: '/admin/crm',
        status: 'active',
        count: 'CRM System',
      },
      {
        title: 'Quote Requests',
        description: 'View and manage customer quote requests with pricing',
        icon: FileText,
        path: '/admin/quote-requests',
        status: 'active',
        count: 'Quote System',
      },
    ],
    'System Monitoring': [
      {
        title: 'Async Job Queue Monitor',
        description:
          'Monitor image processing and AI analysis job queues in real-time',
        icon: Activity,
        path: '/admin/async-queue-monitor',
        status: 'active',
        count: 'Real-time',
      },
      {
        title: 'Analytics Dashboard',
        description: 'System performance metrics and usage analytics',
        icon: BarChart3,
        path: '/admin/analytics',
        status: 'active',
        count: 'Real-time',
      },
      {
        title: '3D Model Debugging',
        description: 'Monitor and debug AI model performance for 3D generation',
        icon: Microscope,
        path: '/admin/3d-model-debugging',
        status: 'active',
        count: '7 models',
      },
      {
        title: 'Packages Panel',
        description: 'Monitor system packages and dependencies',
        icon: Package,
        path: '/admin/packages',
        status: 'active',
        count: 'Dependencies',
      },
    ],
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-600';
      case 'processing':
        return 'bg-blue-500/20 text-blue-600';
      case 'training':
        return 'bg-orange-500/20 text-orange-600';
      default:
        return 'bg-gray-500/20 text-gray-600';
    }
  };

  const getMetricColor = (value: number, type: string) => {
    if (type === 'cpu' || type === 'memory') {
      if (value > 80) return 'text-red-600';
      if (value > 60) return 'text-yellow-600';
      return 'text-green-600';
    }
    return 'text-blue-600';
  };

  return (
    <div className="min-h-screen page-container">
      {/* Header with Navigation */}
      <div
        className="rounded-3xl section-spacing"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          border: 'none',
          boxShadow: 'var(--glass-shadow)',
          padding: 'var(--card-padding)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => navigate('/')}
                onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
                className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-white/10"
                variant="ghost"
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
            </div>
            <div className="h-6 w-px bg-white/20" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Admin Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                System administration and management tools
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              onClick={() => window.open('https://ethosco.sentry.io/issues/', '_blank')}
              className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-white/10"
              variant="ghost"
            >
              <AlertTriangle className="h-4 w-4" />
              Sentry
              <ExternalLink className="h-3 w-3" />
            </Button>
            <Button
              onClick={() => window.open('https://v1api.materialshub.gr/docs', '_blank')}
              className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-white/10"
              variant="ghost"
            >
              <Book className="h-4 w-4" />
              API Docs
              <ExternalLink className="h-3 w-3" />
            </Button>
            <Button
              onClick={() => window.open('https://v1api.materialshub.gr/redoc', '_blank')}
              className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-white/10"
              variant="ghost"
            >
              <FileText className="h-4 w-4" />
              ReDoc
              <ExternalLink className="h-3 w-3" />
            </Button>
            <div className="h-6 w-px bg-white/20" />
            <Badge className="text-sm px-2 py-1" style={{ background: 'var(--mocha-color)' }}>
              Administrator Access
            </Badge>
          </div>
        </div>
      </div>

      {/* System Status Section */}
      <div className="px-6 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(var(--primary) / 0.1)'
                  }}
                >
                  <FileText className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">PDF Documents</p>
                  <p className="text-2xl font-bold">156</p>
                </div>
              </div>
              <Badge className="px-2 py-1" style={{ background: 'var(--mocha-color)', color: 'var(--foreground-dark)' }}>
                Processed
              </Badge>
            </div>
          </div>

          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(var(--primary) / 0.1)'
                  }}
                >
                  <DatabaseIcon className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Knowledge Entries</p>
                  <p className="text-2xl font-bold">1,247</p>
                </div>
              </div>
              <Badge className="px-2 py-1" style={{ background: 'var(--mocha-color)', color: 'var(--foreground-dark)' }}>
                Active
              </Badge>
            </div>
          </div>

          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(var(--primary) / 0.1)'
                  }}
                >
                  <BarChart3 className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Search Queries</p>
                  <p className="text-2xl font-bold">8,432</p>
                </div>
              </div>
              <Badge className="px-2 py-1" style={{ background: 'var(--mocha-color)', color: 'var(--foreground-dark)' }}>
                Total
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Admin Sections by Category */}
        <div className="space-y-8">
              {Object.entries(adminSections).map(([category, sections]) => (
                <div key={category}>
                  <h2 className="text-2xl font-bold mb-4 text-gray-800">
                    {category}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sections.map((section) => {
                      const Icon = section.icon;
                      return (
                        <div
                          key={section.path}
                          className="dashboard-card transition-all duration-200 hover:shadow-md"
                        >
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-3">
                              <div
                                className="flex items-center justify-center"
                                style={{
                                  width: '2.5rem',
                                  height: '2.5rem',
                                  borderRadius: 'var(--radius-lg)',
                                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                                }}
                              >
                                <Icon className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                              </div>
                              <Badge className={getStatusColor(section.status)}>
                                {section.status}
                              </Badge>
                            </div>
                            <h3 className="text-lg font-semibold mb-2">
                              {section.title}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {section.description}
                            </p>
                          </div>
                          <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(0, 0, 0, 0.06)' }}>
                            <span className="text-sm text-muted-foreground">
                              {section.count}
                            </span>
                            <Button
                              asChild
                              size="sm"
                              style={{
                                backgroundColor: 'hsl(var(--primary))',
                                color: 'white'
                              }}
                              className="hover:opacity-90"
                            >
                              <Link to={section.path}>Manage</Link>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>


      </div>
    </div>
  );
};

export default AdminDashboard;
