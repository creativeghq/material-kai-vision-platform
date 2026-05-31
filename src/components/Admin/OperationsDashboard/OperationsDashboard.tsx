import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Users,
  TrendingUp,
  Activity,
  Clock,
  FileText,
  MessageSquare,
  RefreshCw,
  CheckCircle,
  Database,
  Bot,
  ThumbsUp,
  ThumbsDown,
  Zap,
  Eye,
  Settings,
  Gauge,
  Search,
  CreditCard,
  DollarSign,
  Crown,
  Image,
  Globe,
  Mail,
  Send,
  BookOpen,
  KeyRound,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { ChunkQualityDashboard } from '../ChunkQualityDashboard';
import { UnifiedProcessingMonitor } from '../UnifiedProcessingMonitor';
import { PriceLookupsCard } from './PriceLookupsCard';
import { PipelineStrategyMetricsPanel } from './PipelineStrategyMetricsPanel';
import { CatalogOperationsTab } from './CatalogOperationsTab';
import { SystemHealthMonitor } from '../SystemHealthMonitor';
import { StorageAuditPanel } from '../StorageAuditPanel';
import { PlatformOverviewTab } from '../PlatformOverviewTab';
import { SearchAnalyticsDashboard } from '../SearchAnalyticsDashboard';
import { SEODashboardPanel } from '@/components/business/seo-toolkit/SEODashboard';
import { SeoInterlinkingPanel } from '@/modules/seo-interlinking/pages/SeoInterlinkingModulePage';
import { SecretsManagerCard } from '@/components/Admin/Secrets/SecretsManagerCard';

import type {
  UsageAnalytics,
  AgentChatMessage,
  SearchAnalytic,
  ApiUsageLog,
  SubscriptionStats,
  UserProfile,
  DataProcessingStats,
  AIUsageLog,
  InteriorDesignStats,
  ModelUsage,
  ExternalServiceUsageData,
  ResendEmailStats,
  NotificationChannelStats,
} from './types';
import { EXT_SERVICE_COLORS, EXT_SERVICE_LABELS } from './constants';
import { estimateTokens, calculateCost } from './utils';
import { StatCard } from './components/StatCard';

const VALID_OPERATIONS_TABS = new Set([
  'system-health', 'data-processing', 'ai-performance', 'agent-chat',
  'search-analytics', 'services-billing', 'platform-overview', 'catalogs',
  'seo-toolkit', 'seo-interlinking', 'keys',
]);

