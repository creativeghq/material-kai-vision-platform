import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain,
  Cpu,
  Clock,
  Users,
  TrendingUp,
  Activity,
  RefreshCw,
  Play,
  Pause,
  Square,
  Settings,
  Bot,
  Sparkles,
  Zap,
  Eye,
  MessageSquare,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { AdminStatCard } from './AdminStatCard';

interface AgentTask {
  id: string;
  task_type: string;
  status: string;
  assigned_agents: string[];
  processing_time_ms: number | null;
  created_at: string;
  priority: number;
}

interface MLTask {
  id: string;
  ml_operation_type: string;
  agent_task_id: string;
  processing_time_ms: number | null;
  confidence_scores: Record<string, unknown>;
  created_at: string;
}

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

// Model configurations with pricing
const MODEL_CONFIGS: ModelConfig[] = [
  {
    id: 'claude-haiku',
    name: 'Claude Haiku 3.5',
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    inputCostPer1M: 0.80,
    outputCostPer1M: 4.00,
    speed: 'fast',
    usedFor: ['Search Agent', 'Quick Queries'],
    totalInputTokens: 0,
    totalOutputTokens: 0,
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    speed: 'medium',
    usedFor: ['PDF Processing', 'Complex Tasks', 'Admin Agent'],
    totalInputTokens: 0,
    totalOutputTokens: 0,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    model: 'gpt-4o',
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    speed: 'medium',
    usedFor: ['Fallback', 'Vision Tasks'],
    totalInputTokens: 0,
    totalOutputTokens: 0,
  },
  {
    id: 'llama-vision',
    name: 'Llama 4 Scout 17B Vision',
    provider: 'meta',
    model: 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
    inputCostPer1M: 0.20,
    outputCostPer1M: 0.20,
    speed: 'fast',
    usedFor: ['Image Embeddings', 'Vision Analysis'],
    totalInputTokens: 0,
    totalOutputTokens: 0,
  },
  {
    id: 'vit-embeddings',
    name: 'ViT Base Patch16',
    provider: 'google',
    model: 'google/vit-base-patch16-224',
    inputCostPer1M: 0.00,
    outputCostPer1M: 0.00,
    speed: 'fast',
    usedFor: ['CLIP Embeddings', 'Image Classification'],
    totalInputTokens: 0,
    totalOutputTokens: 0,
  },
];

// Provider icons/colors
const getProviderStyle = (provider: string) => {
  switch (provider) {
    case 'anthropic':
      return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', icon: '🧠' };
    case 'openai':
      return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: '🤖' };
    case 'meta':
      return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: '🦙' };
    case 'google':
      return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: '🔍' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: '⚙️' };
  }
};

