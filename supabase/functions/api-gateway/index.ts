import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface ApiEndpoint {
  id: string;
  path: string;
  method: string;
  is_public: boolean;
  is_internal: boolean;
  rate_limit_per_minute: number;
}

interface ApiUsageLog {
  endpoint_id?: string;
  user_id?: string;
  ip_address: string;
  user_agent?: string;
  request_method: string;
  request_path: string;
  response_status?: number;
  response_time_ms?: number;
  is_internal_request: boolean;
  rate_limit_exceeded: boolean;
}

// In-memory rate limiting store (for this function instance)
const rateLimitStore = new Map<string, RateLimitEntry>();

serve(async (req) => {
  const startTime = Date.now();
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract request information
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname;
    const clientIP = getClientIP(req);
    const userAgent = req.headers.get('user-agent') || undefined;
    const apiKey = req.headers.get('x-api-key');
    const authHeader = req.headers.get('authorization');
    
    console.log(`API Gateway: ${method} ${path} from ${clientIP}`);

    // Check if IP is internal
    const { data: isInternalData, error: internalError } = await supabase
      .rpc('is_internal_ip', { ip_addr: clientIP });
    
    if (internalError) {
      console.error('Error checking internal IP:', internalError);
    }
    
    const isInternal = isInternalData || false;

    // Get endpoint configuration
    const { data: endpoints, error: endpointError } = await supabase
      .from('api_endpoints')
      .select('*')
      .eq('path', path)
      .eq('method', method)
      .limit(1);

    if (endpointError) {
      console.error('Error fetching endpoint config:', endpointError);
      return createErrorResponse('Internal server error', 500, startTime, {
        endpoint_id: undefined,
        user_id: undefined,
        ip_address: clientIP,
        user_agent: userAgent,
        request_method: method,
        request_path: path,
        response_status: 500,
        is_internal_request: isInternal,
        rate_limit_exceeded: false,
      }, supabase);
    }

    const endpoint = endpoints?.[0] as ApiEndpoint | undefined;

    // If endpoint is not registered, check if it's a system endpoint
    if (!endpoint) {
      // Allow system endpoints to pass through
      if (isSystemEndpoint(path)) {
        return await forwardRequest(req, supabase, {
          endpoint_id: undefined,
          user_id: undefined,
          ip_address: clientIP,
          user_agent: userAgent,
          request_method: method,
          request_path: path,
          is_internal_request: isInternal,
          rate_limit_exceeded: false,
        }, startTime);
      }

      return createErrorResponse('Endpoint not found', 404, startTime, {
        endpoint_id: undefined,
        user_id: undefined,
        ip_address: clientIP,
        user_agent: userAgent,
        request_method: method,
        request_path: path,
        response_status: 404,
        is_internal_request: isInternal,
        rate_limit_exceeded: false,
      }, supabase);
    }

    // Check access permissions
    const hasAccess = checkEndpointAccess(endpoint, isInternal, apiKey, authHeader);
    if (!hasAccess.allowed) {
      return createErrorResponse(hasAccess.reason || 'Access denied', 403, startTime, {
        endpoint_id: endpoint.id,
        user_id: undefined,
        ip_address: clientIP,
        user_agent: userAgent,
        request_method: method,
        request_path: path,
        response_status: 403,
        is_internal_request: isInternal,
        rate_limit_exceeded: false,
      }, supabase);
    }

    // Get user ID if authenticated
    let userId: string | undefined;
    if (authHeader) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        userId = user?.id;
      } catch (error) {
        // Ignore auth errors for now
      }
    }

    // Check rate limiting
    const rateLimitKey = getRateLimitKey(clientIP, userId, apiKey);
    const rateLimit = await getRateLimit(supabase, path, clientIP, userId);
    const rateLimitResult = checkRateLimit(rateLimitKey, rateLimit);

    if (!rateLimitResult.allowed) {
      return createErrorResponse('Rate limit exceeded', 429, startTime, {
        endpoint_id: endpoint.id,
        user_id: userId,
        ip_address: clientIP,
        user_agent: userAgent,
        request_method: method,
        request_path: path,
        response_status: 429,
        is_internal_request: isInternal,
        rate_limit_exceeded: true,
      }, supabase, rateLimitResult.retryAfter);
    }

    // Update rate limit counter
    updateRateLimit(rateLimitKey, rateLimit);

    // Forward the request
    return await forwardRequest(req, supabase, {
      endpoint_id: endpoint.id,
      user_id: userId,
      ip_address: clientIP,
      user_agent: userAgent,
      request_method: method,
      request_path: path,
      is_internal_request: isInternal,
      rate_limit_exceeded: false,
    }, startTime);

  } catch (error) {
    console.error('API Gateway error:', error);
    return createErrorResponse('Internal server error', 500, startTime, {
      endpoint_id: undefined,
      user_id: undefined,
      ip_address: getClientIP(req),
      user_agent: req.headers.get('user-agent') || undefined,
      request_method: req.method,
      request_path: new URL(req.url).pathname,
      response_status: 500,
      is_internal_request: false,
      rate_limit_exceeded: false,
    });
  }
});