const OperationsDashboardInner: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initial tab from ?tab= query param so other admin pages can deep-link
  // (e.g. /admin/operations?tab=catalogs from the Catalogs list page).
  const requestedTab = searchParams.get('tab') || '';
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

  const [activeTab, setActiveTab] = useState('overview');
  const [analytics, setAnalytics] = useState<UsageAnalytics>({
    total_searches: 0,
    total_api_calls: 0,
    active_users: 0,
    avg_response_time: 0,
  });
  const [searchAnalytics, setSearchAnalytics] = useState<SearchAnalytic[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsageLog[]>([]);
  const [agentChats, setAgentChats] = useState<AgentChatMessage[]>([]);
  const [subscriptionStats, setSubscriptionStats] = useState<SubscriptionStats>({
    totalUsers: 0,
    freeUsers: 0,
    proUsers: 0,
    totalRevenue: 0,
    totalCreditsUsed: 0,
  });
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [aiUsageLogs, setAIUsageLogs] = useState<AIUsageLog[]>([]);
  const [interiorDesignStats, setInteriorDesignStats] = useState<InteriorDesignStats>({
    total_generations: 0,
    total_cost: 0,
    total_images: 0,
    unique_users: 0,
  });
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]); // AI models (Claude, GPT, SigLIP)
  const [interiorDesignModels, setInteriorDesignModels] = useState<ModelUsage[]>([]); // Interior Design specific models
  const [dataProcessingStats, setDataProcessingStats] = useState<DataProcessingStats>({
    pdf: { total: 0, completed: 0, failed: 0, processing: 0, avgProcessingTime: 0 },
    xml: { total: 0, completed: 0, failed: 0, processing: 0, totalProducts: 0 },
    scraping: { total: 0, completed: 0, failed: 0, processing: 0, totalPages: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [extServiceData, setExtServiceData] = useState<ExternalServiceUsageData | null>(null);
  const [extServicePeriod, setExtServicePeriod] = useState('7d');
  const [extServiceLoading, setExtServiceLoading] = useState(false);
  const [svcAllTimeTotals, setSvcAllTimeTotals] = useState<Record<string, { operations: number; cost_usd: number }>>({});
  const [resendEmailStats, setResendEmailStats] = useState<ResendEmailStats | null>(null);
  const [resendEmailLoading, setResendEmailLoading] = useState(false);
  const [notifChannelStats, setNotifChannelStats] = useState<NotificationChannelStats[]>([]);
  const [toolCallStats, setToolCallStats] = useState<Array<{
    tool_name: string;
    total_calls: number;
    successful_calls: number;
    failed_calls: number;
    zero_result_calls: number;
    success_rate: number;
    zero_result_rate: number;
    avg_duration_ms: number;
    p95_duration_ms: number;
  }>>([]);
  const { toast } = useToast();

  // Detect feature type from agent chat metadata
  const getFeatureType = (metadata: AgentChatMessage['metadata']): string => {
    if (!metadata) return 'Text Chat';
    if (metadata.worldData) return 'VR World';
    if (metadata.videoData) return 'Video Walkthrough';
    if (metadata.materialsBoardData) return 'Materials Board';
    if (metadata.geminiImageData) return 'AI Image';
    if (metadata.generation_job) return 'Interior Design';
    return 'Text Chat';
  };

  const FEATURE_COLORS: Record<string, string> = {
    'VR World':       'bg-purple-100 text-purple-700 border-purple-200',
    'Video Walkthrough': 'bg-blue-100 text-blue-700 border-blue-200',
    'Interior Design': 'bg-amber-100 text-amber-700 border-amber-200',
    'Materials Board': 'bg-green-100 text-green-700 border-green-200',
    'AI Image':       'bg-pink-100 text-pink-700 border-pink-200',
    'Text Chat':      'bg-gray-100 text-gray-600 border-gray-200',
  };


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

      // Fetch search analytics
      const { data: searchData, error: searchError } = await supabase
        .from('analytics_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (searchError) {
        console.error('❌ Error fetching analytics_events:', searchError);
        // Check if it's an auth error
        if (searchError.message?.includes('JWT') || searchError.message?.includes('401')) {
          toast({
            title: 'Session Expired',
            description: 'Your session has expired. Please refresh the page and log in again.',
            variant: 'destructive',
          });
          return;
        }
        throw searchError;
      }
      console.log('✅ Analytics events:', searchData?.length || 0);

      // Fetch API usage logs
      const { data: apiData, error: apiError } = await supabase
        .from('api_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (apiError) {
        console.error('❌ Error fetching api_usage_logs:', apiError);
        if (apiError.message?.includes('JWT') || apiError.message?.includes('401')) {
          toast({
            title: 'Session Expired',
            description: 'Your session has expired. Please refresh the page and log in again.',
            variant: 'destructive',
          });
          return;
        }
        throw apiError;
      }

      // Fetch agent chat messages (assistant responses with metadata)
      const { data: agentChatData, error: agentChatError } = await supabase
        .from('agent_chat_messages')
        .select(`
          id,
          conversation_id,
          role,
          content,
          metadata,
          created_at,
          agent_chat_conversations!inner (
            user_id
          )
        `)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(100);

      if (agentChatError) {
        console.error('❌ Error fetching agent chats:', agentChatError);
        if (agentChatError.message?.includes('JWT') || agentChatError.message?.includes('401')) {
          toast({
            title: 'Session Expired',
            description: 'Your session has expired. Please refresh the page and log in again.',
            variant: 'destructive',
          });
          return;
        }
      }

      // Map agent chat data with user info
      const agentChatMessages: AgentChatMessage[] = (agentChatData || []).map((msg: any) => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata,
        created_at: msg.created_at,
        user_id: msg.agent_chat_conversations?.user_id,
      }));

      setAgentChats(agentChatMessages);

      // Filter and cast data to match expected types
      const filteredSearchData = (searchData || [])
        .filter(
          (item: unknown) =>
            (item as any).created_at &&
            (item as any).event_type &&
            (item as any).id,
        )
        .map((item: unknown) => ({
          id: (item as any).id,
          query_text:
            (((item as any).event_data as Record<string, unknown>)
              ?.query as string) || 'Unknown query',
          results_shown:
            (((item as any).event_data as Record<string, unknown>)
              ?.results_count as number) || 0,
          clicks_count:
            (((item as any).event_data as Record<string, unknown>)
              ?.clicks as number) || 0,
          satisfaction_rating:
            (((item as any).event_data as Record<string, unknown>)
              ?.rating as number) ?? 0,
          response_time_ms:
            (((item as any).event_data as Record<string, unknown>)
              ?.response_time as number) || 0,
          created_at: (item as any).created_at || new Date().toISOString(),
          user_id: (item as any).user_id,
          session_id: (item as any).session_id,
        }));

      const filteredApiData = (apiData || [])
        .filter(
          (item: unknown) =>
            (item as any).created_at &&
            (item as any).id &&
            (item as any).response_status !== null,
        ) as ApiUsageLog[];

      setSearchAnalytics(filteredSearchData);
      setApiUsage(filteredApiData);

      // Calculate aggregate statistics (include agent chats in search count)
      const totalSearches = (searchData?.length || 0) + agentChatMessages.length;
      const totalApiCalls = apiData?.length || 0;
      const uniqueUsers = new Set([
        ...(searchData
          ?.map((s: unknown) => (s as any).user_id)
          .filter(Boolean) || []),
        ...(apiData
          ?.map((a: unknown) => (a as any).user_id)
          .filter(Boolean) || []),
        ...agentChatMessages.map((m) => m.user_id).filter(Boolean),
      ]).size;

      // Calculate avg response time from agent chats (more accurate)
      const agentResponseTimes = agentChatMessages
        .map((m) => m.metadata?.responseTimeMs)
        .filter((t): t is number => typeof t === 'number' && t > 0);
      const avgAgentResponseTime = agentResponseTimes.length > 0
        ? agentResponseTimes.reduce((a, b) => a + b, 0) / agentResponseTimes.length
        : 0;

      setAnalytics({
        total_searches: totalSearches,
        total_api_calls: totalApiCalls,
        active_users: uniqueUsers,
        avg_response_time: Math.round(avgAgentResponseTime),
      });

      // Fetch subscription and credits data
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, email, subscription_tier, subscription_status, credits_balance, created_at')
        .order('created_at', { ascending: false });

      if (profilesError) {
        console.error('❌ Error fetching user profiles:', profilesError);
        if (profilesError.message?.includes('JWT') || profilesError.message?.includes('401')) {
          toast({
            title: 'Session Expired',
            description: 'Your session has expired. Please refresh the page and log in again.',
            variant: 'destructive',
          });
          return;
        }
      } else if (profiles) {
        setUserProfiles(profiles);

        // Calculate subscription stats
        const totalUsers = profiles.length;
        const freeUsers = profiles.filter((p: UserProfile) => p.subscription_tier === 'free').length;
        const proUsers = profiles.filter((p: UserProfile) => p.subscription_tier === 'pro').length;
        const totalRevenue = proUsers * 29; // Monthly revenue (Pro only)

        setSubscriptionStats({
          totalUsers,
          freeUsers,
          proUsers,
          totalRevenue,
          totalCreditsUsed: 0, // Will be calculated from AI usage logs
        });
      }

      // Fetch AI usage logs
      const { data: aiLogs, error: aiLogsError } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (aiLogsError) {
        console.error('❌ Error fetching AI usage logs:', aiLogsError);
        if (aiLogsError.message?.includes('JWT') || aiLogsError.message?.includes('401')) {
          toast({
            title: 'Session Expired',
            description: 'Your session has expired. Please refresh the page and log in again.',
            variant: 'destructive',
          });
          return;
        }
      } else if (aiLogs) {
        // Also fetch agent_usage_logs (agent chat usage — stored separately by log_agent_usage RPC)
        const { data: agentLogs } = await supabase
          .from('agent_usage_logs')
          .select('id, user_id, agent_type, model_name, input_tokens, output_tokens, billed_cost_usd, raw_cost_usd, credits_debited, created_at')
          .order('created_at', { ascending: false })
          .limit(500);

        // Normalize agent_usage_logs rows to AIUsageLog shape and merge
        const normalizedAgentLogs: AIUsageLog[] = (agentLogs || []).map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          operation_type: `agent_chat:${row.agent_type || 'kai'}`,
          model_name: row.model_name,
          input_tokens: row.input_tokens || 0,
          output_tokens: row.output_tokens || 0,
          billed_cost_usd: row.billed_cost_usd || 0,
          credits_debited: row.credits_debited || 0,
          created_at: row.created_at,
        }));

        const combinedLogs: AIUsageLog[] = [...aiLogs, ...normalizedAgentLogs];
        console.log(`✅ AI Usage Logs: ${aiLogs.length} from ai_usage_logs + ${normalizedAgentLogs.length} from agent_usage_logs`);
        setAIUsageLogs(combinedLogs);

        // Calculate total credits used
        const totalCreditsUsed = combinedLogs.reduce((sum: number, log: AIUsageLog) => sum + (log.credits_debited || 0), 0);

        setSubscriptionStats(prev => ({
          ...prev,
          totalCreditsUsed,
        }));

        // Calculate AI Model Usage Stats (Claude, GPT, SigLIP, etc.)
        const modelStats: Record<string, {
          call_count: number;
          total_cost: number;
          total_tokens: number;
          total_input_tokens: number;
          total_output_tokens: number;
          avg_latency: number;
          success_count: number;
        }> = {};

        combinedLogs.forEach((log: AIUsageLog) => {
          const model = log.model_name || 'unknown';
          if (!modelStats[model]) {
            modelStats[model] = {
              call_count: 0,
              total_cost: 0,
              total_tokens: 0,
              total_input_tokens: 0,
              total_output_tokens: 0,
              avg_latency: 0,
              success_count: 0,
            };
          }

          modelStats[model].call_count++;
          modelStats[model].total_cost += Number(log.billed_cost_usd || 0);
          modelStats[model].total_input_tokens += Number(log.input_tokens || 0);
          modelStats[model].total_output_tokens += Number(log.output_tokens || 0);
          modelStats[model].total_tokens += Number(log.input_tokens || 0) + Number(log.output_tokens || 0);
          // Assuming success - track all calls as successful for now
          modelStats[model].success_count++;
        });

        // Convert to array and calculate averages
        const aiModelUsageArray = Object.entries(modelStats).map(([model, stats]) => ({
          model_name: model,
          call_count: stats.call_count,
          total_cost: stats.total_cost,
          total_tokens: stats.total_tokens,
          input_tokens: stats.total_input_tokens,
          output_tokens: stats.total_output_tokens,
          success_rate: stats.call_count > 0 ? (stats.success_count / stats.call_count) * 100 : 0,
          avg_cost: stats.call_count > 0 ? stats.total_cost / stats.call_count : 0,
        }));

        // Sort by total cost descending
        aiModelUsageArray.sort((a, b) => b.total_cost - a.total_cost);

        console.log('📊 AI Model Usage Stats:', aiModelUsageArray);
        setModelUsage(aiModelUsageArray as any);
      }

      // Fetch Interior Design Analytics
      console.log('🔄 Fetching interior design analytics...');
      const { data: generations, error: genError } = await supabase
        .from('generation_3d')
        .select('id, user_id, total_cost, models_results')
        .eq('generation_status', 'completed')
        .not('total_cost', 'is', null);

      if (genError) {
        console.error('❌ Error fetching interior design analytics:', genError);
      } else if (generations) {
        console.log('✅ Interior Design Generations:', generations.length);
        const totalCost = generations.reduce((sum, g) => sum + (Number(g.total_cost) || 0), 0);
        const uniqueUsers = new Set(generations.map(g => g.user_id)).size;

        let totalImages = 0;
        generations.forEach(g => {
          if (g.models_results) {
            Object.values(g.models_results as Record<string, any>).forEach((model: any) => {
              if (model.status === 'completed' && model.image_urls) {
                totalImages += model.image_urls.length;
              }
            });
          }
        });

        setInteriorDesignStats({
          total_generations: generations.length,
          total_cost: totalCost,
          total_images: totalImages,
          unique_users: uniqueUsers,
        });

        // Calculate model usage
        const modelStats: Record<string, { count: number; cost: number; successes: number; total: number }> = {};

        generations.forEach(g => {
          if (g.models_results) {
            Object.entries(g.models_results as Record<string, any>).forEach(([modelId, modelData]: [string, any]) => {
              if (!modelStats[modelId]) {
                modelStats[modelId] = { count: 0, cost: 0, successes: 0, total: 0 };
              }
              modelStats[modelId].total++;
              if (modelData.status === 'completed') {
                modelStats[modelId].count++;
                modelStats[modelId].cost += Number(modelData.cost) || 0;
                modelStats[modelId].successes++;
              }
            });
          }
        });

        const interiorDesignModelsArray: ModelUsage[] = Object.entries(modelStats).map(([modelId, data]) => ({
          model_id: modelId,
          model_name: modelId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          usage_count: data.count,
          total_cost: data.cost,
          success_rate: data.total > 0 ? (data.successes / data.total) * 100 : 0,
        }));

        interiorDesignModelsArray.sort((a, b) => b.total_cost - a.total_cost);
        console.log('🎨 Interior Design Models:', interiorDesignModelsArray);
        setInteriorDesignModels(interiorDesignModelsArray);
      }

      // Fetch Data Processing Stats (PDF, XML, Scraping)
      console.log('🔄 Fetching data processing stats...');
      const [pdfJobs, xmlJobs, scrapingSessions] = await Promise.all([
        supabase.from('background_jobs').select('*').eq('job_type', 'pdf_processing'),
        supabase.from('data_import_jobs').select('*'),
        supabase.from('scraping_sessions').select('*'),
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
      if (scrapingSessions.error && (scrapingSessions.error.message?.includes('JWT') || scrapingSessions.error.message?.includes('401'))) {
        console.error('❌ Auth error fetching scraping sessions:', scrapingSessions.error);
        toast({
          title: 'Session Expired',
          description: 'Your session has expired. Please refresh the page and log in again.',
          variant: 'destructive',
        });
        return;
      }

      console.log('📊 PDF Jobs:', pdfJobs.data?.length || 0, pdfJobs.error);
      console.log('📊 XML Jobs:', xmlJobs.data?.length || 0, xmlJobs.error);
      console.log('📊 Scraping Sessions:', scrapingSessions.data?.length || 0, scrapingSessions.error);

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

      // Calculate Scraping stats
      const scrapingData = scrapingSessions.data || [];
      const totalScrapingPages = scrapingData.reduce((sum, s) => sum + (s.total_pages || 0), 0);

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
        scraping: {
          total: scrapingData.length,
          completed: scrapingData.filter(s => s.status === 'completed').length,
          failed: scrapingData.filter(s => s.status === 'failed').length,
          processing: scrapingData.filter(s => s.status === 'processing' || s.status === 'scraping').length,
          totalPages: totalScrapingPages,
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
        })).sort((a, b) => b.total - a.total)
      );

      // ── Tool call analytics (per-tool success/zero-result/latency) ──
      try {
        const { data: toolData } = await supabase.rpc('get_tool_call_stats', {
          time_interval: '7 days',
        });
        if (toolData && Array.isArray(toolData)) {
          setToolCallStats(toolData);
        }
      } catch (toolErr) {
        console.warn('Failed to load tool call stats:', toolErr);
      }
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
      'twilio-sms', 'twilio-whatsapp',
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

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 400 && status < 500) return 'text-yellow-600';
    if (status >= 500) return 'text-red-600';
    return 'text-gray-600';
  };

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
            <TabsTrigger value="system-health" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="h-4 w-4 mr-2" />
              System Health
            </TabsTrigger>
            <TabsTrigger value="data-processing" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Database className="h-4 w-4 mr-2" />
              Data Processing
            </TabsTrigger>
            <TabsTrigger value="ai-performance" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Bot className="h-4 w-4 mr-2" />
              AI Performance
            </TabsTrigger>
            <TabsTrigger value="agent-chat" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MessageSquare className="h-4 w-4 mr-2" />
              Agent Chat
            </TabsTrigger>
            <TabsTrigger value="search-analytics" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Search className="h-4 w-4 mr-2" />
              Search Analytics
            </TabsTrigger>
            <TabsTrigger value="services-billing" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="h-4 w-4 mr-2" />
              Services & Billing
            </TabsTrigger>
            <TabsTrigger value="platform-overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="h-4 w-4 mr-2" />
              Platform Overview
            </TabsTrigger>
            <TabsTrigger value="catalogs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BookOpen className="h-4 w-4 mr-2" />
              Catalogs
            </TabsTrigger>
            <TabsTrigger value="seo-toolkit" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Search className="h-4 w-4 mr-2" />
              SEO Toolkit
            </TabsTrigger>
            <TabsTrigger value="seo-interlinking" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="h-4 w-4 mr-2" />
              SEO Inter-linking
            </TabsTrigger>
            <TabsTrigger value="keys" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <KeyRound className="h-4 w-4 mr-2" />
              Keys
            </TabsTrigger>
          </TabsList>

          {/* System Health Tab */}
          <TabsContent value="system-health" className="space-y-4">
            <SystemHealthMonitor />
            {/* Storage audit — orphan objects per bucket + run cleanup, across all buckets (PDFs, images, sheets, quotes, etc.) */}
            <StorageAuditPanel />
          </TabsContent>

          {/* Agent Chat Analytics Tab */}
          <TabsContent value="agent-chat" className="space-y-4">
            {/* Platform Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard
                title="Total Searches"
                value={analytics.total_searches}
                icon={Search}
                description="Search queries processed"
                trend={12}
              />
              <StatCard
                title="API Calls"
                value={analytics.total_api_calls}
                icon={BarChart3}
                description="Total API requests"
                trend={8}
              />
              <StatCard
                title="Active Users"
                value={analytics.active_users}
                icon={Users}
                description="Unique users today"
                trend={15}
              />
              <StatCard
                title="Avg Response Time"
                value={`${analytics.avg_response_time}ms`}
                icon={Clock}
                description="Average API response time"
                trend={-5}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Agent Chat Analytics
                </CardTitle>
                <CardDescription>
                  Track agent responses, response times, quality ratings, and costs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Summary Stats */}
                {(() => {
                  const ratedChats = agentChats.filter((c) => c.metadata?.rating);
                  const upCount = agentChats.filter((c) => c.metadata?.rating === 'up').length;
                  const downCount = agentChats.filter((c) => c.metadata?.rating === 'down').length;
                  const approvalPct = ratedChats.length > 0 ? Math.round((upCount / ratedChats.length) * 100) : null;
                  const avgResponseMs = agentChats.length > 0
                    ? Math.round(
                        agentChats.filter((c) => c.metadata?.responseTimeMs && c.metadata.responseTimeMs > 0)
                          .reduce((sum, c) => sum + (c.metadata?.responseTimeMs || 0), 0) /
                        Math.max(agentChats.filter((c) => c.metadata?.responseTimeMs && c.metadata.responseTimeMs > 0).length, 1),
                      )
                    : 0;
                  const featureCounts: Record<string, number> = {};
                  const featureResponseTimes: Record<string, number[]> = {};
                  agentChats.forEach((c) => {
                    const ft = getFeatureType(c.metadata);
                    featureCounts[ft] = (featureCounts[ft] || 0) + 1;
                    if (c.metadata?.responseTimeMs && c.metadata.responseTimeMs > 0) {
                      if (!featureResponseTimes[ft]) featureResponseTimes[ft] = [];
                      featureResponseTimes[ft].push(c.metadata.responseTimeMs);
                    }
                  });
                  return (
                    <>
                      {/* Row 1: core metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-slate-200 shadow-sm">
                          <div className="text-sm text-slate-600">Total Chats</div>
                          <div className="text-2xl font-bold text-slate-900">{agentChats.length}</div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-slate-200 shadow-sm">
                          <div className="text-sm text-slate-600">Avg Response Time</div>
                          <div className="text-2xl font-bold text-slate-900">{avgResponseMs > 0 ? `${(avgResponseMs / 1000).toFixed(1)}s` : '—'}</div>
                          <div className="text-xs text-muted-foreground mt-1">across all feature types</div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-green-200 shadow-sm">
                          <div className="text-sm text-green-700 flex items-center gap-1">
                            <ThumbsUp className="h-3.5 w-3.5" /> Positive Ratings
                          </div>
                          <div className="text-2xl font-bold text-green-600">{upCount}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {approvalPct !== null ? `${approvalPct}% approval rate` : 'No ratings yet'}
                          </div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-red-200 shadow-sm">
                          <div className="text-sm text-red-700 flex items-center gap-1">
                            <ThumbsDown className="h-3.5 w-3.5" /> Negative Ratings
                          </div>
                          <div className="text-2xl font-bold text-red-600">{downCount}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {ratedChats.length > 0 ? `${ratedChats.length} total rated` : 'No ratings yet'}
                          </div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-blue-200 shadow-sm">
                          <div className="text-sm text-blue-700">Est. Total Cost</div>
                          <div className="text-2xl font-bold text-blue-600">
                            ${agentChats.reduce((sum, chat) => {
                              const model = chat.metadata?.model || 'claude-opus-4-7';
                              const inputTokens = estimateTokens(chat.content);
                              const outputTokens = estimateTokens(chat.content);
                              return sum + calculateCost(model, inputTokens, outputTokens).total;
                            }, 0).toFixed(4)}
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Ratings approval bar */}
                      {ratedChats.length > 0 && (
                        <div className="mb-4 bg-white/80 rounded-lg border border-slate-200 p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700">Rating Breakdown</span>
                            <span className="text-xs text-muted-foreground">{ratedChats.length} / {agentChats.length} responses rated</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <ThumbsUp className="h-4 w-4 text-green-600 shrink-0" />
                            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${approvalPct ?? 0}%` }}
                              />
                            </div>
                            <ThumbsDown className="h-4 w-4 text-red-500 shrink-0" />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span className="text-green-600 font-medium">{upCount} positive</span>
                            <span className="font-semibold">{approvalPct}% approval</span>
                            <span className="text-red-500 font-medium">{downCount} negative</span>
                          </div>
                        </div>
                      )}

                      {/* Row 3: Feature type breakdown */}
                      {Object.keys(featureCounts).length > 0 && (
                        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                          {Object.entries(featureCounts).sort((a, b) => b[1] - a[1]).map(([ft, count]) => {
                            const times = featureResponseTimes[ft] || [];
                            const avgMs = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
                            return (
                              <div key={ft} className={`rounded-lg border px-3 py-2.5 text-center ${FEATURE_COLORS[ft] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                <div className="text-xs font-medium truncate">{ft}</div>
                                <div className="text-xl font-bold mt-0.5">{count}</div>
                                {avgMs !== null && (
                                  <div className="text-xs opacity-70 mt-0.5">{(avgMs / 1000).toFixed(1)}s avg</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Agent Chat Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[240px]">Response Preview</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Response Time</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Cost (Est.)</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentChats.slice(0, 20).map((chat) => {
                      const model = chat.metadata?.model || 'claude-opus-4-7';
                      const inputTokens = estimateTokens(chat.content);
                      const outputTokens = estimateTokens(chat.content);
                      const cost = calculateCost(model, inputTokens, outputTokens);
                      const featureType = getFeatureType(chat.metadata);
                      const featureColorClass = FEATURE_COLORS[featureType] || 'bg-gray-100 text-gray-600 border-gray-200';
                      // Extra detail for specific features
                      const genStatus = chat.metadata?.worldData?.status || chat.metadata?.videoData?.status;
                      const boardMode = chat.metadata?.materialsBoardData?.board_mode;

                      return (
                        <TableRow key={chat.id}>
                          <TableCell className="font-medium max-w-[240px]">
                            <div className="truncate text-sm" title={chat.content}>
                              {chat.content.slice(0, 70)}…
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${featureColorClass}`}>
                                {featureType}
                              </span>
                              {(genStatus || boardMode) && (
                                <span className="text-xs text-muted-foreground">
                                  {boardMode ? boardMode.replace(/-/g, ' ') : genStatus}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {chat.metadata?.agentId || 'kai'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted text-foreground px-1.5 py-0.5 rounded border border-border">
                              {model.includes('haiku') ? 'Haiku' : model.includes('opus') ? 'Opus' : model.slice(0, 12)}
                            </code>
                          </TableCell>
                          <TableCell>
                            {chat.metadata?.responseTimeMs && chat.metadata.responseTimeMs > 0 ? (
                              <span className={chat.metadata.responseTimeMs > 30000 ? 'text-red-600 font-medium' : chat.metadata.responseTimeMs > 10000 ? 'text-amber-600' : ''}>
                                {(chat.metadata.responseTimeMs / 1000).toFixed(1)}s
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {chat.metadata?.rating === 'up' ? (
                              <div className="flex items-center gap-1">
                                <ThumbsUp className="h-4 w-4 text-green-600" />
                                <span className="text-xs text-green-600">Good</span>
                              </div>
                            ) : chat.metadata?.rating === 'down' ? (
                              <div className="flex items-center gap-1">
                                <ThumbsDown className="h-4 w-4 text-red-600" />
                                <span className="text-xs text-red-600">Poor</span>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {chat.metadata?.productsCount || 0}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              <div className="text-green-600">In: ${cost.input.toFixed(5)}</div>
                              <div className="text-blue-600">Out: ${cost.output.toFixed(5)}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {new Date(chat.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {agentChats.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No agent chat data available yet. Start chatting with the agent to see analytics.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tool Call Analytics — per-tool success/zero-result/latency rates */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Tool Call Analytics
                </CardTitle>
                <CardDescription>
                  How often each agent tool is called, succeeds, returns zero results, and how fast it is. Last 7 days.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {toolCallStats.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tool</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        <TableHead className="text-right">Success Rate</TableHead>
                        <TableHead className="text-right">Zero-Result Rate</TableHead>
                        <TableHead className="text-right">Avg ms</TableHead>
                        <TableHead className="text-right">p95 ms</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {toolCallStats.map((tool) => (
                        <TableRow key={tool.tool_name}>
                          <TableCell className="font-mono text-sm">{tool.tool_name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {Number(tool.total_calls).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              className={
                                tool.success_rate >= 95
                                  ? 'bg-green-100 text-green-700 border-green-200'
                                  : tool.success_rate >= 80
                                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                                  : 'bg-red-100 text-red-700 border-red-200'
                              }
                            >
                              {Number(tool.success_rate || 0).toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              className={
                                tool.zero_result_rate >= 30
                                  ? 'bg-red-100 text-red-700 border-red-200'
                                  : tool.zero_result_rate >= 10
                                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                                  : 'bg-gray-100 text-gray-700 border-gray-200'
                              }
                            >
                              {Number(tool.zero_result_rate || 0).toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {Number(tool.avg_duration_ms || 0).toFixed(0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {Number(tool.p95_duration_ms || 0).toFixed(0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No tool call data yet. Trigger some agent chats to populate.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* API Request Logs (merged from API Usage tab) */}
            {apiUsage.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    API Request Logs
                  </CardTitle>
                  <CardDescription>Recent raw API endpoint requests and response codes</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Path</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Response Time</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiUsage.slice(0, 15).map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm max-w-xs truncate">
                            {log.request_path}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {log.request_method}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={getStatusColor(log.response_status ?? 0)}>
                              {log.response_status ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell>{log.response_time_ms || 0}ms</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted text-foreground px-1.5 py-0.5 rounded border border-border">
                              {log.is_internal_request ? 'Internal' : 'External'}
                            </code>
                          </TableCell>
                          <TableCell>
                            {log.created_at
                              ? new Date(log.created_at).toLocaleString()
                              : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Price Lookups — admin-triggered KB pricing tool usage */}
            <PriceLookupsCard />
          </TabsContent>

          {/* Search Analytics Tab — query performance, cache, and observability */}
          <TabsContent value="search-analytics" className="space-y-4">
            <SearchAnalyticsDashboard />
          </TabsContent>

          {/* Services & Billing Tab — 3rd Party API Services */}
          <TabsContent value="services-billing" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">3rd Party Services</h2>
              <p className="text-muted-foreground text-sm">
                Live usage and cost tracking for all external APIs: Resend (email), Twilio, Apollo, Hunter.io, ZeroBounce, Firecrawl, and Zernio (social media). For AI model costs (Anthropic, Google, OpenAI) see the AI Performance tab.
              </p>
            </div>

            {/* API Catalogue — static reference */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
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
                      { key: 'twilio-sms',            label: 'Twilio SMS',           category: 'Messaging',    unit: 'message',    raw: 0.0079, billed: 0.01185 },
                      { key: 'twilio-whatsapp',       label: 'Twilio WhatsApp',      category: 'Messaging',    unit: 'message',    raw: 0.005,  billed: 0.0075 },
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
                            <Badge variant="outline" className="text-xs">{svc.category}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">per {svc.unit}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {svc.raw > 0 ? `$${svc.raw.toFixed(4)}` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {svc.billed != null ? `$${svc.billed.toFixed(4)}` : <Badge variant="secondary" className="text-xs">Plan-based</Badge>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {svc.key === 'resend-email'
                              ? (resendEmailStats ? resendEmailStats.total.toLocaleString() : <span className="text-muted-foreground">—</span>)
                              : (allTime ? allTime.operations.toLocaleString() : <span className="text-muted-foreground">—</span>)
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
                <CardTitle className="flex items-center gap-2 text-base">
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
                      <p className="text-2xl font-bold">{resendEmailStats.total.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">emails in period</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Delivery Rate</p>
                      <p className="text-2xl font-bold text-green-600">{resendEmailStats.deliveryRate.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">{resendEmailStats.delivered.toLocaleString()} delivered</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Bounce Rate</p>
                      <p className={`text-2xl font-bold ${resendEmailStats.bounceRate > 5 ? 'text-red-600' : 'text-foreground'}`}>
                        {resendEmailStats.bounceRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">{resendEmailStats.bounced.toLocaleString()} bounced</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Open Rate</p>
                      <p className="text-2xl font-bold">{resendEmailStats.openRate.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">{resendEmailStats.opened.toLocaleString()} opens</p>
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
                <CardTitle className="flex items-center gap-2 text-base">
                  <Send className="h-4 w-4" />
                  Notification Channels
                </CardTitle>
                <CardDescription>
                  All-time sends across Email (Resend), SMS/WhatsApp (Twilio), Web Push, and In-App notifications.
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
                        <p className="text-2xl font-bold">{ch.total.toLocaleString()}</p>
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
                        <p className="text-2xl font-bold">{resendEmailStats.total.toLocaleString()}</p>
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
                          {extServiceData.summary.total_operations.toLocaleString()}
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
                      <CardTitle className="flex items-center gap-2 text-base">
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
                            label={({ label, percent }) => `${label} (${(percent * 100).toFixed(0)}%)`}
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
                      <CardTitle className="flex items-center gap-2 text-base">
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
                    <CardTitle className="flex items-center gap-2 text-base">
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
                              {svc.operations.toLocaleString()}
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


          {/* AI Performance Tab - Consolidated AI Models, Interior Design, Quality Metrics */}
          <TabsContent value="ai-performance" className="space-y-4">
            {/* Page Header */}
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">AI Performance</h2>
              <p className="text-muted-foreground text-sm">
                Monitoring all AI models — Claude Opus 4.7 (vision + classification), Claude Sonnet 4.6 (chunking), Claude Haiku 4.5, and embedding models (SigLIP, Voyage AI). Track costs, tokens, success rates, and performance metrics across your entire AI infrastructure.
              </p>
            </div>

            {/* AI Models Summary Cards - GPT, Claude, Interior Design, etc. */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <DollarSign className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">Total AI Cost</div>
                    <div className="text-2xl font-bold text-foreground">
                      ${(
                        aiUsageLogs.reduce((sum, log) => sum + (Number(log.billed_cost_usd) || 0), 0) +
                        interiorDesignStats.total_cost
                      ).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {aiUsageLogs.length + interiorDesignStats.total_generations} total operations
                    </div>
                  </div>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <Zap className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">Total Tokens</div>
                    <div className="text-2xl font-bold text-foreground">
                      {aiUsageLogs.reduce((sum, log) => sum + (Number(log.input_tokens) || 0) + (Number(log.output_tokens) || 0), 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Input + Output tokens
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
                    <div className="text-sm text-muted-foreground font-medium">Credits Used</div>
                    <div className="text-2xl font-bold text-foreground">
                      {aiUsageLogs.reduce((sum, log) => sum + (Number(log.credits_debited) || 0), 0).toFixed(0)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Platform credits</div>
                  </div>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <Bot className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">Active Models</div>
                    <div className="text-2xl font-bold text-foreground">
                      {new Set(aiUsageLogs.map(log => log.model_name)).size}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Unique AI models</div>
                  </div>
                </div>
              </div>

              {/* Interior Design Stats - Merged into main cards */}
              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <Image className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">Images Generated</div>
                    <div className="text-2xl font-bold text-foreground">{interiorDesignStats.total_images}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Avg {(interiorDesignStats.total_images / Math.max(interiorDesignStats.total_generations, 1)).toFixed(1)} per job
                    </div>
                  </div>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <DollarSign className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">Avg Cost/Generation</div>
                    <div className="text-2xl font-bold text-foreground">
                      ${(interiorDesignStats.total_cost / Math.max(interiorDesignStats.total_generations, 1)).toFixed(3)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Per generation</div>
                  </div>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <Users className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">Unique Users</div>
                    <div className="text-2xl font-bold text-foreground">{interiorDesignStats.unique_users}</div>
                    <div className="text-xs text-muted-foreground mt-1">Active users</div>
                  </div>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <Image className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">Total Generations</div>
                    <div className="text-2xl font-bold text-foreground">{interiorDesignStats.total_generations}</div>
                    <div className="text-xs text-muted-foreground mt-1">3D designs created</div>
                  </div>
                </div>
              </div>
            </div>



            {/* AI Models Usage Table - GPT, Claude, etc. */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  AI Model Usage & Costs
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  All AI models (GPT, Claude, etc.) - Performance and cost breakdown
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-semibold">Model</TableHead>
                        <TableHead className="text-right font-semibold">API Calls</TableHead>
                        <TableHead className="text-right font-semibold">Input Tokens</TableHead>
                        <TableHead className="text-right font-semibold">Output Tokens</TableHead>
                        <TableHead className="text-right font-semibold">Total Cost</TableHead>
                        <TableHead className="text-right font-semibold">Avg Cost/Call</TableHead>
                        <TableHead className="text-right font-semibold">Success Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modelUsage.map((model: any) => (
                        <TableRow key={model.model_name}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4 text-blue-600" />
                              <span className="text-gray-900">{model.model_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {(model.call_count || model.usage_count).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-blue-600">
                            {model.input_tokens ? model.input_tokens.toLocaleString() : '0'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-green-600">
                            {model.output_tokens ? model.output_tokens.toLocaleString() : '0'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            ${model.total_cost.toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-gray-600">
                            ${model.avg_cost ? model.avg_cost.toFixed(4) : (model.total_cost / Math.max(model.call_count || model.usage_count, 1)).toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={model.success_rate >= 90 ? 'default' : model.success_rate >= 70 ? 'secondary' : 'destructive'}
                              className="font-semibold"
                            >
                              {model.success_rate.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {modelUsage.length === 0 && (
                        <>
                          {/* Placeholder rows — canonical Claude models + vision/embedding */}
                          {[
                            { name: 'Claude Opus 4.7' },
                            { name: 'Claude Sonnet 4.6' },
                            { name: 'Claude Haiku 4.5' },
                            { name: 'voyage-4' },
                            { name: 'SLIG 768D' },
                          ].map((m) => (
                            <TableRow key={m.name}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <Bot className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-muted-foreground">{m.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-muted-foreground">0</TableCell>
                              <TableCell className="text-right font-mono text-sm text-muted-foreground">0</TableCell>
                              <TableCell className="text-right font-mono text-sm text-muted-foreground">0</TableCell>
                              <TableCell className="text-right font-mono text-sm text-muted-foreground">$0.0000</TableCell>
                              <TableCell className="text-right font-mono text-sm text-muted-foreground">$0.0000</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">0.0%</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-4 text-sm text-muted-foreground">
                              No AI usage data yet. Models will show actual data once API calls are made.
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Chunk Quality Dashboard - Consolidated from /admin/chunk-quality */}
            <ChunkQualityDashboard />
          </TabsContent>

          {/* Data Processing Tab - PDF, XML, Scraping */}
          <TabsContent value="data-processing" className="space-y-4">
            {/* Page Header */}
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Data Processing Pipeline</h2>
              <p className="text-muted-foreground text-sm">
                Real-time monitoring of PDF processing, XML imports, and web scraping operations. Track job status, success rates, processing times, and data volumes across all import sources.
              </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
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

              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <Activity className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">Web Scraping</div>
                    <div className="text-2xl font-bold text-foreground">{dataProcessingStats.scraping.total}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {dataProcessingStats.scraping.totalPages} pages scraped
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
                    <Activity className="h-5 w-5" />
                    Processing Jobs Monitor
                  </CardTitle>
                  <CardDescription>Real-time monitoring of all processing pipelines (PDF, XML, Web Scraping)</CardDescription>
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
                  <Database className="h-5 w-5" />
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

            {/* Old Web Scraping Stats - Keep for reference */}
            <Card className="hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Web Scraping Sessions (Old Stats)
                </CardTitle>
                <CardDescription>Legacy web scraping statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-5 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Total Sessions</div>
                      <div className="text-2xl font-bold">{dataProcessingStats.scraping.total}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Completed</div>
                      <div className="text-2xl font-bold text-green-600">{dataProcessingStats.scraping.completed}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Failed</div>
                      <div className="text-2xl font-bold text-red-600">{dataProcessingStats.scraping.failed}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Active</div>
                      <div className="text-2xl font-bold text-blue-600">{dataProcessingStats.scraping.processing}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Pages Scraped</div>
                      <div className="text-2xl font-bold text-green-600">{dataProcessingStats.scraping.totalPages}</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-sm font-medium text-muted-foreground mb-2">Recent Sessions</div>
                    {dataProcessingStats.scraping.total === 0 ? (
                      <div className="bg-gray-50 rounded-lg p-6 text-center">
                        <Activity className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm text-gray-600">No scraping sessions yet</p>
                        <p className="text-xs text-gray-400 mt-1">Sessions will appear here once web scraping is initiated</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">
                          {dataProcessingStats.scraping.completed} completed • {dataProcessingStats.scraping.failed} failed • {dataProcessingStats.scraping.processing} active
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
                  <CardTitle className="text-sm font-medium">Success Rates</CardTitle>
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
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Web Scraping</span>
                      <span className="font-semibold">
                        {dataProcessingStats.scraping.total > 0
                          ? Math.round((dataProcessingStats.scraping.completed / dataProcessingStats.scraping.total) * 100)
                          : 0}%
                      </span>
                    </div>
                    <Progress
                      value={dataProcessingStats.scraping.total > 0
                        ? (dataProcessingStats.scraping.completed / dataProcessingStats.scraping.total) * 100
                        : 0}
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Processing Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Avg PDF Time</span>
                    <span className="font-semibold">{dataProcessingStats.pdf.avgProcessingTime}s</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Products (XML)</span>
                    <span className="font-semibold">{dataProcessingStats.xml.totalProducts.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Pages (Scraping)</span>
                    <span className="font-semibold">{dataProcessingStats.scraping.totalPages.toLocaleString()}</span>
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
              page views, and PDF downloads. Pulled out of /admin/catalogs/operations
              and integrated into the central operations dashboard. */}
          <TabsContent value="catalogs" className="space-y-4">
            <CatalogOperationsTab />
          </TabsContent>

          {/* SEO Toolkit Tab — DataForSEO research, audits, backlinks, competitive intel.
              Pulled out of /admin/seo into the operations dashboard. */}
          <TabsContent value="seo-toolkit" className="space-y-4">
            <SEODashboardPanel />
          </TabsContent>

          {/* SEO Inter-linking Tab — connected user websites + sitemap status.
              Pulled out of /admin/modules/seo-interlinking into the operations dashboard. */}
          <TabsContent value="seo-interlinking" className="space-y-4">
            <SeoInterlinkingPanel />
          </TabsContent>

          {/* Keys Tab — platform-wide secrets (AI keys, Stripe, VAPID, cron secret, …).
              Module-specific keys live in each module's own Settings tab. Env vars always win;
              this table is the fallback admins can edit when env is unset. */}
          <TabsContent value="keys" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Platform Keys</h2>
              <p className="text-muted-foreground text-sm">
                Centrally manage secrets that aren't tied to a single module — AI providers, payments, push notifications, and cron secrets. Environment variables take priority; the values stored here are only used when the corresponding env var is unset. Module-specific keys (Oxygen, etc.) live in each module's own Settings tab.
              </p>
            </div>
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
export const OperationsDashboard = React.memo(OperationsDashboardInner);