const AgentMLCoordination: React.FC = () => {
  const navigate = useNavigate();
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [mlTasks, setMLTasks] = useState<MLTask[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelConfig[]>(MODEL_CONFIGS);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    avgProcessingTime: 0,
  });
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      // Only fetch agent_tasks table (agent_ml_tasks table doesn't exist in database)
      const agentTasksResult = await supabase
        .from('agent_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (agentTasksResult.error) throw agentTasksResult.error;

      const agentData = (agentTasksResult.data || []).filter(
        (task: Record<string, unknown>) => task.status !== null,
      ) as AgentTask[];

      // Empty ML tasks array since table doesn't exist
      const mlData: MLTask[] = [];

      setAgentTasks(agentData);
      setMLTasks(mlData);

      // Calculate stats
      const totalTasks = agentData.length;
      const activeTasks = agentData.filter(
        (task) => task.status === 'processing',
      ).length;
      const completedTasks = agentData.filter(
        (task) => task.status === 'completed',
      ).length;
      const avgProcessingTime =
        agentData
          .filter((task) => task.processing_time_ms)
          .reduce((sum, task) => sum + (task.processing_time_ms || 0), 0) /
          completedTasks || 0;

      setStats({
        totalTasks,
        activeTasks,
        completedTasks,
        avgProcessingTime: Math.round(avgProcessingTime),
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch agent tasks data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-600';
      case 'processing':
        return 'bg-blue-500/20 text-blue-600';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-600';
      case 'failed':
        return 'bg-red-500/20 text-red-600';
      default:
        return 'bg-gray-500/20 text-gray-600';
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'bg-red-500/20 text-red-600';
    if (priority >= 5) return 'bg-yellow-500/20 text-yellow-600';
    return 'bg-green-500/20 text-green-600';
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="AI Settings & Agent Coordination"
        description="Comprehensive AI configuration: prompts, NLP settings, model configurations, and agent task monitoring"
        badge="AI Control Panel"
      />

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <AdminStatCard
            title="Total Tasks"
            value={stats.totalTasks}
            icon={Brain}
            description="All time"
            variant="glass"
          />
          <AdminStatCard
            title="Active Tasks"
            value={stats.activeTasks}
            icon={Activity}
            description="Currently processing"
            variant="glass"
          />
          <AdminStatCard
            title="Completed"
            value={stats.completedTasks}
            icon={TrendingUp}
            description={`Success rate: ${stats.totalTasks > 0 ? ((stats.completedTasks / stats.totalTasks) * 100).toFixed(1) : 0}%`}
            variant="glass"
          />
          <AdminStatCard
            title="Avg Processing"
            value={`${stats.avgProcessingTime}ms`}
            icon={Clock}
            description="Per task"
            variant="glass"
          />
        </div>

        {/* Tabs for AI Settings */}
        <Tabs defaultValue="tasks" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tasks">
              <Brain className="h-4 w-4 mr-2" />
              Agent Tasks
            </TabsTrigger>
            <TabsTrigger value="prompts">
              <Sparkles className="h-4 w-4 mr-2" />
              AI Prompts
            </TabsTrigger>
            <TabsTrigger value="models">
              <Settings className="h-4 w-4 mr-2" />
              Model Settings
            </TabsTrigger>
            <TabsTrigger value="agents">
              <Bot className="h-4 w-4 mr-2" />
              Agent Configs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="space-y-4">

        {/* Agent Tasks Table */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Tasks ({agentTasks.length})</CardTitle>
            <CardDescription>
              Monitor agent task assignments and execution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Agents</TableHead>
                  <TableHead>Processing Time</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className="font-medium">{task.task_type}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(task.status)}>
                        {task.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(task.priority)}>
                        P{task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        <span>{task.assigned_agents.length}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {task.processing_time_ms
                        ? `${task.processing_time_ms}ms`
                        : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {new Date(task.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {task.status === 'processing' ? (
                          <Button className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : task.status === 'pending' ? (
                          <Button className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                            <Play className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                            <Square className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ML Tasks Table */}
        <Card>
          <CardHeader>
            <CardTitle>ML Operations ({mlTasks.length})</CardTitle>
            <CardDescription>
              Machine learning tasks associated with agent operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation Type</TableHead>
                  <TableHead>Agent Task</TableHead>
                  <TableHead>Processing Time</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mlTasks.map((mlTask) => (
                  <TableRow key={mlTask.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4" />
                        <span className="font-medium">
                          {mlTask.ml_operation_type}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {mlTask.agent_task_id.slice(0, 8)}...
                      </code>
                    </TableCell>
                    <TableCell>
                      {mlTask.processing_time_ms
                        ? `${mlTask.processing_time_ms}ms`
                        : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {mlTask.confidence_scores &&
                      typeof mlTask.confidence_scores === 'object' ? (
                        <div className="space-y-1">
                          {Object.entries(mlTask.confidence_scores)
                            .slice(0, 2)
                            .map(([key, value]) => (
                              <div
                                key={key}
                                className="flex items-center gap-2"
                              >
                                <span className="text-xs">{key}:</span>
                                <Progress
                                  value={Number(value) * 100}
                                  className="w-16 h-2"
                                />
                                <span className="text-xs">
                                  {(Number(value) * 100).toFixed(0)}%
                                </span>
                              </div>
                            ))}
                        </div>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(mlTask.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="prompts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>AI Prompts Management</CardTitle>
                <CardDescription>
                  Manage prompts for data extraction, NLP processing, and agent interactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Button onClick={() => navigate('/admin/agent-configs')}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Manage Agent Prompts
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Configure prompts for PDF processing, search enhancement, product discovery, and interior design agents.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="models" className="space-y-4">
            {/* Model Cost Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🧠</span>
                    <div>
                      <div className="text-sm text-orange-600 font-medium">Anthropic</div>
                      <div className="text-2xl font-bold text-orange-800">
                        ${modelUsage.filter(m => m.provider === 'anthropic').reduce((sum, m) =>
                          sum + ((m.totalInputTokens / 1_000_000) * m.inputCostPer1M) + ((m.totalOutputTokens / 1_000_000) * m.outputCostPer1M), 0
                        ).toFixed(4)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🤖</span>
                    <div>
                      <div className="text-sm text-green-600 font-medium">OpenAI</div>
                      <div className="text-2xl font-bold text-green-800">
                        ${modelUsage.filter(m => m.provider === 'openai').reduce((sum, m) =>
                          sum + ((m.totalInputTokens / 1_000_000) * m.inputCostPer1M) + ((m.totalOutputTokens / 1_000_000) * m.outputCostPer1M), 0
                        ).toFixed(4)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🦙</span>
                    <div>
                      <div className="text-sm text-blue-600 font-medium">Meta / Other</div>
                      <div className="text-2xl font-bold text-blue-800">
                        ${modelUsage.filter(m => m.provider === 'meta' || m.provider === 'google').reduce((sum, m) =>
                          sum + ((m.totalInputTokens / 1_000_000) * m.inputCostPer1M) + ((m.totalOutputTokens / 1_000_000) * m.outputCostPer1M), 0
                        ).toFixed(4)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Model Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {modelUsage.map((model) => {
                const style = getProviderStyle(model.provider);
                const inputCost = (model.totalInputTokens / 1_000_000) * model.inputCostPer1M;
                const outputCost = (model.totalOutputTokens / 1_000_000) * model.outputCostPer1M;
                const totalCost = inputCost + outputCost;

                return (
                  <Card key={model.id} className={`${style.bg} ${style.border} border-2 hover:shadow-lg transition-shadow`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{style.icon}</span>
                          <div>
                            <CardTitle className={`text-lg ${style.text}`}>{model.name}</CardTitle>
                            <CardDescription className="text-xs font-mono">{model.model}</CardDescription>
                          </div>
                        </div>
                        <Badge className={`${model.speed === 'fast' ? 'bg-green-500' : model.speed === 'medium' ? 'bg-yellow-500' : 'bg-red-500'} text-white`}>
                          <Zap className="h-3 w-3 mr-1" />
                          {model.speed}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Pricing */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-white/50 rounded p-2">
                          <div className="text-xs text-gray-500">Input Cost</div>
                          <div className="font-semibold">${model.inputCostPer1M}/1M</div>
                        </div>
                        <div className="bg-white/50 rounded p-2">
                          <div className="text-xs text-gray-500">Output Cost</div>
                          <div className="font-semibold">${model.outputCostPer1M}/1M</div>
                        </div>
                      </div>

                      {/* Usage Stats */}
                      <div className="bg-white/50 rounded p-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Token Usage</span>
                          <span className="font-semibold text-gray-700">${totalCost.toFixed(4)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            <span>In: {model.totalInputTokens.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            <span>Out: {model.totalOutputTokens.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Used For */}
                      <div className="flex flex-wrap gap-1">
                        {model.usedFor.map((use) => (
                          <Badge key={use} variant="outline" className="text-xs bg-white/50">
                            {use}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="agents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Agent Configurations</CardTitle>
                <CardDescription>
                  View and manage all AI agents with role-based access control
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Button onClick={() => navigate('/admin/agent-configs')}>
                    <Bot className="h-4 w-4 mr-2" />
                    Configure Agents
                  </Button>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">📄</span>
                        <h4 className="font-medium">PDF Processor</h4>
                      </div>
                      <Badge>Admin Only</Badge>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">🔍</span>
                        <h4 className="font-medium">Search Agent</h4>
                      </div>
                      <Badge className="bg-green-100 text-green-800">Public</Badge>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">📦</span>
                        <h4 className="font-medium">Product Agent</h4>
                      </div>
                      <Badge className="bg-green-100 text-green-800">Public</Badge>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">🎨</span>
                        <h4 className="font-medium">Interior Designer</h4>
                      </div>
                      <Badge className="bg-green-100 text-green-800">Public</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AgentMLCoordination;
