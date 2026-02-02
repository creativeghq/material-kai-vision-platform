import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';

interface PriceMonitoringRequest {
  action: 'start_monitoring' | 'stop_monitoring' | 'check_now' | 'get_status';
  productId: string;
  monitoringSettings?: {
    frequency?: 'hourly' | 'daily' | 'weekly' | 'on_demand';
    enabled?: boolean;
  };
}

interface CompetitorSource {
  id: string;
  source_name: string;
  source_url: string;
  scraping_config: Record<string, any>;
  is_active: boolean;
}

/**
 * Price Monitoring API
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
Deno.serve(async (req) => {
  console.log(`Price monitoring function called - Method: ${req.method}`);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      throw new Error(auth.error || 'Authentication failed');
    }

    const user = auth.user;
    const userId = auth.userId;

    // Parse request body
    const body: PriceMonitoringRequest = await req.json();
    const { action, productId, monitoringSettings } = body;

    console.log(`Action: ${action}, Product ID: ${productId}`);

    // Route to appropriate handler
    switch (action) {
      case 'start_monitoring':
        return await startMonitoring(supabase, userId, productId, monitoringSettings);
      
      case 'stop_monitoring':
        return await stopMonitoring(supabase, userId, productId);
      
      case 'check_now':
        return await checkNow(supabase, userId, productId);
      
      case 'get_status':
        return await getStatus(supabase, userId, productId);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Error in price-monitoring:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error occurred',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================================
// START MONITORING
// ============================================================================
async function startMonitoring(
  supabase: any,
  userId: string,
  productId: string,
  settings?: any
) {
  const frequency = settings?.frequency || 'weekly';
  const enabled = settings?.enabled !== false;

  // Get user's workspace
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .single();

  if (!profile?.workspace_id) {
    throw new Error('User workspace not found');
  }

  // Calculate next check time
  let nextCheckAt = null;
  if (frequency !== 'on_demand') {
    const intervals = {
      hourly: 1 * 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
    };
    nextCheckAt = new Date(Date.now() + intervals[frequency]).toISOString();
  }

  // Insert or update monitoring record
  const { data, error } = await supabase
    .from('price_monitoring_products')
    .upsert({
      product_id: productId,
      user_id: userId,
      workspace_id: profile.workspace_id,
      monitoring_enabled: enabled,
      monitoring_frequency: frequency,
      next_check_at: nextCheckAt,
      status: 'active',
    }, {
      onConflict: 'product_id,user_id',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to start monitoring: ${error.message}`);
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Price monitoring started',
    monitoring: data,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// STOP MONITORING
// ============================================================================
async function stopMonitoring(supabase: any, userId: string, productId: string) {
  const { error } = await supabase
    .from('price_monitoring_products')
    .update({
      monitoring_enabled: false,
      status: 'paused',
    })
    .eq('product_id', productId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to stop monitoring: ${error.message}`);
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Price monitoring stopped',
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// CHECK NOW (On-Demand Price Check)
// ============================================================================
async function checkNow(supabase: any, userId: string, productId: string) {
  // Create a job record
  const { data: job, error: jobError } = await supabase
    .from('price_monitoring_jobs')
    .insert({
      product_id: productId,
      user_id: userId,
      job_type: 'on_demand',
      status: 'pending',
    })
    .select()
    .single();

  if (jobError) {
    throw new Error(`Failed to create monitoring job: ${jobError.message}`);
  }

  // Get competitor sources for this product
  const { data: sources, error: sourcesError } = await supabase
    .from('competitor_sources')
    .select('*')
    .eq('product_id', productId)
    .eq('is_active', true);

  if (sourcesError) {
    throw new Error(`Failed to fetch competitor sources: ${sourcesError.message}`);
  }

  if (!sources || sources.length === 0) {
    // Update job as completed with no sources
    await supabase
      .from('price_monitoring_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: 'No active competitor sources configured',
      })
      .eq('id', job.id);

    return new Response(JSON.stringify({
      success: false,
      message: 'No competitor sources configured for this product',
      jobId: job.id,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update job to running
  await supabase
    .from('price_monitoring_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  // Scrape prices from all sources
  const results = await scrapeCompetitorPrices(supabase, productId, sources, job.id);

  // Update job with results
  await supabase
    .from('price_monitoring_jobs')
    .update({
      status: results.success ? 'completed' : 'failed',
      completed_at: new Date().toISOString(),
      sources_checked: results.sourcesChecked,
      prices_found: results.pricesFound,
      credits_consumed: results.creditsConsumed,
      error_message: results.error,
    })
    .eq('id', job.id);

  return new Response(JSON.stringify({
    success: results.success,
    message: results.success ? 'Price check completed' : 'Price check failed',
    jobId: job.id,
    results: {
      sourcesChecked: results.sourcesChecked,
      pricesFound: results.pricesFound,
      creditsConsumed: results.creditsConsumed,
    },
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// GET STATUS
// ============================================================================
async function getStatus(supabase: any, userId: string, productId: string) {
  // Get monitoring configuration
  const { data: monitoring } = await supabase
    .from('price_monitoring_products')
    .select('*')
    .eq('product_id', productId)
    .eq('user_id', userId)
    .single();

  // Get latest prices
  const { data: latestPrices } = await supabase
    .from('price_history')
    .select('*')
    .eq('product_id', productId)
    .order('scraped_at', { ascending: false })
    .limit(10);

  // Get recent jobs
  const { data: recentJobs } = await supabase
    .from('price_monitoring_jobs')
    .select('*')
    .eq('product_id', productId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Get competitor sources
  const { data: sources } = await supabase
    .from('competitor_sources')
    .select('*')
    .eq('product_id', productId);

  return new Response(JSON.stringify({
    success: true,
    monitoring,
    latestPrices,
    recentJobs,
    sources,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// SCRAPE COMPETITOR PRICES
// ============================================================================
async function scrapeCompetitorPrices(
  supabase: any,
  productId: string,
  sources: CompetitorSource[],
  jobId: string
) {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!firecrawlApiKey) {
    return {
      success: false,
      error: 'Firecrawl API key not configured',
      sourcesChecked: 0,
      pricesFound: 0,
      creditsConsumed: 0,
    };
  }

  let sourcesChecked = 0;
  let pricesFound = 0;
  let creditsConsumed = 0;

  for (const source of sources) {
    try {
      sourcesChecked++;

      // Build Firecrawl request
      const requestBody = {
        url: source.source_url,
        formats: ['markdown'],
        timeout: 30000,
        ...source.scraping_config,
      };

      // Make Firecrawl API call
      const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        console.error(`Firecrawl error for ${source.source_name}:`, await response.text());
        continue;
      }

      const result = await response.json();

      if (result.success && result.data?.extract) {
        const extractedData = result.data.extract;

        // Extract price from the data
        const price = extractPrice(extractedData);
        const availability = extractAvailability(extractedData);

        if (price) {
          // Save to price_history
          await supabase
            .from('price_history')
            .insert({
              product_id: productId,
              source_name: source.source_name,
              source_url: source.source_url,
              price: price,
              currency: 'USD',
              availability: availability,
              metadata: extractedData,
            });

          pricesFound++;

          // Update source success
          await supabase
            .from('competitor_sources')
            .update({
              last_successful_scrape: new Date().toISOString(),
              error_count: 0,
              last_error: null,
            })
            .eq('id', source.id);
        }
      }

      // Estimate credits consumed (Firecrawl pricing)
      creditsConsumed += 1; // 1 credit per scrape

    } catch (error) {
      console.error(`Error scraping ${source.source_name}:`, error);

      // Update source error count
      await supabase
        .from('competitor_sources')
        .update({
          error_count: source.error_count + 1,
          last_error: error.message,
        })
        .eq('id', source.id);
    }
  }

  return {
    success: pricesFound > 0,
    sourcesChecked,
    pricesFound,
    creditsConsumed,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function extractPrice(data: any): number | null {
  // Try to extract price from various possible fields
  if (data.price) {
    const priceStr = String(data.price).replace(/[^0-9.]/g, '');
    const price = parseFloat(priceStr);
    return isNaN(price) ? null : price;
  }
  return null;
}

function extractAvailability(data: any): string {
  if (data.availability) {
    const avail = String(data.availability).toLowerCase();
    if (avail.includes('in stock') || avail.includes('available')) return 'in_stock';
    if (avail.includes('out of stock') || avail.includes('unavailable')) return 'out_of_stock';
    if (avail.includes('limited')) return 'limited';
  }
  return 'unknown';
}

