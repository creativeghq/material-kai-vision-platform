/**
 * AI Performance — self-contained monitoring surface for all AI models
 * (Claude vision/chunking/haiku + embedding models) plus Interior Design
 * generation stats and chunk-quality metrics.
 */

import React, { useEffect, useState } from 'react';
import { DollarSign, Zap, CreditCard, Bot, Image, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { HubDataTable, useHubTable, type HubColumn, type HubTableField } from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { ChunkQualityDashboard } from './ChunkQualityDashboard';
import type { AIUsageLog, InteriorDesignStats } from './OperationsDashboard/types';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { formatNumber } from '@/utils/decimal';

interface ModelUsageRow {
  model_name: string;
  call_count: number;
  total_cost: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  success_rate: number;
  avg_cost: number;
}

const MODEL_FIELDS: HubTableField<ModelUsageRow>[] = [
  { id: 'model', sortValue: (m) => m.model_name },
  { id: 'calls', sortValue: (m) => m.call_count },
  { id: 'input', sortValue: (m) => m.input_tokens },
  { id: 'output', sortValue: (m) => m.output_tokens },
  { id: 'total_cost', sortValue: (m) => m.total_cost },
  { id: 'avg_cost', sortValue: (m) => m.avg_cost },
  { id: 'success', sortValue: (m) => m.success_rate },
];

const MODEL_COLUMNS: HubColumn<ModelUsageRow>[] = [
  {
    id: 'model',
    header: 'Model',
    sortable: true,
    cell: (m) => (
      <div className="flex min-w-0 items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="block max-w-[16rem] truncate font-medium" title={m.model_name}>{m.model_name}</span>
      </div>
    ),
  },
  { id: 'calls', header: 'API Calls', align: 'right', sortable: true, cell: (m) => formatNumber(m.call_count) },
  { id: 'input', header: 'Input Tokens', align: 'right', sortable: true, hideBelow: 'md', cell: (m) => formatNumber(m.input_tokens || 0) },
  { id: 'output', header: 'Output Tokens', align: 'right', sortable: true, hideBelow: 'md', cell: (m) => formatNumber(m.output_tokens || 0) },
  { id: 'total_cost', header: 'Total Cost', align: 'right', sortable: true, cell: (m) => <span className="font-semibold">${m.total_cost.toFixed(4)}</span> },
  { id: 'avg_cost', header: 'Avg Cost/Call', align: 'right', sortable: true, hideBelow: 'lg', cell: (m) => `$${m.avg_cost.toFixed(4)}` },
  {
    id: 'success',
    header: 'Success Rate',
    align: 'right',
    sortable: true,
    hideBelow: 'sm',
    cell: (m) => (
      <Badge variant={m.success_rate >= 90 ? 'success' : m.success_rate >= 70 ? 'warning' : 'error'}>
        {m.success_rate.toFixed(1)}%
      </Badge>
    ),
  },
];

export const AIPerformanceTab: React.FC = () => {
  const [aiUsageLogs, setAIUsageLogs] = useState<AIUsageLog[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelUsageRow[]>([]);
  const [interiorDesignStats, setInteriorDesignStats] = useState<InteriorDesignStats>({
    total_generations: 0,
    total_cost: 0,
    total_images: 0,
    unique_users: 0,
  });
  const modelTable = useHubTable(modelUsage, MODEL_FIELDS, { columnId: 'total_cost', direction: 'desc' });

  useEffect(() => {
    const load = async () => {
      try {
        // AI usage logs (model calls) + agent chat usage (stored separately)
        const [{ data: aiLogs }, { data: agentLogs }] = await Promise.all([
          supabase
            .from('ai_usage_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100),
          supabase
            .from('agent_usage_logs')
            .select('id, user_id, agent_type, model_name, input_tokens, output_tokens, billed_cost_usd, raw_cost_usd, credits_debited, created_at')
            .order('created_at', { ascending: false })
            .limit(500),
        ]);

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

        const combinedLogs: AIUsageLog[] = [...(aiLogs || []), ...normalizedAgentLogs];
        setAIUsageLogs(combinedLogs);

        // Aggregate per-model usage
        const modelStats: Record<string, {
          call_count: number;
          total_cost: number;
          total_tokens: number;
          total_input_tokens: number;
          total_output_tokens: number;
          success_count: number;
        }> = {};

        combinedLogs.forEach((log) => {
          const model = log.model_name || 'unknown';
          if (!modelStats[model]) {
            modelStats[model] = {
              call_count: 0,
              total_cost: 0,
              total_tokens: 0,
              total_input_tokens: 0,
              total_output_tokens: 0,
              success_count: 0,
            };
          }
          modelStats[model].call_count++;
          modelStats[model].total_cost += Number(log.billed_cost_usd || 0);
          modelStats[model].total_input_tokens += Number(log.input_tokens || 0);
          modelStats[model].total_output_tokens += Number(log.output_tokens || 0);
          modelStats[model].total_tokens += Number(log.input_tokens || 0) + Number(log.output_tokens || 0);
          modelStats[model].success_count++;
        });

        const modelUsageArray: ModelUsageRow[] = Object.entries(modelStats).map(([model, stats]) => ({
          model_name: model,
          call_count: stats.call_count,
          total_cost: stats.total_cost,
          total_tokens: stats.total_tokens,
          input_tokens: stats.total_input_tokens,
          output_tokens: stats.total_output_tokens,
          success_rate: stats.call_count > 0 ? (stats.success_count / stats.call_count) * 100 : 0,
          avg_cost: stats.call_count > 0 ? stats.total_cost / stats.call_count : 0,
        }));
        modelUsageArray.sort((a, b) => b.total_cost - a.total_cost);
        setModelUsage(modelUsageArray);

        // Interior Design generation stats.
        // Three separate reasons this panel read zero on every metric:
        //  1. `generation_3d.total_cost` has no writer — generate-interior-gemini, the only
        //     inserter, never sets it. `.not('total_cost','is',null)` therefore matched zero
        //     rows FOREVER, so the generation count, image count and user count were zeroed
        //     too, not just the cost. Filter dropped.
        const INTERIOR_OPS = ['interior_design_generation', 'interior_design'];
        const totalCost = combinedLogs
          .filter((l) => INTERIOR_OPS.includes(l.operation_type))
          .reduce((sum, l) => sum + Number(l.billed_cost_usd || 0), 0);

        const { data: generations } = await supabase
          .from('generation_3d')
          .select('id, user_id, models_results')
          .eq('generation_status', 'completed');

        if (generations) {
          const uniqueUsers = new Set(generations.map(g => g.user_id)).size;
          let totalImages = 0;
          generations.forEach(g => {
            // `mode` is a sibling string key, not a model result — skip non-objects.
            Object.entries((g.models_results ?? {}) as Record<string, any>).forEach(([key, v]) => {
              if (key === 'mode' || !v || typeof v !== 'object') return;
              if (Array.isArray(v.image_urls)) totalImages += v.image_urls.length;
              else if (v.image_url) totalImages += 1;
            });
          });
          setInteriorDesignStats({
            total_generations: generations.length,
            total_cost: totalCost,
            total_images: totalImages,
            unique_users: uniqueUsers,
          });
        }
      } catch (err) {
        console.error('Error loading AI performance data:', err);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <SectionHeader
        title="AI Performance"
        subtitle="Monitoring all AI models — Claude Opus 4.8 (vision + classification), Claude Sonnet 4.6 (chunking), Claude Haiku 4.5, and embedding models (SigLIP, Voyage AI). Track costs, tokens, success rates, and performance metrics across your entire AI infrastructure."
      />

      {/* AI Models Summary Cards */}
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
                {formatNumber(aiUsageLogs.reduce((sum, log) => sum + (Number(log.input_tokens) || 0) + (Number(log.output_tokens) || 0), 0))}
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

        {/* Interior Design Stats */}
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

      {/* AI Models Usage Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Model Usage & Costs
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            All AI models (GPT, Claude, etc.) - Performance and cost breakdown
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <HubDataTable
            className="rounded-none border-0 border-t"
            rows={modelTable.rows}
            columns={MODEL_COLUMNS}
            rowId={(m) => m.model_name}
            sort={modelTable.sort}
            onSortChange={modelTable.setSort}
            empty={
              <span className="text-sm text-muted-foreground">
                No AI usage data yet. Models will show actual data once API calls are made.
              </span>
            }
          />
        </CardContent>
      </Card>

      {/* Chunk Quality Dashboard */}
      <ChunkQualityDashboard />
    </div>
  );
};

export default AIPerformanceTab;
