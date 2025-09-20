import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    mivaa: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    supabase: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    integration: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      configLoaded: boolean;
      error?: string;
    };
  };
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
  };
}

serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow GET requests for health checks
    if (req.method !== 'GET') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Method not allowed',
          statusCode: 405,
        }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('PDF Integration Health Check - Starting health assessment');

    // Check Supabase connectivity
    const supabaseHealth = await checkSupabaseHealth(supabase);

    // Check Mivaa service connectivity
    const mivaaHealth = await checkMivaaHealth();

    // Check integration service configuration
    const integrationHealth = await checkIntegrationHealth();

    // Get metrics from database
    const metrics = await getHealthMetrics(supabase);

    // Determine overall health status
    const overallStatus = determineOverallHealth([
      supabaseHealth.status,
      mivaaHealth.status,
      integrationHealth.status,
    ]);

    const healthResponse: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        mivaa: mivaaHealth,
        supabase: supabaseHealth,
        integration: integrationHealth,
      },
      metrics,
    };

    const responseTime = Date.now() - startTime;
    console.log(`Health check completed in ${responseTime}ms - Status: ${overallStatus}`);

    // Log health check to database
    await logHealthCheck(supabase, healthResponse, responseTime);

    return new Response(
      JSON.stringify({
        success: true,
        data: healthResponse,
        responseTime,
      }),
      {
        status: overallStatus === 'unhealthy' ? 503 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Health check error:', error);

    const errorResponse = {
      status: 'unhealthy' as const,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        mivaa: { status: 'unhealthy' as const, error: 'Health check failed' },
        supabase: { status: 'unhealthy' as const, error: 'Health check failed' },
        integration: { status: 'unhealthy' as const, configLoaded: false, error: 'Health check failed' },
      },
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
      },
    };

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Health check failed',
        data: errorResponse,
        statusCode: 500,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

async function checkSupabaseHealth(supabase: any): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Test database connectivity with a simple query
    const { data, error } = await supabase
      .from('pdf_processing_results')
      .select('id')
      .limit(1);

    const responseTime = Date.now() - startTime;

    if (error) {
      console.error('Supabase health check error:', error);
      return {
        status: 'unhealthy',
        responseTime,
        error: error.message,
      };
    }

    // Check response time for degraded performance
    const status = responseTime > 2000 ? 'degraded' : 'healthy';

    return {
      status,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('Supabase health check exception:', error);

    return {
      status: 'unhealthy',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkMivaaHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const mivaaBaseUrl = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://localhost:8000';
    const healthUrl = `${mivaaBaseUrl}/health`;

    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Check response time for degraded performance
    const status = responseTime > 3000 ? 'degraded' : 'healthy';

    return {
      status,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('Mivaa health check error:', error);

    return {
      status: 'unhealthy',
      responseTime,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

async function checkIntegrationHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  configLoaded: boolean;
  error?: string;
}> {
  try {
    // Check required environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'MIVAA_GATEWAY_URL',
    ];

    const missingVars = requiredEnvVars.filter(varName => !Deno.env.get(varName));

    if (missingVars.length > 0) {
      return {
        status: 'unhealthy',
        configLoaded: false,
        error: `Missing environment variables: ${missingVars.join(', ')}`,
      };
    }

    // Check optional configuration
    const optionalVars = [
      'MIVAA_API_KEY',
      'PDF_PROCESSING_TIMEOUT',
      'MAX_FILE_SIZE_MB',
    ];

    const missingOptionalVars = optionalVars.filter(varName => !Deno.env.get(varName));

    if (missingOptionalVars.length > 0) {
      console.warn(`Optional environment variables not set: ${missingOptionalVars.join(', ')}`);
      return {
        status: 'degraded',
        configLoaded: true,
        error: `Optional config missing: ${missingOptionalVars.join(', ')}`,
      };
    }

    return {
      status: 'healthy',
      configLoaded: true,
    };
  } catch (error) {
    console.error('Integration health check error:', error);

    return {
      status: 'unhealthy',
      configLoaded: false,
      error: error instanceof Error ? error.message : 'Configuration check failed',
    };
  }
}

async function getHealthMetrics(supabase: any): Promise<{
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
}> {
  try {
    // Get metrics from the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('api_usage_logs')
      .select('response_status, response_time_ms')
      .gte('created_at', twentyFourHoursAgo)
      .like('request_path', '%pdf%');

    if (error || !data) {
      console.error('Error fetching health metrics:', error);
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
      };
    }

    const totalRequests = data.length;
    const successfulRequests = data.filter(log => log.response_status >= 200 && log.response_status < 400).length;
    const failedRequests = totalRequests - successfulRequests;

    const totalResponseTime = data.reduce((sum, log) => sum + (log.response_time_ms || 0), 0);
    const averageResponseTime = totalRequests > 0 ? Math.round(totalResponseTime / totalRequests) : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
    };
  } catch (error) {
    console.error('Error calculating health metrics:', error);
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
    };
  }
}

function determineOverallHealth(statuses: Array<'healthy' | 'degraded' | 'unhealthy'>): 'healthy' | 'degraded' | 'unhealthy' {
  if (statuses.includes('unhealthy')) {
    return 'unhealthy';
  }
  if (statuses.includes('degraded')) {
    return 'degraded';
  }
  return 'healthy';
}

async function logHealthCheck(
  supabase: any,
  healthResponse: HealthCheckResponse,
  responseTime: number,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('api_usage_logs')
      .insert({
        endpoint_id: null,
        user_id: null,
        ip_address: '127.0.0.1',
        user_agent: 'PDF Integration Health Check',
        request_method: 'GET',
        request_path: '/pdf-integration-health',
        response_status: healthResponse.status === 'unhealthy' ? 503 : 200,
        response_time_ms: responseTime,
        is_internal_request: true,
        rate_limit_exceeded: false,
      });

    if (error) {
      console.error('Error logging health check:', error);
    }
  } catch (error) {
    console.error('Error logging health check:', error);
  }
}
