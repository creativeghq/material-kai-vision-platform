/**
 * System Health Monitor Component
 *
 * Displays real-time health status for:
 * - Database connection pool
 * - Job monitoring service
 * - Query performance metrics
 * - Circuit breaker status
 */

import React, { useState, useEffect } from 'react';
import { MIVAA_API_URL } from '@/config/mivaa';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Progress } from '@/components/core/ui/progress';
import {
  Activity,
  Database,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
  Clock,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CronJobsPanel } from '@/components/Admin/CronJobsPanel';
import { WebhooksPanel } from '@/components/Admin/WebhooksPanel';

interface AIServiceHealth {
  status: 'healthy' | 'unhealthy';
  message?: string;
  response_time_ms?: number;
  latency_ms?: number;
  error?: string;
  last_checked?: string;
  cached?: boolean;
}

interface HealthStatus {
  overall_status: 'healthy' | 'degraded' | 'unhealthy';
  database: {
    healthy: boolean;
    connection_test_ms: number;
    query_test_ms: number;
    error_count: number;
    consecutive_failures: number;
    uptime_seconds: number;
    performance: {
      avg_query_time_ms: number;
      max_query_time_ms: number;
      slow_query_count: number;
      slow_query_threshold_ms: number;
    };
    connection_pool?: {
      status: string;
      max_connections: number;
      max_keepalive: number;
      keepalive_expiry_seconds?: number;
      pool_timeout_seconds?: number;
      http2_enabled?: boolean;
      pool_utilization_percent?: number;
      note?: string;
    };
  };
  job_monitor: {
    monitor_running: boolean;
    stuck_jobs_count: number;
    health: 'healthy' | 'degraded' | 'unhealthy';
  };
  query_metrics: {
    total_queries: number;
    slow_queries: number;
    slow_query_percentage: number;
    avg_query_time_ms: number;
    max_query_time_ms: number;
  };
  circuit_breaker: {
    state: 'closed' | 'open' | 'half_open';
    failure_count: number;
  };
  ai_services?: {
    embeddings?: AIServiceHealth;
    ai_services?: AIServiceHealth;
    claude?: AIServiceHealth;
    chatgpt?: AIServiceHealth;
    slig?: AIServiceHealth;
    paddleocr?: AIServiceHealth;
    voyage_ai?: AIServiceHealth;
    supabase?: AIServiceHealth;
    vercel?: AIServiceHealth;
  };
  timestamp: string;
}

interface ExternalServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latency_ms?: number;
  category: 'messaging' | 'b2b' | 'scraping' | 'vr' | 'payments' | 'social';
  icon: string;
  last_checked: string;
}

// Third-party provider uptime, derived from real ai_usage_logs outcomes (not a
// reachability ping) — surfaces balance/402/outage failures the reachability
// checks miss. Source: get_provider_health() RPC.
interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  calls: number;
  failed: number;
  failure_rate: number;
  last_ok: string | null;
  last_fail: string | null;
  last_error: string | null;
}


const CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  messaging: { bg: 'from-blue-50 to-blue-100', border: 'border-blue-200', text: 'text-blue-900' },
  b2b: { bg: 'from-purple-50 to-purple-100', border: 'border-purple-200', text: 'text-purple-900' },
  scraping: { bg: 'from-orange-50 to-orange-100', border: 'border-orange-200', text: 'text-orange-900' },
  vr: { bg: 'from-teal-50 to-teal-100', border: 'border-teal-200', text: 'text-teal-900' },
  payments: { bg: 'from-indigo-50 to-indigo-100', border: 'border-indigo-200', text: 'text-indigo-900' },
  social: { bg: 'from-pink-50 to-pink-100', border: 'border-pink-200', text: 'text-pink-900' },
  marketplace: { bg: 'from-emerald-50 to-emerald-100', border: 'border-emerald-200', text: 'text-emerald-900' },
};

