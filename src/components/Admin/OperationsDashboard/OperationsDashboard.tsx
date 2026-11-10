import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Users,
  TrendingUp,
  Activity,
  FileText,
  RefreshCw,
  Database,
  Gauge,
  Search,
  CreditCard,
  DollarSign,
  Globe,
  Mail,
  Send,
  BookOpen,
  KeyRound,
  Bell,
} from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { MIVAA_API_URL } from '@/config/mivaa';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Progress } from '@/components/core/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from '../GlobalAdminHeader';
import { UnifiedProcessingMonitor } from '../UnifiedProcessingMonitor';
import { PipelineStrategyMetricsPanel } from './PipelineStrategyMetricsPanel';
import { CatalogOperationsTab } from './CatalogOperationsTab';
import { SystemHealthMonitor } from '../SystemHealthMonitor';
import { StorageAuditPanel } from '../StorageAuditPanel';
import { GenerationProviderHealth } from '../GenerationProviderHealth';
// Relocated here from the orphaned /admin/performance route.
import { SystemPerformance } from '../SystemPerformance';
// Relocated here from the misnamed /admin/training-models grab-bag.
import { FactoryRegistrationsTab } from '../FactoryRegistrationsTab';
import { ResellerApplicationsTab } from '../ResellerApplicationsTab';
import { MarketplaceApprovalsTab } from '../MarketplaceApprovalsTab';
import { FactoryAccessRequestsTab } from '../FactoryAccessRequestsTab';
import { PlatformOverviewTab } from '../PlatformOverviewTab';
import { SearchAnalyticsDashboard } from '../SearchAnalyticsDashboard';
import { SEODashboardPanel } from '@/components/business/seo-toolkit/SEODashboard';
import { SecretsManagerCard } from '@/components/Admin/Secrets/SecretsManagerCard';
import { ModuleSubscribersPanel } from './ModuleSubscribersPanel';
import { PushBroadcastPanel } from './PushBroadcastPanel';
import { InboxAIPanel } from './InboxAIPanel';
import { CapabilityLedgerPanel } from './CapabilityLedgerPanel';
import { ChannelsCostPanel } from './ChannelsCostPanel';
import { ChannelsBillingDetail } from './ChannelsBillingDetail';

import type {
  DataProcessingStats,
  ExternalServiceUsageData,
  ResendEmailStats,
  NotificationChannelStats,
} from './types';
import { EXT_SERVICE_COLORS, EXT_SERVICE_LABELS } from './constants';
import { formatNumber } from '@/utils/decimal';

const VALID_OPERATIONS_TABS = new Set([
  'system-health', 'data-processing', 'performance',
  'search-analytics', 'services-billing', 'platform-overview', 'catalogs',
  'seo-toolkit', 'factory-onboarding', 'keys', 'modules', 'push',
]);

