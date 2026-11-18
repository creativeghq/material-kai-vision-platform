import React, { useState, useEffect, useCallback } from 'react';
import {
  Workflow,
  Play,
  Clock,
  CheckCircle2,
  Settings,
  LayoutGrid,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Card, CardContent } from '@/components/core/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { MyFlowsTab } from './MyFlowsTab';
import { FlowBuilderTab } from './FlowBuilderTab';
import { RunHistoryTab } from './RunHistoryTab';
import { SystemAreasTab } from './SystemAreasTab';
import { flowService } from '@/services/flows';
import type { Flow } from '@/services/flows';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export const FlowsManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('my-flows');
  const [loading, setLoading] = useState(true);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; active: number; runs30d: number | null; successRate: number | null }>({
    total: 0,
    active: 0,
    runs30d: null,
    successRate: null,
  });
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [allFlows, finished, failed] = await Promise.all([
        flowService.listFlows(),
        supabase.from('flow_runs').select('id', { count: 'exact', head: true }).gte('created_at', since).in('status', ['completed', 'failed']),
        supabase.from('flow_runs').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('status', 'failed'),
      ]);
      setFlows(allFlows);

      const runs = finished.error || failed.error ? null : finished.count ?? 0;
      setStats({
        total: allFlows.length,
        active: allFlows.filter(f => f.status === 'active').length,
        runs30d: runs,
        successRate: runs ? Math.round(((runs - (failed.count ?? 0)) / runs) * 1000) / 10 : null,
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
      title: 'Runs (30 Days)',
      value: stats.runs30d ?? '—',
      icon: Clock,
      color: 'text-amber-500',
    },
    {
      title: 'Success Rate',
      value: stats.successRate == null ? '—' : `${stats.successRate}%`,
      icon: CheckCircle2,
      color: 'text-emerald-500',
    },
  ];

  return (
    <div className="min-h-screen">
      <PageHeader icon={Workflow} title="Flows" subtitle="Visual workflow automations with triggers, conditions and actions." />

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
            <TabsTrigger value="my-flows" className="gap-2">
              <Workflow className="h-4 w-4" />
              My Flows
            </TabsTrigger>
            <TabsTrigger value="builder" className="gap-2">
              <Settings className="h-4 w-4" />
              Flow Builder
            </TabsTrigger>
            <TabsTrigger value="areas" className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              System Areas
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
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

          <TabsContent value="areas">
            <SystemAreasTab
              flows={flows}
              onRefresh={loadData}
              onOpenBuilder={(flowId) => {
                setSelectedFlowId(flowId);
                setActiveTab('builder');
              }}
            />
          </TabsContent>

          <TabsContent value="history">
            <RunHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