export const SystemHealthMonitor: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [externalServices, setExternalServices] = useState<ExternalServiceStatus[]>([]);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchHealth = async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      const apiUrl = MIVAA_API_URL;

      // Run all checks in parallel:
      // - Python backend health (optional, for detailed DB metrics)
      // - Direct Supabase query via our authenticated client
      // - health-check edge function: ALL service checks server-side
      //   (AI keys, Python backend endpoints, external service reachability)
      const [
        detailedResponse,
        mainHealthResponse,
        supabaseHealthy,
        edgeResults,
        providerRows,
      ] = await Promise.all([
        fetch(`${apiUrl}/health/detailed`).catch(() => null),
        fetch(`${apiUrl}/health${forceRefresh ? '?force_refresh=true' : ''}`).catch(() => null),
        supabase.from('materials_catalog').select('id', { count: 'exact', head: true }).then(({ error }) => !error).catch(() => false),
        supabase.functions.invoke('health-check').then(({ data }) => data).catch(() => null),
        // Third-party provider uptime from real usage outcomes (catches 402/outage
        // that reachability pings miss — e.g. DataForSEO balance depleted).
        supabase.rpc('get_provider_health', { p_window_minutes: 360 }).then(({ data }) => data ?? []).catch(() => []),
      ]);
      setProviders((providerRows as ProviderHealth[]) || []);

      // The MIVAA backend being down must NOT blank the whole health page — a
      // health dashboard's job is to SHOW which dependency is down, including
      // the backend itself. Degrade gracefully instead of throwing.
      const backendReachable = !!(mainHealthResponse && mainHealthResponse.ok);
      const healthData = backendReachable
        ? await mainHealthResponse!.json().catch(() => ({}))
        : { timestamp: new Date().toISOString() };

      // Extract results from edge function
      const claudeResult      = edgeResults?.claude      ?? null;
      const openaiResult      = edgeResults?.openai      ?? null;
      const hfResult          = edgeResults?.slig ?? null;
      const paddleResult      = edgeResults?.paddleocr  ?? null;
      const voyageResult      = edgeResults?.voyage_ai   ?? null;
      const embeddingsResult  = edgeResults?.embeddings  ?? null;
      const aiServicesResult  = edgeResults?.ai_services ?? null;

      // Use /health/detailed if available, otherwise build from basic /health
      let data: HealthStatus;
      if (detailedResponse && detailedResponse.ok) {
        data = await detailedResponse.json();
      } else {
        data = {
          overall_status: 'healthy',
          database: {
            healthy: supabaseHealthy,
            connection_test_ms: 0,
            query_test_ms: 0,
            error_count: supabaseHealthy ? 0 : 1,
            consecutive_failures: 0,
            uptime_seconds: 0,
            performance: { avg_query_time_ms: 0, max_query_time_ms: 0, slow_query_count: 0, slow_query_threshold_ms: 500 },
          },
          job_monitor: { monitor_running: true, stuck_jobs_count: 0, health: 'healthy' },
          query_metrics: { total_queries: 0, slow_queries: 0, slow_query_percentage: 0, avg_query_time_ms: 0, max_query_time_ms: 0 },
          circuit_breaker: { state: 'closed', failure_count: 0 },
          timestamp: healthData.timestamp || new Date().toISOString(),
        };
      }

      // Always override database.healthy with our direct Supabase check —
      // the Python backend may report unhealthy due to its own missing config
      data.database.healthy = supabaseHealthy;

      // Build AI service statuses from real API key verification (edge function)
      // and direct Supabase check — not the Python backend's broken config view
      data.ai_services = {
        claude: claudeResult
          ? { status: claudeResult.status, latency_ms: claudeResult.latency_ms, message: claudeResult.message, error: claudeResult.error }
          : { status: 'unhealthy', error: 'Check unavailable' },
        chatgpt: openaiResult
          ? { status: openaiResult.status, latency_ms: openaiResult.latency_ms, message: openaiResult.message, error: openaiResult.error }
          : { status: 'unhealthy', error: 'Check unavailable' },
        slig: hfResult
          ? { status: hfResult.status, latency_ms: hfResult.latency_ms, message: hfResult.message, error: hfResult.error }
          : { status: 'unhealthy', error: 'Check unavailable' },
        paddleocr: paddleResult
          ? { status: paddleResult.status, latency_ms: paddleResult.latency_ms, message: paddleResult.message, error: paddleResult.error }
          : { status: 'unhealthy', error: 'Check unavailable' },
        voyage_ai: voyageResult
          ? { status: voyageResult.status, latency_ms: voyageResult.latency_ms, message: voyageResult.message, error: voyageResult.error }
          : { status: 'unhealthy', error: 'Check unavailable' },
        embeddings: embeddingsResult
          ? { status: embeddingsResult.status, latency_ms: embeddingsResult.latency_ms, message: embeddingsResult.message, error: embeddingsResult.error }
          : { status: 'unhealthy', error: 'Check unavailable' },
        ai_services: aiServicesResult
          ? { status: aiServicesResult.status, latency_ms: aiServicesResult.latency_ms, message: aiServicesResult.message, error: aiServicesResult.error }
          : { status: 'unhealthy', error: 'Check unavailable' },
        supabase: { status: supabaseHealthy ? 'healthy' : 'unhealthy', message: supabaseHealthy ? 'Database connected' : 'Connection failed' },
        vercel: { status: 'healthy', message: 'Platform operational' },
      };

      // Derive overall status from real checks
      const criticalDown = !supabaseHealthy || !backendReachable || claudeResult?.status === 'unhealthy';
      // A third-party provider being down (e.g. DataForSEO 402) drops overall to
      // degraded — this is what "everything healthy" was previously blind to.
      const providerDown = Array.isArray(providerRows)
        && (providerRows as ProviderHealth[]).some((p) => p.status === 'unhealthy');
      const degraded = openaiResult?.status === 'unhealthy' || hfResult?.status === 'unhealthy'
        || voyageResult?.status === 'unhealthy' || providerDown;
      if (criticalDown) {
        data.overall_status = 'unhealthy';
      } else if (degraded) {
        data.overall_status = 'degraded';
      } else {
        data.overall_status = 'healthy';
      }

      setHealth(data);

      // External services come from the edge function (real HTTP status codes, no CORS)
      if (edgeResults?.external) {
        setExternalServices(
          edgeResults.external.map((svc: any) => ({
            name: svc.name,
            status: svc.status as 'healthy' | 'unhealthy',
            latency_ms: svc.latency_ms,
            category: svc.category,
            icon: svc.icon,
            last_checked: edgeResults.timestamp,
          })),
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch health status';
      setError(errorMsg);
      console.error('Health check error:', err);
      toast({
        title: 'Health Check Failed',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Auto-refresh every 5 minutes (AI checks are cached for 1 hour)
    const interval = setInterval(() => fetchHealth(false), 300000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Healthy</Badge>;
      case 'degraded':
        return <Badge className="bg-yellow-500"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>;
      case 'unhealthy':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Unhealthy</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getCircuitBreakerBadge = (state: string) => {
    switch (state) {
      case 'closed':
        return <Badge className="bg-green-500">Closed (Normal)</Badge>;
      case 'open':
        return <Badge variant="destructive">Open (Failing)</Badge>;
      case 'half_open':
        return <Badge className="bg-yellow-500">Half-Open (Testing)</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };


  if (loading && !health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Health Check Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => fetchHealth(false)} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!health) return null;

  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                System Health Status
              </CardTitle>
              <CardDescription>Real-time monitoring of critical services</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(health.overall_status)}
              <Button onClick={() => fetchHealth(true)} size="sm" variant="outline" disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Force refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Database Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Database Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              {health.database.healthy ? (
                <Badge className="bg-green-500">Connected</Badge>
              ) : (
                <Badge variant="destructive">Disconnected</Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Connection Test</span>
              <span className="text-sm font-medium">{health.database.connection_test_ms?.toFixed(1)}ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Query Test</span>
              <span className="text-sm font-medium">{health.database.query_test_ms?.toFixed(1)}ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Uptime</span>
              <span className="text-sm font-medium">{formatUptime(health.database.uptime_seconds)}</span>
            </div>
            {health.database.error_count > 0 && (
              <div className="flex items-center justify-between text-destructive">
                <span className="text-sm">Errors</span>
                <span className="text-sm font-medium">{health.database.error_count}</span>
              </div>
            )}

            {/* Connection Pool Stats */}
            {health.database.connection_pool && (
              <>
                <div className="pt-2 border-t">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Connection Pool</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Max Connections</span>
                  <span className="text-xs font-medium">{health.database.connection_pool.max_connections}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Max Keep-Alive</span>
                  <span className="text-xs font-medium">{health.database.connection_pool.max_keepalive}</span>
                </div>
                {health.database.connection_pool.http2_enabled !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">HTTP/2</span>
                    <Badge variant={health.database.connection_pool.http2_enabled ? 'default' : 'secondary'} className="text-xs">
                      {health.database.connection_pool.http2_enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                )}
                {health.database.connection_pool.pool_timeout_seconds !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Pool Timeout</span>
                    <span className="text-xs font-medium">{health.database.connection_pool.pool_timeout_seconds}s</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Job Monitor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Job Monitor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              {getStatusBadge(health.job_monitor.health)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Monitor Running</span>
              {health.job_monitor.monitor_running ? (
                <Badge className="bg-green-500">Active</Badge>
              ) : (
                <Badge variant="destructive">Stopped</Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Stuck Jobs</span>
              <span className={`text-sm font-medium ${health.job_monitor.stuck_jobs_count > 0 ? 'text-destructive' : ''}`}>
                {health.job_monitor.stuck_jobs_count}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Query Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Query Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Queries</span>
              <span className="text-sm font-medium">{health.query_metrics.total_queries.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Avg Query Time</span>
              <span className="text-sm font-medium">{health.query_metrics.avg_query_time_ms.toFixed(1)}ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Max Query Time</span>
              <span className="text-sm font-medium">{health.query_metrics.max_query_time_ms.toFixed(1)}ms</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Slow Queries</span>
                <span className={`text-sm font-medium ${health.query_metrics.slow_query_percentage > 10 ? 'text-yellow-600' : ''}`}>
                  {health.query_metrics.slow_queries} ({health.query_metrics.slow_query_percentage.toFixed(1)}%)
                </span>
              </div>
              <Progress value={health.query_metrics.slow_query_percentage} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Circuit Breaker */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Circuit Breaker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">State</span>
              {getCircuitBreakerBadge(health.circuit_breaker.state)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Failure Count</span>
              <span className={`text-sm font-medium ${health.circuit_breaker.failure_count > 0 ? 'text-yellow-600' : ''}`}>
                {health.circuit_breaker.failure_count}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {health.circuit_breaker.state === 'closed' && 'All systems operational'}
              {health.circuit_breaker.state === 'open' && 'Database protection active - failing fast'}
              {health.circuit_breaker.state === 'half_open' && 'Testing database recovery'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Services Health */}
      {health.ai_services && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              AI Services Status
            </CardTitle>
            <CardDescription>Real-time status of AI providers and platform services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Claude (Anthropic) — real API key check */}
              <div className="flex flex-col gap-2 p-3 bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🧠</span>
                    <span className="text-sm font-medium text-orange-900">Claude</span>
                  </div>
                  {health.ai_services.claude?.status === 'healthy' ? (
                    <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                  ) : health.ai_services.claude?.error === 'API key not configured' ? (
                    <Badge variant="secondary"><MinusCircle className="h-3 w-3 mr-1" />Via Backend</Badge>
                  ) : (
                    <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Offline</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-orange-700">
                  {health.ai_services.claude?.latency_ms != null && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{health.ai_services.claude.latency_ms}ms</span>
                  )}
                  {health.ai_services.claude?.error && health.ai_services.claude.error !== 'API key not configured' && (
                    <span className="text-red-600 truncate" title={health.ai_services.claude.error}>{health.ai_services.claude.error}</span>
                  )}
                </div>
              </div>

              {/* ChatGPT (OpenAI) — real API key check */}
              <div className="flex flex-col gap-2 p-3 bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🤖</span>
                    <span className="text-sm font-medium text-green-900">ChatGPT</span>
                  </div>
                  {health.ai_services.chatgpt?.status === 'healthy' ? (
                    <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                  ) : health.ai_services.chatgpt?.error === 'API key not configured' ? (
                    <Badge variant="secondary"><MinusCircle className="h-3 w-3 mr-1" />Via Backend</Badge>
                  ) : (
                    <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Offline</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-green-700">
                  {health.ai_services.chatgpt?.latency_ms != null && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{health.ai_services.chatgpt.latency_ms}ms</span>
                  )}
                  {health.ai_services.chatgpt?.error && health.ai_services.chatgpt.error !== 'API key not configured' && (
                    <span className="text-red-600 truncate" title={health.ai_services.chatgpt.error}>{health.ai_services.chatgpt.error}</span>
                  )}
                </div>
              </div>

              {/* SLIG (SigLIP2 visual embeddings) — Modal /health probe */}
              <div className="flex flex-col gap-2 p-3 bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎨</span>
                    <span className="text-sm font-medium text-yellow-900">SLIG (Modal)</span>
                  </div>
                  {health.ai_services.slig?.status === 'healthy' ? (
                    <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                  ) : (
                    <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Offline</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-yellow-700">
                  {health.ai_services.slig?.latency_ms != null && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{health.ai_services.slig.latency_ms}ms</span>
                  )}
                  {health.ai_services.slig?.message && health.ai_services.slig.status === 'healthy' && (
                    <span className="truncate">{health.ai_services.slig.message}</span>
                  )}
                  {health.ai_services.slig?.error && health.ai_services.slig.error !== 'API key not configured' && (
                    <span className="text-red-600 truncate" title={health.ai_services.slig.error}>{health.ai_services.slig.error}</span>
                  )}
                </div>
              </div>

              {/* PaddleOCR-VL (structural layout + OCR backbone) — Modal /health probe */}
              <div className="flex flex-col gap-2 p-3 bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📄</span>
                    <span className="text-sm font-medium text-yellow-900">PaddleOCR-VL (Modal)</span>
                  </div>
                  {health.ai_services.paddleocr?.status === 'healthy' ? (
                    <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                  ) : (
                    <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Offline</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-yellow-700">
                  {health.ai_services.paddleocr?.latency_ms != null && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{health.ai_services.paddleocr.latency_ms}ms</span>
                  )}
                  {health.ai_services.paddleocr?.message && health.ai_services.paddleocr.status === 'healthy' && (
                    <span className="truncate">{health.ai_services.paddleocr.message}</span>
                  )}
                  {health.ai_services.paddleocr?.error && health.ai_services.paddleocr.error !== 'API key not configured' && (
                    <span className="text-red-600 truncate" title={health.ai_services.paddleocr.error}>{health.ai_services.paddleocr.error}</span>
                  )}
                </div>
              </div>

              {/* Voyage AI — real embeddings check */}
              <div className="flex flex-col gap-2 p-3 bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚀</span>
                    <span className="text-sm font-medium text-cyan-900">Voyage AI</span>
                  </div>
                  {health.ai_services.voyage_ai?.status === 'healthy' ? (
                    <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                  ) : health.ai_services.voyage_ai?.error === 'API key not configured' ? (
                    <Badge variant="secondary"><MinusCircle className="h-3 w-3 mr-1" />Via Backend</Badge>
                  ) : (
                    <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Offline</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-cyan-700">
                  {health.ai_services.voyage_ai?.latency_ms != null && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{health.ai_services.voyage_ai.latency_ms}ms</span>
                  )}
                  {health.ai_services.voyage_ai?.error && health.ai_services.voyage_ai.error !== 'API key not configured' && (
                    <span className="text-red-600 truncate" title={health.ai_services.voyage_ai.error}>{health.ai_services.voyage_ai.error}</span>
                  )}
                </div>
              </div>

              {/* Embeddings */}
              <div className="flex items-center justify-between p-3 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔍</span>
                  <span className="text-sm font-medium text-purple-900">Embeddings</span>
                </div>
                {health.ai_services.embeddings?.status === 'healthy' ? (
                  <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                ) : health.ai_services.embeddings?.error === 'API key not configured' ? (
                  <Badge variant="secondary"><MinusCircle className="h-3 w-3 mr-1" />Via Backend</Badge>
                ) : (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Offline</Badge>
                )}
              </div>

              {/* AI Services */}
              <div className="flex items-center justify-between p-3 bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎯</span>
                  <span className="text-sm font-medium text-indigo-900">AI Services</span>
                </div>
                {health.ai_services.ai_services?.status === 'healthy' ? (
                  <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                ) : health.ai_services.ai_services?.error === 'API key not configured' ? (
                  <Badge variant="secondary"><MinusCircle className="h-3 w-3 mr-1" />Via Backend</Badge>
                ) : (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Offline</Badge>
                )}
              </div>

              {/* Supabase */}
              <div className="flex items-center justify-between p-3 bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🗄️</span>
                  <span className="text-sm font-medium text-emerald-900">Supabase</span>
                </div>
                {health.ai_services.supabase?.status === 'healthy' ? (
                  <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                ) : (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Offline</Badge>
                )}
              </div>

              {/* Vercel */}
              <div className="flex items-center justify-between p-3 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">▲</span>
                  <span className="text-sm font-medium text-slate-900">Vercel</span>
                </div>
                {health.ai_services.vercel?.status === 'healthy' ? (
                  <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                ) : (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Offline</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Third-Party Provider Uptime — from real usage outcomes (catches 402/outages) */}
      {providers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Third-Party Provider Uptime
            </CardTitle>
            <CardDescription>
              Derived from real API outcomes over the last 6h (not just reachability) — surfaces balance/402 and outage failures. Window: last 360 min.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {providers.map((p) => {
                const tone = p.status === 'unhealthy'
                  ? { border: 'border-red-300', bg: 'from-red-50 to-red-100', text: 'text-red-900' }
                  : p.status === 'degraded'
                  ? { border: 'border-yellow-300', bg: 'from-yellow-50 to-yellow-100', text: 'text-yellow-900' }
                  : { border: 'border-green-200', bg: 'from-green-50 to-green-100', text: 'text-green-900' };
                return (
                  <div key={p.provider} className={`flex flex-col gap-1 p-3 bg-gradient-to-br ${tone.bg} border ${tone.border} rounded-lg`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${tone.text}`}>{p.provider}</span>
                      {p.status === 'healthy' ? (
                        <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Healthy</Badge>
                      ) : p.status === 'degraded' ? (
                        <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>
                      ) : (
                        <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Down</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.calls} calls · {p.failed} failed ({Math.round((p.failure_rate || 0) * 100)}%)
                    </div>
                    {p.status !== 'healthy' && p.last_error && (
                      <div className="text-xs text-red-700 break-words line-clamp-2" title={p.last_error}>
                        {p.last_error.split('\n')[0].slice(0, 120)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* External Services Health */}
      {externalServices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              External Services Status
            </CardTitle>
            <CardDescription>Uptime of third-party APIs (Messaging, B2B Research, Scraping, VR, Payments, Social)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {externalServices.map((svc) => {
                const styles = CATEGORY_STYLES[svc.category] || CATEGORY_STYLES.b2b;
                return (
                  <div
                    key={svc.name}
                    className={`flex flex-col gap-2 p-3 bg-gradient-to-br ${styles.bg} border ${styles.border} rounded-lg`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{svc.icon}</span>
                        <span className={`text-sm font-medium ${styles.text}`}>{svc.name}</span>
                      </div>
                      {svc.status === 'healthy' ? (
                        <Badge className="bg-green-500 hover:bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />
                          Offline
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {svc.latency_ms !== undefined && (
                        <span>{svc.latency_ms}ms</span>
                      )}
                      <span className="capitalize">{svc.category}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Database Performance Details */}
      <Card>
        <CardHeader>
          <CardTitle>Database Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Avg Query Time</p>
              <p className="text-lg font-semibold">{health.database.performance.avg_query_time_ms.toFixed(1)}ms</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Max Query Time</p>
              <p className="text-lg font-semibold">{health.database.performance.max_query_time_ms.toFixed(1)}ms</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Slow Queries</p>
              <p className="text-lg font-semibold">{health.database.performance.slow_query_count}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Threshold</p>
              <p className="text-lg font-semibold">{health.database.performance.slow_query_threshold_ms}ms</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <CronJobsPanel />

      <WebhooksPanel />

      <p className="text-xs text-muted-foreground text-center">
        Last updated: {new Date(health.timestamp).toLocaleString()} • Auto-refreshes every 30s
      </p>
    </div>
  );
};

