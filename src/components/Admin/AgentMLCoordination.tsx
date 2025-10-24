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
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
      // TODO: Create agent_tasks table in database schema
      // const [agentTasksResult, mlTasksResult] = await Promise.all([
      //   supabase
      //     .from('agent_tasks')
      //     .select('*')
      //     .order('created_at', { ascending: false })
      //     .limit(50),
      //   supabase
      //     .from('agent_ml_tasks')
      //     .select('*')
      //     .order('created_at', { ascending: false })

      // Mock response for agent_tasks until table is created
      const agentTasksResult: { data: null; error: null } = { data: null, error: null };

      const [mlTasksResult] = await Promise.all([
        supabase
          .from('agent_ml_tasks')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (agentTasksResult.error) throw agentTasksResult.error;
      if (mlTasksResult.error) throw mlTasksResult.error;

      const agentData = (agentTasksResult.data || []).filter((task: Record<string, unknown>) => task.status !== null) as AgentTask[];
      const mlData = (mlTasksResult.data || []).filter((task: unknown) => (task as any).agent_task_id !== null && (task as any).created_at !== null) as MLTask[];

      setAgentTasks(agentData);
      setMLTasks(mlData);

      // Calculate stats
      const totalTasks = agentData.length;
      const activeTasks = agentData.filter(task => task.status === 'processing').length;
      const completedTasks = agentData.filter(task => task.status === 'completed').length;
      const avgProcessingTime = agentData
        .filter(task => task.processing_time_ms)
        .reduce((sum, task) => sum + (task.processing_time_ms || 0), 0) / completedTasks || 0;

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
      case 'completed': return 'bg-green-500/20 text-green-600';
      case 'processing': return 'bg-blue-500/20 text-blue-600';
      case 'pending': return 'bg-yellow-500/20 text-yellow-600';
      case 'failed': return 'bg-red-500/20 text-red-600';
      default: return 'bg-gray-500/20 text-gray-600';
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
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => navigate('/')} onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
                className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
              >
                <Brain className="h-4 w-4" />
                Back to Main
              </Button><Button
                onClick={() => navigate('/admin')} onKeyDown={(e) => e.key === 'Enter' && navigate('/admin')}
                className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
              >
                <Activity className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Agent ML Coordination</h1>
              <p className="text-sm text-muted-foreground">
                Monitor agent assignments and ML task distribution
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchData} onKeyDown={(e) => e.key === 'Enter' && fetchData()} className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button className="px-2 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white">
              <Play className="h-4 w-4 mr-2" />
              Start New Task
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTasks}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.activeTasks}</div>
            <p className="text-xs text-muted-foreground">Currently processing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completedTasks}</div>
            <p className="text-xs text-muted-foreground">Success rate: {stats.totalTasks > 0 ? ((stats.completedTasks / stats.totalTasks) * 100).toFixed(1) : 0}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Processing</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgProcessingTime}ms</div>
            <p className="text-xs text-muted-foreground">Per task</p>
          </CardContent>
        </Card>
      </div>

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
                    {task.processing_time_ms ? `${task.processing_time_ms}ms` : 'N/A'}
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
                      <span className="font-medium">{mlTask.ml_operation_type}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {mlTask.agent_task_id.slice(0, 8)}...
                    </code>
                  </TableCell>
                  <TableCell>
                    {mlTask.processing_time_ms ? `${mlTask.processing_time_ms}ms` : 'N/A'}
                  </TableCell>
                  <TableCell>
                    {mlTask.confidence_scores && typeof mlTask.confidence_scores === 'object' ? (
                      <div className="space-y-1">
                        {Object.entries(mlTask.confidence_scores).slice(0, 2).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-xs">{key}:</span>
                            <Progress value={Number(value) * 100} className="w-16 h-2" />
                            <span className="text-xs">{(Number(value) * 100).toFixed(0)}%</span>
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
      </div>
    </div>
  );
};

export default AgentMLCoordination;
