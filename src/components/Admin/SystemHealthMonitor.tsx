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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Clock,
  Zap,
  TrendingUp
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AIServiceHealth {
  status: 'healthy' | 'unhealthy';
  message?: string;
  response_time_ms?: number;
  error?: string;
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
    together_ai?: AIServiceHealth;
    embeddings?: AIServiceHealth;
    ai_services?: AIServiceHealth;
  };
  timestamp: string;
}

export const SystemHealthMonitor: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchHealth = async () => {
    try {
      setLoading(true);
      setError(null);

      const apiUrl = import.meta.env.VITE_MIVAA_API_URL || 'https://v1api.materialshub.gr';

      // Fetch main health status
      const response = await fetch(`${apiUrl}/health/detailed`);

      if (!response.ok) {
        // Try to get error details from response
        let errorDetail = response.statusText;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorDetail;
        } catch {
          // If JSON parsing fails, use statusText
        }
        throw new Error(`Health check failed (${response.status}): ${errorDetail}`);
      }

      const data = await response.json();

      // Fetch AI services health in parallel
      const aiServicesPromises = [
        fetch(`${apiUrl}/api/health`).then(r => r.ok ? r.json() : null).catch(() => null), // TogetherAI
        fetch(`${apiUrl}/api/embeddings/health`).then(r => r.ok ? r.json() : null).catch(() => null), // Embeddings
        fetch(`${apiUrl}/api/v1/ai-services/health`).then(r => r.ok ? r.json() : null).catch(() => null), // AI Services
      ];

      const [togetherAI, embeddings, aiServices] = await Promise.all(aiServicesPromises);

      // Add AI services to health data
      data.ai_services = {
        together_ai: togetherAI ? { status: 'healthy', message: togetherAI.message } : { status: 'unhealthy', error: 'Service unavailable' },
        embeddings: embeddings ? { status: 'healthy', message: embeddings.message } : { status: 'unhealthy', error: 'Service unavailable' },
        ai_services: aiServices ? { status: 'healthy' } : { status: 'unhealthy', error: 'Service unavailable' },
      };

      setHealth(data);
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
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
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
            <Activity className="h-5 w-5" />
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
            <AlertTriangle className="h-5 w-5" />
            Health Check Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={fetchHealth} size="sm">
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
                <Activity className="h-5 w-5" />
                System Health Status
              </CardTitle>
              <CardDescription>Real-time monitoring of critical services</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(health.overall_status)}
              <Button onClick={fetchHealth} size="sm" variant="outline">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Database Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
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
          </CardContent>
        </Card>

        {/* Job Monitor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
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
            <CardTitle className="flex items-center gap-2 text-sm">
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
            <CardTitle className="flex items-center gap-2 text-sm">
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
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4" />
              AI Services Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">TogetherAI</span>
                {health.ai_services.together_ai?.status === 'healthy' ? (
                  <Badge className="bg-green-500">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Healthy
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Unavailable
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">Embeddings</span>
                {health.ai_services.embeddings?.status === 'healthy' ? (
                  <Badge className="bg-green-500">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Healthy
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Unavailable
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">AI Services</span>
                {health.ai_services.ai_services?.status === 'healthy' ? (
                  <Badge className="bg-green-500">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Healthy
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Unavailable
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Database Performance Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Database Performance Metrics</CardTitle>
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

      <p className="text-xs text-muted-foreground text-center">
        Last updated: {new Date(health.timestamp).toLocaleString()} • Auto-refreshes every 30s
      </p>
    </div>
  );
};

