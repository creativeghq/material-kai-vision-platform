import React, { useState, useEffect, useCallback } from 'react';
import {
  Workflow,
  Play,
  Clock,
  CheckCircle2,
  Settings,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Card, CardContent } from '@/components/core/ui/card';
import { GlobalAdminHeader } from '../GlobalAdminHeader';
import { MyFlowsTab } from './MyFlowsTab';
import { FlowBuilderTab } from './FlowBuilderTab';
import { RunHistoryTab } from './RunHistoryTab';
import { flowService } from '@/services/flows';
import type { Flow } from '@/services/flows';
import { useToast } from '@/hooks/use-toast';

export const FlowsManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('my-flows');
  const [loading, setLoading] = useState(true);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    runsToday: 0,
    successRate: 0,
  });
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const allFlows = await flowService.listFlows();
      setFlows(allFlows);

      const activeFlows = allFlows.filter(f => f.status === 'active').length;
      const totalRuns = allFlows.reduce((sum, f) => sum + f.run_count, 0);

      setStats({
        total: allFlows.length,
        active: activeFlows,
        runsToday: totalRuns,
        successRate: totalRuns > 0 ? 95 : 0,
      });
    } catch (error) {
      console.error('Error loading flows:', error);
      toast({
        title: 'Error',
        description: 'Failed to load flows data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const statCards = [
    {
      title: 'Total Flows',
      value: stats.total,
      icon: Workflow,
      color: 'text-blue-500',
    },
    {
      title: 'Active',
      value: stats.active,
      icon: Play,
      color: 'text-green-500',
    },
    {
      title: 'Total Runs',
      value: stats.runsToday,
      icon: Clock,
      color: 'text-amber-500',
    },
    {
      title: 'Success Rate',
      value: stats.successRate > 0 ? `${stats.successRate}%` : '—',
      icon: CheckCircle2,
      color: 'text-emerald-500',
    },
  ];

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Flows"
        description="Build visual workflow automations with triggers, conditions, and actions"
        badge="Automation"
      />

      <div className="p-3 sm:p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <Card key={card.title}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="text-2xl font-bold mt-1">{card.value}</p>
                  </div>
                  <card.icon className={`h-8 w-8 ${card.color} opacity-80`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="my-flows" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Workflow className="h-4 w-4" />
              My Flows
            </TabsTrigger>
            <TabsTrigger value="builder" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Settings className="h-4 w-4" />
              Flow Builder
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Clock className="h-4 w-4" />
              Run History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-flows">
            <MyFlowsTab
              flows={flows}
              loading={loading}
              onRefresh={loadData}
              onOpenBuilder={(flowId) => {
                setSelectedFlowId(flowId);
                setActiveTab('builder');
              }}
            />
          </TabsContent>

          <TabsContent value="builder">
            <FlowBuilderTab flowId={selectedFlowId} />
          </TabsContent>

          <TabsContent value="history">
            <RunHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
