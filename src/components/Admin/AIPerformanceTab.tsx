/**
 * AI Performance — self-contained monitoring surface for all AI models
 * (Claude vision/chunking/haiku + embedding models) plus Interior Design
 * generation stats and chunk-quality metrics.
 *
 * Relocated 2026-07-15 from the Operations dashboard's inline "AI Performance"
 * tab into its own component so it can live under /admin/ai-configs?tab=performance.
 * Loads its own data (ai_usage_logs + agent_usage_logs + generation_3d) instead
 * of borrowing the Operations dashboard's shared fetch.
 */

import React, { useEffect, useState } from 'react';
import { DollarSign, Zap, CreditCard, Bot, Image, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { ChunkQualityDashboard } from './ChunkQualityDashboard';
import type { AIUsageLog, InteriorDesignStats } from './OperationsDashboard/types';
import { SectionHeader } from '@/components/shared/SectionHeader';

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

export const AIPerformanceTab: React.FC = () => {
  const [aiUsageLogs, setAIUsageLogs] = useState<AIUsageLog[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelUsageRow[]>([]);
  const [interiorDesignStats, setInteriorDesignStats] = useState<InteriorDesignStats>({
    total_generations: 0,
    total_cost: 0,
    total_images: 0,
    unique_users: 0,
  });

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
        // Three separate reasons this panel read zero on every metric (audit #304 finding 9):
        //  1. `generation_3d.total_cost` has no writer — generate-interior-gemini, the only
        //     inserter, never sets it. `.not('total_cost','is',null)` therefore matched zero
        //     rows FOREVER, so the generation count, image count and user count were zeroed
        //     too, not just the cost. Filter dropped.
        //  2. Cost is not generation_3d's to hold. `ai_usage_logs.billed_cost_usd` is the single
        //     source for what a call cost (CLAUDE.md: one derivation per money quantity), and
        //     `combinedLogs` is already loaded above — so it is summed from there rather than
        //     re-derived into a second column that would then drift.
        //  3. The image tally read `model.status === 'completed' && model.image_urls`. The
        //     writer stores `{ mode, [modelLabel]: { success: true, image_url } }` — no
        //     `status`, no `image_urls` array. It would have counted 0 even with rows present.
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
                {modelUsage.map((model) => (
                  <TableRow key={model.model_name}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-blue-600" />
                        <span className="text-gray-900">{model.model_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {model.call_count.toLocaleString()}
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
                      ${model.avg_cost.toFixed(4)}
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
                      { name: 'Claude Opus 4.8' },
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

      {/* Chunk Quality Dashboard */}
      <ChunkQualityDashboard />
    </div>
  );
};

export default AIPerformanceTab;