const OperationsDashboardInner: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initial tab from ?tab= query param so other admin pages can deep-link
  // (e.g. /admin/operations?tab=catalogs from the Catalogs list page).
  // `catalog` is what ingestion-audit notifications already stored.
  const rawTab = searchParams.get('tab') || '';
  const requestedTab = rawTab === 'catalog' ? 'catalogs' : rawTab;
  const initialTab = VALID_OPERATIONS_TABS.has(requestedTab) ? requestedTab : 'system-health';
  const [opsActiveTab, setOpsActiveTab] = useState<string>(initialTab);
  const handleTabChange = useCallback((value: string) => {
    setOpsActiveTab(value);
    // Mirror the tab change into the URL so refresh / back keeps the user on the same view
    const next = new URLSearchParams(searchParams);
    if (value === 'system-health') next.delete('tab');
    else next.set('tab', value);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Which data-processing sources failed to load this pass. Non-empty means the tiles below are
  // not measurements. (#365 AD-7)
  const [processingSourcesUnavailable, setProcessingSourcesUnavailable] = useState<string[]>([]);
  const [dataProcessingStats, setDataProcessingStats] = useState<DataProcessingStats>({
    pdf: { total: 0, completed: 0, failed: 0, processing: 0, avgProcessingTime: 0 },
    xml: { total: 0, completed: 0, failed: 0, processing: 0, totalProducts: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [extServiceData, setExtServiceData] = useState<ExternalServiceUsageData | null>(null);
  const [extServicePeriod, setExtServicePeriod] = useState('7d');
  const [extServiceLoading, setExtServiceLoading] = useState(false);
  const [svcAllTimeTotals, setSvcAllTimeTotals] = useState<Record<string, { operations: number; cost_usd: number }>>({});
  const [resendEmailStats, setResendEmailStats] = useState<ResendEmailStats | null>(null);
  const [resendEmailLoading, setResendEmailLoading] = useState(false);
  const [notifChannelStats, setNotifChannelStats] = useState<NotificationChannelStats[]>([]);
  const { toast } = useToast();

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching analytics data...');

      // Check if user is authenticated
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error('❌ Authentication error:', sessionError);
        toast({
          title: 'Authentication Required',
          description: 'Your session has expired. Please log in again.',
          variant: 'destructive',
        });
        // Optionally redirect to login
        // navigate('/auth');
        return;
      }

      console.log('✅ User authenticated:', session.user.email);

      // Fetch Data Processing Stats (PDF, XML, Scraping)
      console.log('🔄 Fetching data processing stats...');
      // Only auth failures were handled explicitly below; every OTHER error fell through to
      // `pdfJobs.data || []`, so a broken query rendered as a pipeline that processed nothing.
      // Zero and "could not read" are the two answers an operations dashboard most needs to keep
      // apart. (#365 AD-7)
      // The web-scrape→product path was removed and `scraping_sessions` dropped.
      const [pdfJobs, xmlJobs] = await Promise.all([
        supabase.from('background_jobs').select('*').eq('job_type', 'pdf_processing'),
        supabase.from('data_import_jobs').select('*'),
      ]);

      // Check for auth errors in data processing queries
      if (pdfJobs.error && (pdfJobs.error.message?.includes('JWT') || pdfJobs.error.message?.includes('401'))) {
        console.error('❌ Auth error fetching PDF jobs:', pdfJobs.error);
        toast({
          title: 'Session Expired',
          description: 'Your session has expired. Please refresh the page and log in again.',
          variant: 'destructive',
        });
        return;
      }
      if (xmlJobs.error && (xmlJobs.error.message?.includes('JWT') || xmlJobs.error.message?.includes('401'))) {
        console.error('❌ Auth error fetching XML jobs:', xmlJobs.error);
        toast({
          title: 'Session Expired',
          description: 'Your session has expired. Please refresh the page and log in again.',
          variant: 'destructive',
        });
        return;
      }
      console.log('📊 PDF Jobs:', pdfJobs.data?.length || 0, pdfJobs.error);
      console.log('📊 XML Jobs:', xmlJobs.data?.length || 0, xmlJobs.error);
      setProcessingSourcesUnavailable([
        ...(pdfJobs.error ? ['PDF processing jobs'] : []),
        ...(xmlJobs.error ? ['XML import jobs'] : []),
      ]);

      // Calculate PDF stats
      const pdfData = pdfJobs.data || [];
      const pdfCompleted = pdfData.filter(j => j.status === 'completed');
      const pdfProcessingTimes = pdfCompleted
        .map(j => j.completed_at && j.started_at ?
          new Date(j.completed_at).getTime() - new Date(j.started_at).getTime() : 0)
        .filter(t => t > 0);
      const avgPdfTime = pdfProcessingTimes.length > 0
        ? pdfProcessingTimes.reduce((a, b) => a + b, 0) / pdfProcessingTimes.length / 1000
        : 0;

      // Calculate XML stats
      const xmlData = xmlJobs.data || [];
      const totalXmlProducts = xmlData.reduce((sum, j) => sum + (j.total_products || 0), 0);

      const processingStats = {
        pdf: {
          total: pdfData.length,
          completed: pdfData.filter(j => j.status === 'completed').length,
          failed: pdfData.filter(j => j.status === 'failed').length,
          processing: pdfData.filter(j => j.status === 'processing').length,
          avgProcessingTime: Math.round(avgPdfTime),
        },
        xml: {
          total: xmlData.length,
          completed: xmlData.filter(j => j.status === 'completed').length,
          failed: xmlData.filter(j => j.status === 'failed').length,
          processing: xmlData.filter(j => j.status === 'processing').length,
          totalProducts: totalXmlProducts,
        },
      };

      console.log('✅ Data Processing Stats:', processingStats);
      setDataProcessingStats(processingStats);

      // Fetch notification channel stats
      const [{ data: notifData }, { data: msgData }] = await Promise.all([
        supabase.from('notifications').select('channel_type, status'),
        supabase.from('messaging_logs').select('channel_type, status'),
      ]);

      const channelMap = new Map<string, { total: number; sent: number; failed: number; read: number }>();
      const addToChannel = (channel: string, status: string) => {
        if (!channelMap.has(channel)) channelMap.set(channel, { total: 0, sent: 0, failed: 0, read: 0 });
        const e = channelMap.get(channel)!;
        e.total++;
        if (['delivered', 'sent', 'opened'].includes(status)) e.sent++;
        else if (['failed', 'bounced'].includes(status)) e.failed++;
        if (status === 'read' || status === 'opened') e.read++;
      };
      (notifData || []).forEach((r: any) => addToChannel(r.channel_type || 'unknown', r.status || ''));
      (msgData || []).forEach((r: any) => addToChannel(r.channel_type || 'sms', r.status || ''));

      const CHANNEL_LABELS: Record<string, string> = {
        email: 'Email', sms: 'SMS', web: 'Web Push', whatsapp: 'WhatsApp', inapp: 'In-App', unknown: 'Unknown',
      };
      setNotifChannelStats(
        Array.from(channelMap.entries()).map(([channel, d]) => ({
          channel,
          label: CHANNEL_LABELS[channel] || channel,
          ...d,
        })).sort((a, b) => b.total - a.total),
      );

    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch analytics data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  const fetchExtServiceUsage = useCallback(async (period: string) => {
    try {
      setExtServiceLoading(true);
      const apiUrl = MIVAA_API_URL;
      const response = await fetch(
        `${apiUrl}/api/v1/ai-metrics/external-service-usage?time_period=${period}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: ExternalServiceUsageData = await response.json();
      setExtServiceData(data);
    } catch (err) {
      console.error('Failed to fetch external service usage:', err);
    } finally {
      setExtServiceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExtServiceUsage(extServicePeriod);
  }, [extServicePeriod, fetchExtServiceUsage]);

  // Fetch Resend email stats from email_logs
  const fetchResendEmailStats = useCallback(async (period: string) => {
    try {
      setResendEmailLoading(true);
      const now = new Date();
      const fromDate = new Date();
      if (period === '1h') fromDate.setHours(now.getHours() - 1);
      else if (period === '24h') fromDate.setDate(now.getDate() - 1);
      else if (period === '7d') fromDate.setDate(now.getDate() - 7);
      else fromDate.setDate(now.getDate() - 30);

      const { data } = await supabase
        .from('email_logs')
        .select('status')
        .gte('created_at', fromDate.toISOString());

      if (!data) return;

      const total = data.length;
      const delivered = data.filter((r: any) => r.status === 'delivered').length;
      const bounced = data.filter((r: any) => r.status === 'bounced').length;
      const complained = data.filter((r: any) => r.status === 'complained').length;
      const opened = data.filter((r: any) => r.status === 'opened').length;

      setResendEmailStats({
        total,
        delivered,
        bounced,
        complained,
        opened,
        deliveryRate: total > 0 ? (delivered / total) * 100 : 0,
        bounceRate: total > 0 ? (bounced / total) * 100 : 0,
        openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      });
    } catch (err) {
      console.error('Failed to fetch Resend email stats:', err);
    } finally {
      setResendEmailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResendEmailStats(extServicePeriod);
  }, [extServicePeriod, fetchResendEmailStats]);

  // Fetch all-time totals per external service from ai_usage_logs
  useEffect(() => {
    const SERVICE_KEYS = [
      'whatsapp-service', 'whatsapp-template',
      'apollo-enrich', 'apollo-people-match',
      'hunter-email-finder', 'hunter-domain-search',
      'zerobounce-validate', 'firecrawl-scrape',
      'zernio-publish', 'social-caption',
      'xai-aurora', 'flux-2-pro', 'flux-dev',
    ];
    supabase
      .from('ai_usage_logs')
      .select('model_name, billed_cost_usd')
      .in('model_name', SERVICE_KEYS)
      .then(({ data }) => {
        if (!data) return;
        const totals: Record<string, { operations: number; cost_usd: number }> = {};
        data.forEach((row: any) => {
          const key = row.model_name;
          if (!totals[key]) totals[key] = { operations: 0, cost_usd: 0 };
          totals[key].operations += 1;
          totals[key].cost_usd += Number(row.billed_cost_usd) || 0;
        });
        setSvcAllTimeTotals(totals);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Operations Management"
        description="Monitor and manage platform operations: data processing, AI performance, system health, and quality metrics"
        badge="Operations"
      />

      {/* Main Content */}
      <div className="p-3 sm:p-6 space-y-6">
        <Tabs value={opsActiveTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="system-health">
              <Activity className="h-4 w-4 mr-2" />
              System Health
            </TabsTrigger>
            <TabsTrigger value="data-processing">
              <Database className="h-4 w-4 mr-2" />
              Data Processing
            </TabsTrigger>
            <TabsTrigger value="performance">
              <Gauge className="h-4 w-4 mr-2" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="search-analytics">
              <Search className="h-4 w-4 mr-2" />
              Search Analytics
            </TabsTrigger>
            <TabsTrigger value="services-billing">
              <Globe className="h-4 w-4 mr-2" />
              Services & Billing
            </TabsTrigger>
            <TabsTrigger value="platform-overview">
              <BarChart3 className="h-4 w-4 mr-2" />
              Platform Overview
            </TabsTrigger>
            <TabsTrigger value="factory-onboarding">
              <Users className="h-4 w-4 mr-2" />
              Onboarding
            </TabsTrigger>
            <TabsTrigger value="catalogs">
              <BookOpen className="h-4 w-4 mr-2" />
              Catalogs
            </TabsTrigger>
            <TabsTrigger value="seo-toolkit">
              <Search className="h-4 w-4 mr-2" />
              SEO Toolkit
            </TabsTrigger>
            <TabsTrigger value="keys">
              <KeyRound className="h-4 w-4 mr-2" />
              Keys
            </TabsTrigger>
            <TabsTrigger value="modules">
              <CreditCard className="h-4 w-4 mr-2" />
              Modules
            </TabsTrigger>
            <TabsTrigger value="push">
              <Bell className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
          </TabsList>

          {/* System Health Tab */}
          <TabsContent value="system-health" className="space-y-4">
            <CapabilityLedgerPanel />
            <SystemHealthMonitor />
            {/* Generation providers — what each said when we last ASKED it. SystemHealthMonitor
                infers health from ai_usage_logs, where the row is written before the call and never
                corrected on failure, so Replicate's 402 on every model read as healthy for two
                months (issue #4). This panel reads the active probe instead. */}
            <GenerationProviderHealth />
            {/* Storage audit — orphan objects per bucket + run cleanup, across all buckets (PDFs, images, sheets, quotes, etc.) */}
            <StorageAuditPanel />
          </TabsContent>

          <TabsContent value="push" className="space-y-4">
            <PushBroadcastPanel />
          </TabsContent>

          {/* Module add-ons — per-workspace activation + add-on MRR (operator view). */}
          <TabsContent value="modules" className="space-y-4">
            <ModuleSubscribersPanel />
          </TabsContent>

          {/* Performance Tab — relocated from /admin/performance (job processing + per-document timelines). */}
          <TabsContent value="performance" className="space-y-4">
            <SystemPerformance embedded />
          </TabsContent>

          {/* Onboarding — brand/manufacturer registration approvals + access requests
              (salvaged from the retired /admin/training-models panel, 2026-06-09) merged with
              VAT + ΑΑΔΕ-verified self-serve reseller applications. */}
          <TabsContent value="factory-onboarding" className="space-y-4">
            <Tabs defaultValue={searchParams.get('section') === 'marketplace' ? 'marketplace' : 'registrations'} className="space-y-4">
              <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                <TabsTrigger value="registrations">Brand Registrations</TabsTrigger>
                <TabsTrigger value="access">Access Requests</TabsTrigger>
                <TabsTrigger value="resellers">Resellers</TabsTrigger>
                <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
              </TabsList>
              <TabsContent value="registrations"><FactoryRegistrationsTab /></TabsContent>
              <TabsContent value="access"><FactoryAccessRequestsTab /></TabsContent>
              <TabsContent value="resellers"><ResellerApplicationsTab /></TabsContent>
              <TabsContent value="marketplace"><MarketplaceApprovalsTab /></TabsContent>
            </Tabs>
          </TabsContent>

          {/* Search Analytics Tab — query performance, cache, and observability */}
          <TabsContent value="search-analytics" className="space-y-4">
            <SearchAnalyticsDashboard />
          </TabsContent>

          {/* Services & Billing Tab — 3rd Party API Services */}
          <TabsContent value="services-billing" className="space-y-4">
            {/* The per-workspace view first: the table below prices services, this says who is
                actually costing and earning what. */}
            <ChannelsCostPanel />

            {/* Then the ledgers behind that summary — what Meta charged, what we billed, and who
                is on hold. All three were written on a schedule and rendered nowhere. */}
            <ChannelsBillingDetail />

            {/* Directly under Channels, because it reads the conversations those channels bring
                in — the operator sees what the channels cost, then what reading them costs, in
                the order the money is actually spent. */}
            <InboxAIPanel />

            <SectionHeader
              title="3rd Party Services"
              subtitle="Live usage and cost tracking for all external APIs: Resend (email), Apollo, Hunter.io, ZeroBounce, Firecrawl, and Zernio (WhatsApp + social media). For AI model costs (Anthropic, Google) see AI Configurations → Performance."
            />

            {/* API Catalogue — static reference */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Configured API Services
                </CardTitle>
                <CardDescription>All 3rd party integrations active on this platform and their per-unit pricing</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Service</TableHead>
                      <TableHead className="font-semibold">Category</TableHead>
                      <TableHead className="font-semibold">Unit</TableHead>
                      <TableHead className="text-right font-semibold">Cost / Unit</TableHead>
                      <TableHead className="text-right font-semibold">Billed / Unit</TableHead>
                      <TableHead className="text-right font-semibold">Total Ops</TableHead>
                      <TableHead className="text-right font-semibold">Total Spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { key: 'resend-email',           label: 'Resend Email',         category: 'Email',        unit: 'email',      raw: 0.0004, billed: null },
                      // Split 2026-08-23. One flat rate averaged a FREE 24h-window reply and a
                      // Meta-billed marketing template together, understating the second ~10x.
                      { key: 'whatsapp-service',      label: 'WhatsApp Service Reply', category: 'Messaging',  unit: 'message',    raw: 0,      billed: 0.064 },
                      { key: 'whatsapp-template',     label: 'WhatsApp Template',      category: 'Messaging',  unit: 'message',    raw: 0.06,   billed: 0.09 },
                      { key: 'apollo-enrich',         label: 'Apollo Enrichment',    category: 'B2B Data',     unit: 'contact',    raw: 0.05,   billed: 0.075 },
                      { key: 'apollo-people-match',   label: 'Apollo People Match',  category: 'B2B Data',     unit: 'match',      raw: 0.02,   billed: 0.03 },
                      { key: 'hunter-email-finder',   label: 'Hunter Email Finder',  category: 'B2B Data',     unit: 'email',      raw: 0.01,   billed: 0.015 },
                      { key: 'hunter-domain-search',  label: 'Hunter Domain Search', category: 'B2B Data',     unit: 'search',     raw: 0.01,   billed: 0.015 },
                      { key: 'zerobounce-validate',   label: 'ZeroBounce Validate',  category: 'Email',        unit: 'email',      raw: 0.008,  billed: 0.012 },
                      { key: 'firecrawl-scrape',      label: 'Firecrawl Scrape',     category: 'Web Scraping', unit: 'page',       raw: 0.001,  billed: 0.0015 },
                      { key: 'zernio-publish',        label: 'Zernio Publish',       category: 'Social',       unit: 'post',       raw: 0.0,    billed: null },
                      { key: 'social-caption',        label: 'Social Caption Gen',   category: 'Social',       unit: 'generation', raw: 0.002,  billed: 0.003 },
                      { key: 'xai-aurora',            label: 'xAI Aurora Image',     category: 'Social',       unit: 'image',      raw: 0.07,   billed: 0.105 },
                      { key: 'flux-2-pro',            label: 'FLUX 2 Pro Image',     category: 'Social',       unit: 'image',      raw: 0.04,   billed: 0.06 },
                    ].map((svc) => {
                      const allTime = svcAllTimeTotals[svc.key];
                      return (
                        <TableRow key={svc.key}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Globe className="h-4 w-4 text-blue-600" />
                              {svc.label}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{svc.category}</span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">per {svc.unit}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {svc.raw > 0 ? `$${svc.raw.toFixed(4)}` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {svc.billed != null ? `$${svc.billed.toFixed(4)}` : <span className="text-xs text-muted-foreground">Plan-based</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {svc.key === 'resend-email'
                              ? (resendEmailStats ? formatNumber(resendEmailStats.total) : <span className="text-muted-foreground">—</span>)
                              : (allTime ? formatNumber(allTime.operations) : <span className="text-muted-foreground">—</span>)
                            }
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            {svc.key === 'resend-email' ? (
                              <span className="text-muted-foreground text-xs">See plan</span>
                            ) : allTime ? (
                              <span className={allTime.cost_usd > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                                ${allTime.cost_usd.toFixed(4)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Resend Email Delivery Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Delivery — Resend
                </CardTitle>
                <CardDescription>
                  Live delivery metrics from <code>email_logs</code> for the selected period. Pricing is plan-based ($0/month Free · $20/month Pro · $90/month Scale).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {resendEmailLoading ? (
                  <div className="flex items-center justify-center h-24 text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Loading email stats...
                  </div>
                ) : resendEmailStats && resendEmailStats.total > 0 ? (
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        <Send className="h-3 w-3" /> Total Sent
                      </p>
                      <p className="text-2xl font-bold">{formatNumber(resendEmailStats.total)}</p>
                      <p className="text-xs text-muted-foreground">emails in period</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Delivery Rate</p>
                      <p className="text-2xl font-bold text-green-600">{resendEmailStats.deliveryRate.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(resendEmailStats.delivered)} delivered</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Bounce Rate</p>
                      <p className={`text-2xl font-bold ${resendEmailStats.bounceRate > 5 ? 'text-red-600' : 'text-foreground'}`}>
                        {resendEmailStats.bounceRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">{formatNumber(resendEmailStats.bounced)} bounced</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Open Rate</p>
                      <p className="text-2xl font-bold">{resendEmailStats.openRate.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(resendEmailStats.opened)} opens</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
                    <Mail className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">No emails sent in this period</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notification Channels Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Notification Channels
                </CardTitle>
                <CardDescription>
                  All-time sends across Email (Resend), WhatsApp (Zernio), Web Push, and In-App notifications.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {notifChannelStats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
                    <Send className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm font-medium">No notifications sent yet</p>
                    <p className="text-xs mt-1">Email, SMS, Web Push, and In-App channels will appear here once active.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                    {notifChannelStats.map((ch) => (
                      <div key={ch.channel} className="space-y-1 rounded-lg border border-border/50 p-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{ch.label}</p>
                        <p className="text-2xl font-bold">{formatNumber(ch.total)}</p>
                        <div className="flex gap-3 text-xs">
                          <span className="text-green-600">{ch.sent} sent</span>
                          {ch.failed > 0 && <span className="text-red-500">{ch.failed} failed</span>}
                          {ch.read > 0 && <span className="text-blue-500">{ch.read} opened</span>}
                        </div>
                        {ch.total > 0 && (
                          <div className="mt-1">
                            <div className="bg-gray-100 rounded-full h-1.5">
                              <div
                                className="bg-green-500 h-1.5 rounded-full"
                                style={{ width: `${Math.round((ch.sent / ch.total) * 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{Math.round((ch.sent / ch.total) * 100)}% delivery rate</p>
                          </div>
                        )}
                      </div>
                    ))}
                    {/* Always show Email row from email_logs */}
                    {resendEmailStats && !notifChannelStats.find(c => c.channel === 'email') && (
                      <div className="space-y-1 rounded-lg border border-border/50 p-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email (Resend)</p>
                        <p className="text-2xl font-bold">{formatNumber(resendEmailStats.total)}</p>
                        <div className="flex gap-3 text-xs">
                          <span className="text-green-600">{resendEmailStats.delivered} delivered</span>
                          {resendEmailStats.bounced > 0 && <span className="text-red-500">{resendEmailStats.bounced} bounced</span>}
                          {resendEmailStats.opened > 0 && <span className="text-blue-500">{resendEmailStats.opened} opened</span>}
                        </div>
                        {resendEmailStats.total > 0 && (
                          <div className="mt-1">
                            <div className="bg-gray-100 rounded-full h-1.5">
                              <div
                                className="bg-green-500 h-1.5 rounded-full"
                                style={{ width: `${resendEmailStats.deliveryRate.toFixed(0)}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{resendEmailStats.deliveryRate.toFixed(1)}% delivery rate</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Live Usage Section */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Live Usage</h3>
              <div className="flex items-center gap-2">
                {(['1h', '24h', '7d', '30d'] as const).map((period) => (
                  <Button
                    key={period}
                    variant={extServicePeriod === period ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setExtServicePeriod(period)}
                  >
                    {period}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchExtServiceUsage(extServicePeriod)}
                  disabled={extServiceLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${extServiceLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {extServiceLoading && !extServiceData ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Loading usage data...
              </div>
            ) : !extServiceData?.summary || extServiceData.summary.total_operations === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Activity className="h-10 w-10 mb-3 opacity-30" />
                  <p className="font-medium">No usage in this period</p>
                  <p className="text-sm mt-1">Activity will appear once B2B, messaging, or scraping tools are invoked.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="dashboard-card">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                        <DollarSign className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground font-medium">Total Cost</div>
                        <div className="text-2xl font-bold text-foreground">
                          ${extServiceData.summary.total_cost_usd.toFixed(4)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Billed to platform</div>
                      </div>
                    </div>
                  </div>

                  <div className="dashboard-card">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                        <Activity className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground font-medium">Total Operations</div>
                        <div className="text-2xl font-bold text-foreground">
                          {formatNumber(extServiceData.summary.total_operations)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Across {extServiceData.by_service.length} services
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="dashboard-card">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                        <TrendingUp className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground font-medium">Most Used</div>
                        <div className="text-2xl font-bold text-foreground">
                          {extServiceData.by_service[0]
                            ? (EXT_SERVICE_LABELS[extServiceData.by_service[0].service] || extServiceData.by_service[0].service)
                            : 'N/A'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {extServiceData.by_service[0]?.operations || 0} ops
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="dashboard-card">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                        <CreditCard className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground font-medium">Avg Cost / Op</div>
                        <div className="text-2xl font-bold text-foreground">
                          ${extServiceData.summary.total_operations > 0
                            ? (extServiceData.summary.total_cost_usd / extServiceData.summary.total_operations).toFixed(5)
                            : '0.00000'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Across all services</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts Row */}
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Cost Breakdown by Service
                      </CardTitle>
                      <CardDescription>Distribution of spend per service in this period</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={extServiceData.by_service.map((s) => ({
                              ...s,
                              label: EXT_SERVICE_LABELS[s.service] || s.service,
                            }))}
                            dataKey="cost_usd"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          >
                            {extServiceData.by_service.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={EXT_SERVICE_COLORS[index % EXT_SERVICE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => [`$${value.toFixed(5)}`, 'Cost (USD)']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Daily Usage Timeline
                      </CardTitle>
                      <CardDescription>Operations and cost per day</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={extServiceData.timeline}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
                          <YAxis yAxisId="left" fontSize={12} />
                          <YAxis yAxisId="right" orientation="right" fontSize={12} />
                          <Tooltip
                            formatter={(value: number, name: string) => [
                              name === 'credits' ? `${value.toFixed(2)} cr` : value,
                              name === 'credits' ? 'Credits' : 'Operations',
                            ]}
                            labelFormatter={(label: string) => `Date: ${label}`}
                          />
                          <Bar yAxisId="left" dataKey="credits" fill="#0088FE" name="credits" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="right" dataKey="operations" fill="#00C49F" name="operations" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Per-Service Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Per-Service Breakdown
                    </CardTitle>
                    <CardDescription>Detailed usage and cost per external service in the selected period</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-semibold">Service</TableHead>
                          <TableHead className="text-right font-semibold">Operations</TableHead>
                          <TableHead className="text-right font-semibold">Cost (USD)</TableHead>
                          <TableHead className="text-right font-semibold">Avg Cost / Op</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {extServiceData.by_service.map((svc) => (
                          <TableRow key={svc.service}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4 text-blue-600" />
                                <span>{EXT_SERVICE_LABELS[svc.service] || svc.service}</span>
                                <Badge variant="outline" className="text-xs">{svc.service}</Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatNumber(svc.operations)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">
                              ${svc.cost_usd.toFixed(5)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              ${svc.operations > 0 ? (svc.cost_usd / svc.operations).toFixed(5) : '0.00000'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>



          {/* Data Processing Tab - PDF, XML, Scraping */}
          <TabsContent value="data-processing" className="space-y-4">
            {/* Page Header */}
            <SectionHeader
              title="Data Processing Pipeline"
              subtitle="Real-time monitoring of PDF processing and XML imports. Track job status, success rates, processing times, and data volumes across all import sources."
            />

            {/* A source that failed to load leaves its tiles at zero, which reads as an idle
                pipeline rather than a broken query. Say which one. (#365 AD-7) */}
            {processingSourcesUnavailable.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-xs text-destructive">
                <span className="font-semibold">Could not read {processingSourcesUnavailable.join(' and ')}.</span>{' '}
                The figures below are not measurements — treat them as unknown, not as zero.
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <FileText className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">PDF Processing</div>
                    <div className="text-2xl font-bold text-foreground">{dataProcessingStats.pdf.total}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {dataProcessingStats.pdf.completed} completed • {dataProcessingStats.pdf.processing} processing
                    </div>
                  </div>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <Database className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">XML Imports</div>
                    <div className="text-2xl font-bold text-foreground">{dataProcessingStats.xml.total}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {dataProcessingStats.xml.totalProducts} products imported
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Detailed Processing Tables */}
            <div className="grid grid-cols-1 gap-6">
              {/* Unified Processing Monitor Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Processing Jobs Monitor
                  </CardTitle>
                  <CardDescription>Real-time monitoring of all processing pipelines (PDF, XML)</CardDescription>
                </CardHeader>
                <CardContent>
                  <UnifiedProcessingMonitor />
                </CardContent>
              </Card>

              {/* Pipeline Strategy Metrics — chunking strategy distribution +
                  Stage 1.5 failure rate. Surfaces silent regressions where the
                  chunker falls back to text-only because layout precompute
                  silently failed. See pipeline_strategy_metrics table. */}
              <PipelineStrategyMetricsPanel />
            </div>

            {/* Old XML Stats - Keep for reference */}
            <Card className="hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  XML Import Jobs (Old Stats)
                </CardTitle>
                <CardDescription>Legacy XML import statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-5 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Total Jobs</div>
                      <div className="text-2xl font-bold">{dataProcessingStats.xml.total}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Completed</div>
                      <div className="text-2xl font-bold text-green-600">{dataProcessingStats.xml.completed}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Failed</div>
                      <div className="text-2xl font-bold text-red-600">{dataProcessingStats.xml.failed}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Processing</div>
                      <div className="text-2xl font-bold text-blue-600">{dataProcessingStats.xml.processing}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Products Imported</div>
                      <div className="text-2xl font-bold text-green-600">{dataProcessingStats.xml.totalProducts}</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-sm font-medium text-muted-foreground mb-2">Recent Jobs</div>
                    {dataProcessingStats.xml.total === 0 ? (
                      <div className="bg-gray-50 rounded-lg p-6 text-center">
                        <Database className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm text-gray-600">No XML import jobs yet</p>
                        <p className="text-xs text-gray-400 mt-1">Jobs will appear here once XML imports are initiated</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">
                          {dataProcessingStats.xml.completed} completed • {dataProcessingStats.xml.failed} failed • {dataProcessingStats.xml.processing} in progress
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Processing Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-medium">Success Rates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>PDF Processing</span>
                      <span className="font-semibold">
                        {dataProcessingStats.pdf.total > 0
                          ? Math.round((dataProcessingStats.pdf.completed / dataProcessingStats.pdf.total) * 100)
                          : 0}%
                      </span>
                    </div>
                    <Progress
                      value={dataProcessingStats.pdf.total > 0
                        ? (dataProcessingStats.pdf.completed / dataProcessingStats.pdf.total) * 100
                        : 0}
                      className="h-2"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>XML Imports</span>
                      <span className="font-semibold">
                        {dataProcessingStats.xml.total > 0
                          ? Math.round((dataProcessingStats.xml.completed / dataProcessingStats.xml.total) * 100)
                          : 0}%
                      </span>
                    </div>
                    <Progress
                      value={dataProcessingStats.xml.total > 0
                        ? (dataProcessingStats.xml.completed / dataProcessingStats.xml.total) * 100
                        : 0}
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-medium">Processing Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Avg PDF Time</span>
                    <span className="font-semibold">{dataProcessingStats.pdf.avgProcessingTime}s</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Products (XML)</span>
                    <span className="font-semibold">{formatNumber(dataProcessingStats.xml.totalProducts)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Platform Overview Tab */}
          <TabsContent value="platform-overview" className="space-y-4">
            <PlatformOverviewTab />
          </TabsContent>

          {/* Catalog Operations Tab — email-gated catalog access events,
              page views, and PDF downloads. Pulled out of /catalogs/operations
              and integrated into the central operations dashboard. */}
          <TabsContent value="catalogs" className="space-y-4">
            <CatalogOperationsTab />
          </TabsContent>

          {/* SEO Toolkit Tab — DataForSEO research, audits, backlinks, competitive intel.
              Pulled out of /admin/seo into the operations dashboard. */}
          <TabsContent value="seo-toolkit" className="space-y-4">
            <SEODashboardPanel />
          </TabsContent>

          {/* Keys Tab — platform-wide secrets (AI keys, Stripe, VAPID, cron secret, …).
              Module-specific keys live in each module's own Settings tab. Env vars always win;
              this table is the fallback admins can edit when env is unset. */}
          <TabsContent value="keys" className="space-y-4">
            <SectionHeader
              title="Platform Keys"
              subtitle="Centrally manage secrets that aren't tied to a single module — AI providers, payments, push notifications, and cron secrets. Environment variables take priority; the values stored here are only used when the corresponding env var is unset. Module-specific keys live in each module's own Settings tab."
            />
            <SecretsManagerCard
              scope={{ mode: 'platform' }}
              title="Platform secret keys"
              description="Shared across all edge functions and modules. A single value here can satisfy multiple consumers."
            />
          </TabsContent>

        </Tabs>
      </div>

    </div>
  );
};
const OperationsDashboardRoute: React.FC = () => {
  const [searchParams] = useSearchParams();
  if (searchParams.get('tab') === 'agent-chat') return <Navigate to="/admin" replace />;
  return <OperationsDashboardInner />;
};
export const OperationsDashboard = React.memo(OperationsDashboardRoute);
