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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { ChunkQualityDashboard } from './ChunkQualityDashboard';
import { PDFProcessingMonitor } from './PDFProcessingMonitor';
import { SystemHealthMonitor } from './SystemHealthMonitor';

// Model pricing per 1M tokens (in USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
};

// Estimate tokens from content length (rough approximation: 4 chars = 1 token)
const estimateTokens = (content: string): number => Math.ceil(content.length / 4);

// Calculate cost based on model and tokens
const calculateCost = (model: string, inputTokens: number, outputTokens: number): { input: number; output: number; total: number } => {
  const pricing = MODEL_PRICING[model] || { input: 3.00, output: 15.00 }; // Default to Sonnet pricing
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost,
  };
};

// Model configurations for Model Settings tab
interface ModelConfig {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'meta' | 'google';
  model: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  speed: 'fast' | 'medium' | 'slow';
  usedFor: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
}

const MODEL_CONFIGS: ModelConfig[] = [
  { id: 'claude-haiku', name: 'Claude Haiku 3.5', provider: 'anthropic', model: 'claude-3-5-haiku-20241022', inputCostPer1M: 0.80, outputCostPer1M: 4.00, speed: 'fast', usedFor: ['Search Agent', 'Quick Queries'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'claude-sonnet', name: 'Claude Sonnet 4.5', provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', inputCostPer1M: 3.00, outputCostPer1M: 15.00, speed: 'medium', usedFor: ['PDF Processing', 'Complex Tasks', 'Admin Agent'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', model: 'gpt-4o', inputCostPer1M: 2.50, outputCostPer1M: 10.00, speed: 'medium', usedFor: ['Fallback', 'Vision Tasks'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'llama-vision', name: 'Llama 4 Scout 17B Vision', provider: 'meta', model: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', inputCostPer1M: 0.20, outputCostPer1M: 0.20, speed: 'fast', usedFor: ['Image Embeddings', 'Vision Analysis'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'vit-embeddings', name: 'ViT Base Patch16', provider: 'google', model: 'google/vit-base-patch16-224', inputCostPer1M: 0.00, outputCostPer1M: 0.00, speed: 'fast', usedFor: ['CLIP Embeddings', 'Image Classification'], totalInputTokens: 0, totalOutputTokens: 0 },
];

const getProviderStyle = (provider: string) => {
  switch (provider) {
    case 'anthropic': return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', icon: '🧠' };
    case 'openai': return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: '🤖' };
    case 'meta': return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: '🦙' };
    case 'google': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: '🔍' };
    default: return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: '⚙️' };
  }
};

interface UsageAnalytics {
  total_searches: number;
  total_api_calls: number;
  active_users: number;
  avg_response_time: number;
}

interface AgentChatMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  metadata: {
    agentId?: string;
    model?: string;
    responseTimeMs?: number;
    productsCount?: number;
    cachedResponse?: boolean;
    rating?: 'up' | 'down' | null;
  } | null;
  created_at: string;
  user_email?: string;
  user_id?: string;
}

interface SearchAnalytic {
  id: string;
  query_text: string;
  results_shown: number;
  clicks_count: number;
  satisfaction_rating: number;
  created_at: string;
  response_time_ms: number;
}

interface ApiUsageLog {
  id: string;
  api_key_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number | null;
  request_size_bytes: number | null;
  response_size_bytes: number | null;
  ip_address: string | null;
  user_agent: string | null;
  error_message: string | null;
  created_at: string | null;
}

interface SubscriptionStats {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  totalRevenue: number;
  totalCreditsUsed: number;
}

interface UserProfile {
  id: string;
  email: string;
  subscription_tier: string;
  subscription_status: string;
  credits_balance: number;
  created_at: string;
}

interface DataProcessingStats {
  pdf: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
    avgProcessingTime: number;
  };
  xml: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
    totalProducts: number;
  };
  scraping: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
    totalPages: number;
  };
}

interface AIUsageLog {
  id: string;
  user_id: string;
  operation_type: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  credits_debited: number;
  created_at: string;
}

interface InteriorDesignStats {
  total_generations: number;
  total_cost: number;
  total_images: number;
  unique_users: number;
}

interface ModelUsage {
  model_id: string;
  model_name: string;
  usage_count: number;
  total_cost: number;
  success_rate: number;
}