function getClientIP(req: Request): string {
  // Check various headers for the real client IP
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = req.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  // Fallback to a default IP
  return '127.0.0.1';
}

function isSystemEndpoint(path: string): boolean {
  // Define system endpoints that should always be accessible
  const systemPaths = [
    '/api/auth/',
    '/api/health',
    '/api/status',
    '/_internal/',
  ];
  
  return systemPaths.some(systemPath => path.startsWith(systemPath));
}

function checkEndpointAccess(
  endpoint: ApiEndpoint, 
  isInternal: boolean, 
  apiKey?: string | null, 
  authHeader?: string | null
): { allowed: boolean; reason?: string } {
  // If endpoint is public, allow access
  if (endpoint.is_public) {
    return { allowed: true };
  }

  // If endpoint is internal-only and request is from internal network
  if (endpoint.is_internal && isInternal) {
    return { allowed: true };
  }

  // If endpoint requires authentication and user is authenticated
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return { allowed: true };
  }

  // If endpoint allows API key access and valid API key is provided
  if (apiKey && apiKey.startsWith('kai_')) {
    // TODO: Validate API key against database
    return { allowed: true };
  }

  return { 
    allowed: false, 
    reason: 'This endpoint requires internal network access, authentication, or a valid API key' 
  };
}

function getRateLimitKey(clientIP: string, userId?: string, apiKey?: string | null): string {
  if (userId) {
    return `user:${userId}`;
  }
  if (apiKey) {
    return `api_key:${apiKey}`;
  }
  return `ip:${clientIP}`;
}

async function getRateLimit(
  supabase: any, 
  path: string, 
  clientIP: string, 
  userId?: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .rpc('get_rate_limit', { 
        endpoint_path: path, 
        ip_addr: clientIP,
        user_id_param: userId 
      });

    if (error) {
      console.error('Error getting rate limit:', error);
      return 30; // Default fallback
    }

    return data || 30;
  } catch (error) {
    console.error('Error getting rate limit:', error);
    return 30; // Default fallback
  }
}

function checkRateLimit(key: string, limit: number): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000; // Start of current minute
  const windowEnd = windowStart + 60000; // End of current minute

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime !== windowEnd) {
    // New window or first request
    return { allowed: true };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((windowEnd - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

function updateRateLimit(key: string, limit: number): void {
  const now = Date.now();
  const windowEnd = Math.floor(now / 60000) * 60000 + 60000;

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime !== windowEnd) {
    rateLimitStore.set(key, { count: 1, resetTime: windowEnd });
  } else {
    entry.count++;
  }

  // Clean up old entries periodically
  if (Math.random() < 0.01) { // 1% chance to clean up
    const cutoff = now - 120000; // 2 minutes ago
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime < cutoff) {
        rateLimitStore.delete(k);
      }
    }
  }
}

async function forwardRequest(
  req: Request, 
  supabase: any, 
  logData: Omit<ApiUsageLog, 'response_status' | 'response_time_ms'>,
  startTime: number
): Promise<Response> {
  try {
    // For now, we'll just return a success response
    // In a real implementation, you would forward to the actual API endpoints
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Log the successful request
    await logApiUsage(supabase, {
      ...logData,
      response_status: 200,
      response_time_ms: responseTime,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'API Gateway - Request processed successfully',
        path: logData.request_path,
        method: logData.request_method,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error forwarding request:', error);
    return createErrorResponse('Error processing request', 500, startTime, {
      ...logData,
      response_status: 500,
    }, supabase);
  }
}

function createErrorResponse(
  message: string, 
  status: number, 
  startTime: number,
  logData: Omit<ApiUsageLog, 'response_time_ms'>,
  supabase?: any,
  retryAfter?: number
): Response {
  const endTime = Date.now();
  const responseTime = endTime - startTime;

  // Log the error
  if (supabase) {
    logApiUsage(supabase, {
      ...logData,
      response_time_ms: responseTime,
    }).catch(console.error);
  }

  const headers: HeadersInit = { 
    ...corsHeaders, 
    'Content-Type': 'application/json' 
  };

  if (retryAfter) {
    headers['Retry-After'] = retryAfter.toString();
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      statusCode: status,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers,
    }
  );
}

async function logApiUsage(supabase: any, logData: ApiUsageLog): Promise<void> {
  try {
    const { error } = await supabase
      .from('api_usage_logs')
      .insert(logData);

    if (error) {
      console.error('Error logging API usage:', error);
    }
  } catch (error) {
    console.error('Error logging API usage:', error);
  }
}