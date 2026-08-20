import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Database as DatabaseIcon,
  Microscope,
  Settings,
  Home,
  FileText,
  Package,
  Bot,
  ExternalLink,
  Book,
  AlertTriangle,
  ScrollText,
  MessageSquare,
  Workflow,
  ChevronDown,
  FileJson,
  ShieldCheck,
  Boxes,
} from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { PageHeader } from '@/components/shared/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { ResetPlatformDialog } from './ResetPlatformDialog';
import { AdminStatCard } from './AdminStatCard';
import { useAdminDashboardCards } from '@/modules/_core';
import { dataIntegrityService } from '@/services/dataIntegrityService';
import { formatNumber } from '@/utils/decimal';

// Types for our data structures
type SystemMetrics = {
  processedDocuments: number;
  knowledgeEntries: number;
  activeSessions: number;
  totalChats: number;
  interiorChats: number;
};

// Static — no runtime dependencies, defined outside component to avoid recreation on every render
const adminSections = {
  'Core Systems': [
    {
      title: 'Materials Data',
      description:
        'View all products, chunks, images, and embeddings from PDF, XML, and Web Scraping sources',
      icon: DatabaseIcon,
      path: '/admin/materials-data',
      status: 'active',
      count: 'All Sources',
    },
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
      title: 'Modules',
      description: 'Enable or disable platform features. First-class modules that can be toggled on/off and later sold as add-ons.',
      icon: Package,
      path: '/admin/modules',
      status: 'active',
      count: 'Module Registry',
    },
  ],
  'Data Management': [
    {
      title: 'Material Processing',
      description: 'Upload and process materials from PDFs, XML files, and web scraping',
      icon: DatabaseIcon,
      path: '/admin/data-import',
      status: 'active',
      count: 'Multi-source',
    },
    {
      title: 'AI Data',
      description: 'Pipeline output review — extracted metadata, entity relationships, and AI-detected duplicates, all in one place',
      icon: DatabaseIcon,
      path: '/admin/ai-configs?tab=ai-data',
      status: 'active',
      count: 'Metadata · Relevancy · Duplicates',
    },
    {
      title: 'API Gateway Admin',
      description: 'Manage API endpoints and gateway configuration',
      icon: Settings,
      path: '/admin/ai-configs?tab=api-gateway',
      status: 'active',
      count: 'API management',
    },
    {
      title: 'Background Agents',
      description: 'Autonomous AI agents that run on schedules, events, or chains behind the scenes',
      icon: Bot,
      path: '/admin/ai-configs?tab=background-agents',
      status: 'active',
      count: 'AI Agents',
    },
  ],
  'CRM & User Management': [
    // 'User Management' (CRM) and 'Quote Requests' (Quotes) are contributed by
    // the `crm` and `quotes` modules via their admin-dashboard navItems[].
    // See useAdminDashboardCards().
  ],
  'Finance & Billing': [
    // Finance Dashboard tile is contributed by the `sales-finance` module
    // via its admin-dashboard navItems[]. See useAdminDashboardCards().
  ],
  'Communications': [
    // 'Email Management' and 'Messaging (SMS/WhatsApp)' are contributed by the
    // `email` and `messaging` modules via their admin-dashboard navItems[].
    // See useAdminDashboardCards().
    {
      title: 'Flows',
      description: 'Build visual workflow automations with triggers, conditions, and actions',
      icon: Workflow,
      path: '/flows',
      status: 'active',
      count: 'Visual Builder',
    },
    // 'Social Media Accounts' is contributed by the `social-media` module
    // via its admin-dashboard navItems[]. See useAdminDashboardCards().
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
      title: 'Monitoring',
      description: 'Price, mention, and job-research tracking in one place',
      icon: Activity,
      path: '/admin/monitoring',
      status: 'active',
      count: 'Price · Mentions · Jobs',
    },
    {
      title: 'Supplier Identity Claims',
      description: 'Operator review of workspaces claiming a global supplier identity',
      icon: ShieldCheck,
      path: '/admin/supplier-claims',
      status: 'active',
      count: 'Operator',
    },
    {
      title: 'Master Catalog',
      description: 'Manufacturer-published product data, and factory price changes awaiting your review',
      icon: Boxes,
      path: '/catalog-master',
      status: 'active',
      count: 'Operator',
    },
    {
      title: 'Operations Management',
      description: 'Monitor data processing, AI performance, and system health',
      icon: BarChart3,
      path: '/admin/operations',
      status: 'active',
      count: 'Real-time',
    },
    {
      title: 'AI Configurations',
      description: 'Prompts, model pricing, AI performance, AI data, background agents, API gateway & 3D debugging — all AI ops in one place',
      icon: Bot,
      path: '/admin/ai-configs',
      status: 'active',
      count: 'AI Ops Hub',
    },
    {
      title: '3D Model Debugging',
      description: 'Monitor and debug AI model performance for 3D generation',
      icon: Microscope,
      path: '/admin/ai-configs?tab=3d-debug',
      status: 'active',
      count: '7 models',
    },
{
      title: 'Application Logs',
      description:
        'View real-time application logs with filtering and search capabilities',
      icon: ScrollText,
      path: '/admin/logs',
      status: 'active',
      count: 'Real-time',
    },
    {
      title: 'Data Health',
      description: 'Cross-platform data integrity checks — detects and auto-heals record drift.',
      icon: ShieldCheck,
      path: '/admin/data-health',
      status: 'active',
      count: 'Daily',
    },
  ],
};

