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
  Database,
  Sparkles,
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

const AgentMLCoordination: React.FC = () => {
  const navigate = useNavigate();
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [mlTasks, setMLTasks] = useState<MLTask[]>([]);
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
    <div className="min-h-screen bg-background">
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
            <Card>
              <CardHeader>
                <CardTitle>AI Model Settings</CardTitle>
                <CardDescription>
                  Configure AI model parameters and API settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2">Claude Models</h4>
                      <p className="text-sm text-muted-foreground">Sonnet 4.5, Haiku 4.5</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">GPT Models</h4>
                      <p className="text-sm text-muted-foreground">GPT-5</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Vision Models</h4>
                      <p className="text-sm text-muted-foreground">Llama 4 Scout 17B Vision</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Embedding Models</h4>
                      <p className="text-sm text-muted-foreground">google/vit-base-patch16-224</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
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
