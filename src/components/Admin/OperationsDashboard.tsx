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
  ListTodo,
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
import { UnifiedProcessingMonitor } from './UnifiedProcessingMonitor';
import { SystemHealthMonitor } from './SystemHealthMonitor';
import { KanbanBoard } from '@/components/Tasks/KanbanBoard';
import { TaskDetailPanel } from '@/components/Tasks/TaskDetailPanel';
import { CreateTaskModal } from '@/components/Tasks/CreateTaskModal';
import type { TaskWithDetails } from '@/services/tasks';

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
  // Claude Models
  { id: 'claude-haiku-4', name: 'Claude Haiku 4.5', provider: 'anthropic', model: 'claude-haiku-4-20250514', inputCostPer1M: 0.80, outputCostPer1M: 4.00, speed: 'fast', usedFor: ['Search Agent', 'Quick Queries', 'Validation'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4.5', provider: 'anthropic', model: 'claude-sonnet-4-20250514', inputCostPer1M: 3.00, outputCostPer1M: 15.00, speed: 'medium', usedFor: ['PDF Processing', 'Product Discovery', 'Admin Agent'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'claude-sonnet-3.5', name: 'Claude Sonnet 3.5', provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', inputCostPer1M: 3.00, outputCostPer1M: 15.00, speed: 'medium', usedFor: ['Legacy Tasks'], totalInputTokens: 0, totalOutputTokens: 0 },

  // OpenAI Models
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai', model: 'gpt-5', inputCostPer1M: 5.00, outputCostPer1M: 15.00, speed: 'medium', usedFor: ['High Accuracy Tasks', 'Discovery'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', model: 'gpt-4o', inputCostPer1M: 2.50, outputCostPer1M: 10.00, speed: 'medium', usedFor: ['Fallback', 'Chunking'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small', provider: 'openai', model: 'text-embedding-3-small', inputCostPer1M: 0.02, outputCostPer1M: 0.00, speed: 'fast', usedFor: ['Text Embeddings'], totalInputTokens: 0, totalOutputTokens: 0 },

  // Meta Llama Models
  { id: 'llama-4-scout', name: 'Llama 4 Scout 17B Vision', provider: 'meta', model: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', inputCostPer1M: 0.20, outputCostPer1M: 0.20, speed: 'fast', usedFor: ['Image Classification', 'Vision Analysis'], totalInputTokens: 0, totalOutputTokens: 0 },

  // Vision/Embedding Models
  { id: 'siglip', name: 'SigLIP SO400M', provider: 'google', model: 'google/siglip-so400m-patch14-384', inputCostPer1M: 0.00, outputCostPer1M: 0.00, speed: 'fast', usedFor: ['Visual Embeddings (Primary)'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'clip', name: 'CLIP ViT Base', provider: 'openai', model: 'openai/clip-vit-base-patch32', inputCostPer1M: 0.00, outputCostPer1M: 0.00, speed: 'fast', usedFor: ['Visual Embeddings (Fallback)'], totalInputTokens: 0, totalOutputTokens: 0 },
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
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]); // AI models (GPT, Claude, Llama)
  const [interiorDesignModels, setInteriorDesignModels] = useState<ModelUsage[]>([]); // Interior Design specific models
  const [dataProcessingStats, setDataProcessingStats] = useState<DataProcessingStats>({
    pdf: { total: 0, completed: 0, failed: 0, processing: 0, avgProcessingTime: 0 },
    xml: { total: 0, completed: 0, failed: 0, processing: 0, totalProducts: 0 },
    scraping: { total: 0, completed: 0, failed: 0, processing: 0, totalPages: 0 },
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Task management state
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isTaskDetailModalOpen, setIsTaskDetailModalOpen] = useState(false);

  const handleTaskClick = (task: TaskWithDetails) => {
    setSelectedTask(task);
    setIsTaskDetailModalOpen(true);
  };

  const handleCreateTask = () => {
    setIsCreateTaskModalOpen(true);
  };

  const handleCloseTaskDetailModal = () => {
    setIsTaskDetailModalOpen(false);
    setSelectedTask(null);
  };

  const handleCloseCreateTaskModal = () => {
    setIsCreateTaskModalOpen(false);
  };

  const handleTaskCreated = () => {
    // Refresh the kanban board by triggering a re-render
    // The KanbanBoard component will reload its data
    setIsCreateTaskModalOpen(false);
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
            (item as any).status_code !== null,
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
        console.log('✅ AI Usage Logs:', aiLogs.length);
        setAIUsageLogs(aiLogs);

        // Calculate total credits used
        const totalCreditsUsed = aiLogs.reduce((sum: number, log: AIUsageLog) => sum + (log.credits_debited || 0), 0);

        setSubscriptionStats(prev => ({
          ...prev,
          totalCreditsUsed,
        }));

        // Calculate AI Model Usage Stats (GPT, Claude, Llama, etc.)
        const modelStats: Record<string, {
          call_count: number;
          total_cost: number;
          total_tokens: number;
          total_input_tokens: number;
          total_output_tokens: number;
          avg_latency: number;
          success_count: number;
        }> = {};

        aiLogs.forEach((log: AIUsageLog) => {
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
          modelStats[model].total_cost += Number(log.total_cost_usd || 0);
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
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
        <p className="text-xs text-muted-foreground">{title}</p>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="flex items-center justify-between mt-1">
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
        <Tabs defaultValue="system-health" className="space-y-4">
          <TabsList className="grid w-full grid-cols-7">
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
            <TabsTrigger value="tasks">
              <ListTodo className="h-4 w-4 mr-2" />
              Tasks
            </TabsTrigger>
          </TabsList>

          {/* System Health Tab */}
          <TabsContent value="system-health" className="space-y-4">
            <SystemHealthMonitor />
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
            <div className="grid grid-cols-3 gap-4">
              <div className="dashboard-card">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                    <Crown className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium">Pro Subscribers</div>
                    <div className="text-2xl font-bold text-foreground">{subscriptionStats.proUsers}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {subscriptionStats.totalUsers > 0 ? ((subscriptionStats.proUsers / subscriptionStats.totalUsers) * 100).toFixed(1) : 0}% of users
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
                    <div className="text-sm text-muted-foreground font-medium">Monthly Revenue</div>
                    <div className="text-2xl font-bold text-foreground">${subscriptionStats.totalRevenue}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      From Pro subscriptions
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
                    <div className="text-sm text-muted-foreground font-medium">Credits Used</div>
                    <div className="text-2xl font-bold text-foreground">{subscriptionStats.totalCreditsUsed.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Across all users
                    </div>
                  </div>
                </div>
              </div>
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
          <TabsContent value="ai-performance" className="space-y-6">
            {/* Page Header */}
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">AI Performance</h2>
              <p className="text-muted-foreground">
                Monitoring all AI models including Claude Sonnet 4.5, Claude Haiku 4.5, GPT-5, GPT-4o, Llama 4 Scout 17B, and vision/embedding models (SigLIP, CLIP). Track costs, tokens, success rates, and performance metrics across your entire AI infrastructure.
              </p>
            </div>

            {/* AI Models Summary Cards - GPT, Claude, Llama, Interior Design, etc. */}
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
                        aiUsageLogs.reduce((sum, log) => sum + (Number(log.total_cost_usd) || 0), 0) +
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



            {/* AI Models Usage Table - GPT, Claude, Llama, etc. */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  AI Model Usage & Costs
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  All AI models (GPT, Claude, Llama, etc.) - Performance and cost breakdown
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
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
                        <TableRow key={model.model_name} className="hover:bg-gray-50">
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
                          {/* Chat/Completion Models */}
                          <TableRow className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-gray-400" />
                                <span className="text-gray-600">GPT-5</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">0.0%</Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-gray-400" />
                                <span className="text-gray-600">GPT-4o</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">0.0%</Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-gray-400" />
                                <span className="text-gray-600">GPT-4o-mini</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">0.0%</Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-gray-400" />
                                <span className="text-gray-600">Claude Sonnet 4.5</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">0.0%</Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-gray-400" />
                                <span className="text-gray-600">Claude Haiku 4.5</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">0.0%</Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-gray-400" />
                                <span className="text-gray-600">Llama 4 Scout 17B Vision</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">0.0%</Badge>
                            </TableCell>
                          </TableRow>
                          {/* Embedding Models */}
                          <TableRow className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-gray-400" />
                                <span className="text-gray-600">text-embedding-3-small</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">0.0%</Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-gray-400" />
                                <span className="text-gray-600">SigLIP ViT-SO400M</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">0.0%</Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-gray-400" />
                                <span className="text-gray-600">CLIP ViT-Base</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">0</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-400">$0.0000</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">0.0%</Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-4 text-sm text-muted-foreground">
                              No AI usage data yet. All models (GPT-5, GPT-4o, GPT-4o-mini, Claude Sonnet 4.5, Claude Haiku 4.5, Llama 4 Scout 17B Vision, text-embedding-3-small, SigLIP, CLIP) will show actual data once API calls are made.
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Chunk Quality Metrics
                </CardTitle>
                <CardDescription>
                  Monitor chunk quality, deduplication, and flagged content
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChunkQualityDashboard />
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
          <TabsContent value="data-processing" className="space-y-6">
            {/* Page Header */}
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Data Processing Pipeline</h2>
              <p className="text-muted-foreground">
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

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4">
            <div className="h-[calc(100vh-20rem)]">
              <KanbanBoard
                onTaskClick={handleTaskClick}
                onCreateTask={handleCreateTask}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Task Detail Panel (Sliding from right) */}
      <TaskDetailPanel
        task={selectedTask}
        isOpen={isTaskDetailModalOpen}
        onClose={handleCloseTaskDetailModal}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={handleCloseCreateTaskModal}
        onTaskCreated={handleTaskCreated}
      />
    </div>
  );
};