const AdminDashboard: React.FC = () => {
  const moduleCards = useAdminDashboardCards();
  // Open data-integrity findings — rendered as a red count on the Data Health tile.
  const [openFindings, setOpenFindings] = useState(0);
  useEffect(() => {
    void dataIntegrityService.listFindings({ status: 'open' })
      .then((f) => setOpenFindings(f.length))
      .catch(() => setOpenFindings(0));   // best-effort: the tile still renders without the count
  }, []);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    processedDocuments: 0,
    knowledgeEntries: 0,
    activeSessions: 0,
    totalChats: 0,
    interiorChats: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      // Rendered as the "Search Queries" tile. It counted `search_analytics`, which has no
      // producer — its only writer sits in a method with zero callers — so the tile read 0
      // permanently while real searches were being recorded in `search_query_tracking` by
      // MIVAA's /api/rag/search. (#310 item 4)
      const { count: activeSessions } = await supabase
        .from('search_query_tracking')
        .select('*', { count: 'exact', head: true });

      const { count: totalChats } = await supabase
        .from('agent_chat_conversations')
        .select('*', { count: 'exact', head: true });

      const { count: interiorChats } = await supabase
        .from('agent_chat_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', 'interior-designer');

      setSystemMetrics({
        processedDocuments: processedDocs || 0,
        knowledgeEntries: knowledgeEntries || 0,
        activeSessions: activeSessions || 0,
        totalChats: totalChats || 0,
        interiorChats: interiorChats || 0,
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


  return (
    <div>
      <PageHeader
        icon={Settings}
        title="Admin Dashboard"
        subtitle="System administration and management tools"
        actions={
          <>
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link to="/">
                <Home className="h-4 w-4" />
                Back to Main
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  Tools
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                <DropdownMenuItem onClick={() => window.open('https://ethosco.sentry.io/issues/', '_blank')} className="flex items-center gap-2 cursor-pointer">
                  <AlertTriangle className="h-4 w-4" />
                  Sentry
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open('https://v1api.materialshub.gr/docs', '_blank')} className="flex items-center gap-2 cursor-pointer">
                  <Book className="h-4 w-4" />
                  API Docs
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open('https://v1api.materialshub.gr/redoc', '_blank')} className="flex items-center gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" />
                  ReDoc
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.open('/api/edge-swagger.html', '_blank')} className="flex items-center gap-2 cursor-pointer">
                  <DatabaseIcon className="h-4 w-4" />
                  Supabase API Docs
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open('/api/openapi-edge.json', '_blank')} className="flex items-center gap-2 cursor-pointer">
                  <FileJson className="h-4 w-4" />
                  Supabase OpenAPI (JSON)
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <ResetPlatformDialog />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Loading / error states */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}
      {error && !loading && (
        <div className="mx-6 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* System Status + Main Content (hidden while loading) */}
      {!loading && (
        <>
      <div className="px-3 sm:px-6 pt-4 sm:pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <AdminStatCard title="Processed Documents" value={formatNumber(systemMetrics.processedDocuments)} icon={FileText} />
          <AdminStatCard title="Knowledge Entries" value={formatNumber(systemMetrics.knowledgeEntries)} icon={DatabaseIcon} />
          <AdminStatCard title="Search Queries" value={formatNumber(systemMetrics.activeSessions)} icon={BarChart3} />
          <AdminStatCard title="Total Chats" value={formatNumber(systemMetrics.totalChats)} icon={MessageSquare} />
          <AdminStatCard title="Interior Chats" value={formatNumber(systemMetrics.interiorChats)} icon={Home} />
        </div>
      </div>

      {/* Main Content */}
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Admin Sections by Category — static config + module-contributed cards merged */}
        <div className="space-y-6 sm:space-y-8">
              {Object.entries(
                (() => {
                  const merged: Record<string, typeof adminSections['Core Systems']> = {};
                  const seenPaths = new Set<string>();
                  for (const [cat, items] of Object.entries(adminSections)) {
                    merged[cat] = [];
                    for (const item of items) {
                      if (seenPaths.has(item.path)) continue;
                      seenPaths.add(item.path);
                      merged[cat].push(item);
                    }
                  }
                  for (const card of moduleCards) {
                    if (seenPaths.has(card.path)) continue;
                    seenPaths.add(card.path);
                    if (!merged[card.category]) merged[card.category] = [];
                    merged[card.category].push({
                      title: card.title,
                      description: card.description,
                      icon: card.icon,
                      path: card.path,
                      status: card.status,
                      count: card.count,
                    });
                  }
                  return merged;
                })(),
              ).map(([category, sections]) => (
                <div key={category}>
                  <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-gray-800">
                    {category}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
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
                                  backgroundColor: 'hsl(var(--primary) / 0.1)',
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
                            {/* A nightly probe nobody can see is a probe nobody acts
                                on. Open integrity findings surface as a red count on the tile so a
                                live problem is visible from the admin landing page, not only to
                                whoever thinks to open Data Health. */}
                            <span className={`text-sm ${section.path === '/admin/data-health' && openFindings > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                              {section.path === '/admin/data-health'
                                ? (openFindings > 0
                                    ? `${openFindings} open finding${openFindings === 1 ? '' : 's'}`
                                    : 'All checks clean')
                                : section.count}
                            </span>
                            <Button
                              asChild
                              size="sm"
                              style={{
                                backgroundColor: 'hsl(var(--primary))',
                                color: 'white',
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
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