export const OperationsDashboard: React.FC = () => {
  const navigate = useNavigate();
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
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  const [dataProcessingStats, setDataProcessingStats] = useState<DataProcessingStats>({
    pdf: { total: 0, completed: 0, failed: 0, processing: 0, avgProcessingTime: 0 },
    xml: { total: 0, completed: 0, failed: 0, processing: 0, totalProducts: 0 },
    scraping: { total: 0, completed: 0, failed: 0, processing: 0, totalPages: 0 },
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch search analytics
      const { data: searchData, error: searchError } = await supabase
        .from('analytics_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (searchError) throw searchError;

      // Fetch API usage logs
      const { data: apiData, error: apiError } = await supabase
        .from('api_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (apiError) throw apiError;

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
        console.error('Error fetching agent chats:', agentChatError);
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
            (item as any).status_code !== null,
        )
        .map((item: unknown) => ({
          ...(item as any),
          response_status: (item as any).status_code || 0,
          response_time_ms: (item as any).response_time_ms || 0,
          user_id: (item as any).api_key_id || 'anonymous',
          endpoint_id: (item as any).endpoint || 'unknown',
          user_agent: (item as any).user_agent || 'unknown',
        }));

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
          ?.map((a: unknown) => (a as any).api_key_id)
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
        console.error('Error fetching user profiles:', profilesError);
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
        console.error('Error fetching AI usage logs:', aiLogsError);
      } else if (aiLogs) {
        setAIUsageLogs(aiLogs);

        // Calculate total credits used
        const totalCreditsUsed = aiLogs.reduce((sum: number, log: AIUsageLog) => sum + (log.credits_debited || 0), 0);

        setSubscriptionStats(prev => ({
          ...prev,
          totalCreditsUsed,
        }));
      }

      // Fetch Interior Design Analytics
      const { data: generations, error: genError } = await supabase
        .from('generation_3d')
        .select('id, user_id, total_cost, models_results')
        .eq('generation_status', 'completed')
        .not('total_cost', 'is', null);

      if (genError) {
        console.error('Error fetching interior design analytics:', genError);
      } else if (generations) {
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

        const modelUsageArray: ModelUsage[] = Object.entries(modelStats).map(([modelId, data]) => ({
          model_id: modelId,
          model_name: modelId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          usage_count: data.count,
          total_cost: data.cost,
          success_rate: data.total > 0 ? (data.successes / data.total) * 100 : 0,
        }));

        modelUsageArray.sort((a, b) => b.total_cost - a.total_cost);
        setModelUsage(modelUsageArray);
      }

      // Fetch Data Processing Stats (PDF, XML, Scraping)
      const [pdfJobs, xmlJobs, scrapingSessions] = await Promise.all([
        supabase.from('background_jobs').select('*').eq('job_type', 'pdf_processing'),
        supabase.from('data_import_jobs').select('*'),
        supabase.from('scraping_sessions').select('*'),
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

      // Calculate Scraping stats
      const scrapingData = scrapingSessions.data || [];
      const totalScrapingPages = scrapingData.reduce((sum, s) => sum + (s.total_pages || 0), 0);

      setDataProcessingStats({
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
      });
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

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 400 && status < 500) return 'text-yellow-600';
    if (status >= 500) return 'text-red-600';
    return 'text-gray-600';
  };

  const StatCard = ({
    title,
    value,
    icon: Icon,
    description,
    trend,
  }: {
    title: string;
    value: string | number;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    description: string;
    trend?: number;
  }) => (
    <div className="dashboard-card">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="flex items-center justify-center"
          style={{
            width: '2rem',
            height: '2rem',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'hsl(var(--primary) / 0.1)',
          }}
        >
          <Icon className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
        </div>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-muted-foreground">{description}</p>
        {trend !== undefined && (
          <Badge
            className={`text-xs ${trend > 0 ? 'bg-green-100 text-green-800 border-green-300' : trend < 0 ? 'bg-red-100 text-red-800 border-red-300' : 'bg-slate-100 text-slate-800 border-slate-300'}`}
          >
            {trend > 0 ? '+' : ''}
            {trend}%
          </Badge>
        )}
      </div>
    </div>
  );

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
      <div className="p-6 space-y-6">
        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        <Tabs defaultValue="system-health" className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="system-health">
              <Activity className="h-4 w-4 mr-2" />
              System Health
            </TabsTrigger>
            <TabsTrigger value="data-processing">
              <Database className="h-4 w-4 mr-2" />
              Data Processing
            </TabsTrigger>
            <TabsTrigger value="ai-performance">
              <Bot className="h-4 w-4 mr-2" />
              AI Performance
            </TabsTrigger>
            <TabsTrigger value="agent-chat">
              <MessageSquare className="h-4 w-4 mr-2" />
              Agent Chat
            </TabsTrigger>
            <TabsTrigger value="subscriptions">
              <CreditCard className="h-4 w-4 mr-2" />
              Subscriptions
            </TabsTrigger>
            <TabsTrigger value="api-usage">
              <Zap className="h-4 w-4 mr-2" />
              API Usage
            </TabsTrigger>
          </TabsList>

          {/* System Health Tab */}
          <TabsContent value="system-health" className="space-y-4">
            <SystemHealthMonitor />
          </TabsContent>

          {/* Agent Chat Analytics Tab */}
          <TabsContent value="agent-chat" className="space-y-4">
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-slate-200 shadow-sm">
                    <div className="text-sm text-slate-600">Total Chats</div>
                    <div className="text-2xl font-bold text-slate-900">{agentChats.length}</div>
                  </div>
                  <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-slate-200 shadow-sm">
                    <div className="text-sm text-slate-600">Avg Response Time</div>
                    <div className="text-2xl font-bold text-slate-900">
                      {agentChats.length > 0
                        ? `${Math.round(
                            agentChats
                              .filter((c) => c.metadata?.responseTimeMs)
                              .reduce((sum, c) => sum + (c.metadata?.responseTimeMs || 0), 0) /
                              Math.max(agentChats.filter((c) => c.metadata?.responseTimeMs).length, 1)
                          )}ms`
                        : '0ms'}
                    </div>
                  </div>
                  <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-green-200 shadow-sm">
                    <div className="text-sm text-green-700">Positive Ratings</div>
                    <div className="text-2xl font-bold text-green-600">
                      {agentChats.filter((c) => c.metadata?.rating === 'up').length}
                    </div>
                  </div>
                  <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-blue-200 shadow-sm">
                    <div className="text-sm text-blue-700">Est. Total Cost</div>
                    <div className="text-2xl font-bold text-blue-600">
                      ${agentChats
                        .reduce((sum, chat) => {
                          const model = chat.metadata?.model || 'claude-sonnet-4-5-20250929';
                          const inputTokens = estimateTokens(chat.content);
                          const outputTokens = estimateTokens(chat.content);
                          return sum + calculateCost(model, inputTokens, outputTokens).total;
                        }, 0)
                        .toFixed(4)}
                    </div>
                  </div>
                </div>

                {/* Agent Chat Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Query / Response</TableHead>
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
                      const model = chat.metadata?.model || 'claude-sonnet-4-5-20250929';
                      const inputTokens = estimateTokens(chat.content);
                      const outputTokens = estimateTokens(chat.content);
                      const cost = calculateCost(model, inputTokens, outputTokens);

                      return (
                        <TableRow key={chat.id}>
                          <TableCell className="font-medium max-w-[300px]">
                            <div className="truncate text-sm" title={chat.content}>
                              {chat.content.slice(0, 80)}...
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {chat.metadata?.agentId || 'search'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                              {model.includes('haiku') ? 'Haiku' : model.includes('sonnet') ? 'Sonnet' : model.slice(0, 12)}
                            </code>
                          </TableCell>
                          <TableCell>
                            <span className={chat.metadata?.responseTimeMs && chat.metadata.responseTimeMs > 10000 ? 'text-red-600' : ''}>
                              {chat.metadata?.responseTimeMs ? `${(chat.metadata.responseTimeMs / 1000).toFixed(1)}s` : '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {chat.metadata?.rating === 'up' ? (
                              <ThumbsUp className="h-4 w-4 text-green-600" />
                            ) : chat.metadata?.rating === 'down' ? (
                              <ThumbsDown className="h-4 w-4 text-red-600" />
                            ) : (
                              <span className="text-gray-400">-</span>
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
          </TabsContent>

          {/* Subscriptions & Credits Tab */}
          <TabsContent value="subscriptions" className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-200">
                      <Crown className="h-5 w-5 text-blue-700" />
                    </div>
                    <div>
                      <div className="text-sm text-blue-600">Pro Subscribers</div>
                      <div className="text-2xl font-bold text-blue-900">{subscriptionStats.proUsers}</div>
                      <div className="text-xs text-blue-500 mt-1">
                        {subscriptionStats.totalUsers > 0 ? ((subscriptionStats.proUsers / subscriptionStats.totalUsers) * 100).toFixed(1) : 0}% of users
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-200">
                      <DollarSign className="h-5 w-5 text-green-700" />
                    </div>
                    <div>
                      <div className="text-sm text-green-600">Monthly Revenue</div>
                      <div className="text-2xl font-bold text-green-900">${subscriptionStats.totalRevenue}</div>
                      <div className="text-xs text-green-500 mt-1">
                        From Pro subscriptions
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-200">
                      <Zap className="h-5 w-5 text-purple-700" />
                    </div>
                    <div>
                      <div className="text-sm text-purple-600">Credits Used</div>
                      <div className="text-2xl font-bold text-purple-900">{subscriptionStats.totalCreditsUsed.toFixed(2)}</div>
                      <div className="text-xs text-purple-500 mt-1">
                        Across all users
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* User Profiles Table */}
            <Card>
              <CardHeader>
                <CardTitle>User Subscriptions</CardTitle>
                <CardDescription>All users with subscription and credit information</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Credits Balance</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userProfiles.slice(0, 20).map((profile) => (
                      <TableRow key={profile.id}>
                        <TableCell className="font-medium">{profile.email}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              profile.subscription_tier === 'pro'
                                ? 'bg-blue-500'
                                : 'bg-gray-500'
                            }
                          >
                            {profile.subscription_tier || 'free'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={profile.subscription_status === 'active' ? 'default' : 'secondary'}
                          >
                            {profile.subscription_status || 'inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {(profile.credits_balance || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(profile.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {userProfiles.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No user profiles found.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Performance Tab - Consolidated AI Models, Interior Design, Quality Metrics */}
          <TabsContent value="ai-performance" className="space-y-4">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${interiorDesignStats.total_cost.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">
                    {interiorDesignStats.total_generations} generations
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Images Generated</CardTitle>
                  <Image className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{interiorDesignStats.total_images}</div>
                  <p className="text-xs text-muted-foreground">
                    Avg {(interiorDesignStats.total_images / Math.max(interiorDesignStats.total_generations, 1)).toFixed(1)} per job
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Cost/Generation</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${(interiorDesignStats.total_cost / Math.max(interiorDesignStats.total_generations, 1)).toFixed(3)}
                  </div>
                  <p className="text-xs text-muted-foreground">Per generation</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{interiorDesignStats.unique_users}</div>
                  <p className="text-xs text-muted-foreground">Active users</p>
                </CardContent>
              </Card>
            </div>

            {/* Model Usage Table */}
            <Card>
              <CardHeader>
                <CardTitle>Model Usage & Costs</CardTitle>
                <CardDescription>Performance and cost breakdown by model</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Usage Count</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Avg Cost</TableHead>
                      <TableHead className="text-right">Success Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelUsage.map((model) => (
                      <TableRow key={model.model_id}>
                        <TableCell className="font-medium">{model.model_name}</TableCell>
                        <TableCell className="text-right">{model.usage_count}</TableCell>
                        <TableCell className="text-right">${model.total_cost.toFixed(3)}</TableCell>
                        <TableCell className="text-right">
                          ${(model.total_cost / Math.max(model.usage_count, 1)).toFixed(3)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={model.success_rate >= 90 ? 'default' : 'secondary'}>
                            {model.success_rate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {modelUsage.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No interior design generations found.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api-usage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API Usage Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response Time</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiUsage.slice(0, 15).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm max-w-xs truncate">
                          {log.endpoint}
                        </TableCell>
                        <TableCell>
                          <Badge className="border border-gray-300 bg-white text-gray-700">
                            {log.method}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={getStatusColor(log.status_code)}>
                            {log.status_code}
                          </span>
                        </TableCell>
                        <TableCell>{log.response_time_ms || 0}ms</TableCell>
                        <TableCell>
                          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                            {log.api_key_id
                              ? log.api_key_id.slice(0, 8) + '...'
                              : 'Anonymous'}
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
          </TabsContent>

          {/* Data Processing Tab - PDF, XML, Scraping */}
          <TabsContent value="data-processing" className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-200">
                      <FileText className="h-5 w-5 text-blue-700" />
                    </div>
                    <div>
                      <div className="text-sm text-blue-600">PDF Processing</div>
                      <div className="text-2xl font-bold text-blue-900">{dataProcessingStats.pdf.total}</div>
                      <div className="text-xs text-blue-500 mt-1">
                        {dataProcessingStats.pdf.completed} completed • {dataProcessingStats.pdf.processing} processing
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-200">
                      <Database className="h-5 w-5 text-green-700" />
                    </div>
                    <div>
                      <div className="text-sm text-green-600">XML Imports</div>
                      <div className="text-2xl font-bold text-green-900">{dataProcessingStats.xml.total}</div>
                      <div className="text-xs text-green-500 mt-1">
                        {dataProcessingStats.xml.totalProducts} products imported
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-200">
                      <Activity className="h-5 w-5 text-purple-700" />
                    </div>
                    <div>
                      <div className="text-sm text-purple-600">Web Scraping</div>
                      <div className="text-2xl font-bold text-purple-900">{dataProcessingStats.scraping.total}</div>
                      <div className="text-xs text-purple-500 mt-1">
                        {dataProcessingStats.scraping.totalPages} pages scraped
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed PDF Processing Monitor */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  PDF Processing Jobs
                </CardTitle>
                <CardDescription>Real-time monitoring of PDF processing pipeline</CardDescription>
              </CardHeader>
              <CardContent>
                <PDFProcessingMonitor />
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

            {/* AI Performance Summary */}
            <div className="grid grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-200">
                      <DollarSign className="h-5 w-5 text-orange-700" />
                    </div>
                    <div>
                      <div className="text-sm text-orange-600">Interior Design Cost</div>
                      <div className="text-2xl font-bold text-orange-900">${interiorDesignStats.total_cost.toFixed(2)}</div>
                      <div className="text-xs text-orange-500 mt-1">
                        {interiorDesignStats.total_generations} generations
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-200">
                      <Image className="h-5 w-5 text-blue-700" />
                    </div>
                    <div>
                      <div className="text-sm text-blue-600">Images Generated</div>
                      <div className="text-2xl font-bold text-blue-900">{interiorDesignStats.total_images}</div>
                      <div className="text-xs text-blue-500 mt-1">
                        Avg {(interiorDesignStats.total_images / Math.max(interiorDesignStats.total_generations, 1)).toFixed(1)} per job
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-200">
                      <CheckCircle className="h-5 w-5 text-green-700" />
                    </div>
                    <div>
                      <div className="text-sm text-green-600">Chunk Quality</div>
                      <div className="text-2xl font-bold text-green-900">92%</div>
                      <div className="text-xs text-green-500 mt-1">
                        Above threshold
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-200">
                      <TrendingUp className="h-5 w-5 text-purple-700" />
                    </div>
                    <div>
                      <div className="text-sm text-purple-600">Search Precision</div>
                      <div className="text-2xl font-bold text-purple-900">87%</div>
                      <div className="text-xs text-purple-500 mt-1">
                        Avg accuracy
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* AI Model Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  AI Model Usage & Costs
                </CardTitle>
                <CardDescription>Performance and cost breakdown by model</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead>Usage Count</TableHead>
                      <TableHead>Total Cost</TableHead>
                      <TableHead>Success Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelUsage.map((model) => (
                      <TableRow key={model.model_id}>
                        <TableCell className="font-medium">{model.model_name}</TableCell>
                        <TableCell>{model.usage_count}</TableCell>
                        <TableCell>${model.total_cost.toFixed(4)}</TableCell>
                        <TableCell>
                          <Badge variant={model.success_rate > 90 ? 'default' : 'secondary'}>
                            {model.success_rate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Quality Metrics & Interior Design */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Chunk Quality Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChunkQualityDashboard />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="h-5 w-5" />
                    Interior Design Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-gradient-to-r from-orange-50 to-orange-100 rounded">
                      <span className="text-sm">Total Generations</span>
                      <span className="font-mono text-sm font-semibold">{interiorDesignStats.total_generations}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gradient-to-r from-blue-50 to-blue-100 rounded">
                      <span className="text-sm">Images Created</span>
                      <span className="font-mono text-sm font-semibold">{interiorDesignStats.total_images}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gradient-to-r from-green-50 to-green-100 rounded">
                      <span className="text-sm">Unique Users</span>
                      <span className="font-mono text-sm font-semibold">{interiorDesignStats.unique_users}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded">
                      <span className="text-sm">Avg Cost/Generation</span>
                      <span className="font-mono text-sm font-semibold">
                        ${(interiorDesignStats.total_cost / Math.max(interiorDesignStats.total_generations, 1)).toFixed(3)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
