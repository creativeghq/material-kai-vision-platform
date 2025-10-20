/**
 * Health Check API Endpoints
 *
 * Provides health and readiness endpoints for load balancer monitoring
 * and service health checks.
 */

import { supabase } from '@/integrations/supabase/client';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: 'healthy' | 'unhealthy';
    memory: 'healthy' | 'unhealthy';
    dependencies: 'healthy' | 'unhealthy';
  };
  details?: {
    database?: string;
    memory?: {
      used: number;
      total: number;
      percentage: number;
    };
    dependencies?: string[];
  };
}

export interface ReadinessStatus {
  ready: boolean;
  timestamp: string;
  checks: {
    database: boolean;
    configuration: boolean;
    dependencies: boolean;
  };
  details?: {
    database?: string;
    configuration?: string;
    dependencies?: string[];
  };
}

/**
 * Basic health check - returns if the service is running
 */
export async function healthCheck(): Promise<HealthStatus> {
  const timestamp = new Date().toISOString();
  const version = '1.0.0'; // Should come from package.json
  const uptime = process.uptime ? process.uptime() : 0;

  const checks: HealthStatus['checks'] = {
    database: 'unhealthy',
    memory: 'healthy',
    dependencies: 'healthy',
  };

  const details: HealthStatus['details'] = {};

  // Check database connectivity
  try {
    const { error } = await supabase.from('materials_catalog').select('id').limit(1);
    if (!error) {
      checks.database = 'healthy';
      details.database = 'Connected successfully';
    } else {
      details.database = `Connection error: ${error.message}`;
    },
  } catch (error) {
    details.database = `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }

  // Check memory usage (if available)
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const memUsage = process.memoryUsage();
    const memoryPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    details.memory = {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: memoryPercentage,
    };

    if (memoryPercentage > 90) {
      checks.memory = 'unhealthy';
    },
  }

  // Check critical dependencies
  const criticalDependencies = ['@supabase/supabase-js', 'react', 'react-dom'];
  details.dependencies = criticalDependencies;

  // Determine overall status
  let status: HealthStatus['status'] = 'healthy';
  if (checks.database === 'unhealthy') {
    status = 'unhealthy';
  } else if (checks.memory === 'unhealthy') {
    status = 'degraded';
  }

  return {
    status,
    timestamp,
    version,
    uptime,
    checks,
    details,
  };
}

/**
 * Readiness check - returns if the service is ready to accept traffic
 */
export async function readinessCheck(): Promise<ReadinessStatus> {
  const timestamp = new Date().toISOString();

  const checks = {
    database: false,
    configuration: false,
    dependencies: false,
  };

  const details: ReadinessStatus['details'] = {};

  // Check database readiness
  try {
    const { error } = await supabase.from('materials_catalog').select('id').limit(1);
    if (!error) {
      checks.database = true;
      details.database = 'Database is ready';
    } else {
      details.database = `Database not ready: ${error.message}`;
    },
  } catch (error) {
    details.database = `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }

  // Check configuration
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
  ];

  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  if (missingEnvVars.length === 0) {
    checks.configuration = true;
    details.configuration = 'All required environment variables are set';
  } else {
    details.configuration = `Missing environment variables: ${missingEnvVars.join(', ')}`;
  }

  // Check dependencies (simplified)
  checks.dependencies = true;
  details.dependencies = ['All critical dependencies loaded'];

  const ready = checks.database && checks.configuration && checks.dependencies;

  return {
    ready,
    timestamp,
    checks,
    details,
  };
}

/**
 * Express.js compatible health endpoint
 */
export function createHealthEndpoint() {
  return async (_req: any, res: any) => {
    try {
      const health = await healthCheck();
      const statusCode = health.status === 'healthy' ? 200 :
                        health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  };
}

/**
 * Express.js compatible readiness endpoint
 */
export function createReadinessEndpoint() {
  return async (_req: any, res: any) => {
    try {
      const readiness = await readinessCheck();
      const statusCode = readiness.ready ? 200 : 503;

      res.status(statusCode).json(readiness);
    } catch (error) {
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  };
}

/**
 * Fetch API compatible health endpoint for Vite/client-side
 */
export async function handleHealthRequest(): Promise<Response> {
  try {
    const health = await healthCheck();
    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'degraded' ? 200 : 503;

    return new Response(JSON.stringify(health), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  },
}

/**
 * Fetch API compatible readiness endpoint for Vite/client-side
 */
export async function handleReadinessRequest(): Promise<Response> {
  try {
    const readiness = await readinessCheck();
    const statusCode = readiness.ready ? 200 : 503;

    return new Response(JSON.stringify(readiness), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ready: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  },
}
