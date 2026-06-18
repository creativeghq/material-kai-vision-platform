import { createClient } from '@supabase/supabase-js';
import { captureException } from '../_shared/sentry.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';

interface SessionManagerRequest {
  sessionId: string;
  action: 'start' | 'pause' | 'resume' | 'stop';
}

/**
 * SSRF guard. Returns true only for public http(s) URLs. Rejects non-http
 * schemes and private / loopback / link-local / unspecified hosts so a
 * user-supplied source_url can't reach internal services or cloud metadata.
 */
function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;

  // IPv6 loopback / unspecified / link-local / unique-local
  if (host === '::1' || host === '::' || host.startsWith('fe80:') ||
      host.startsWith('fc') || host.startsWith('fd')) return false;

  // IPv4 private / loopback / link-local / metadata ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return false;                          // 10.0.0.0/8
    if (a === 127) return false;                         // loopback
    if (a === 0) return false;                           // 0.0.0.0/8
    if (a === 169 && b === 254) return false;            // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return false;   // 172.16.0.0/12
    if (a === 192 && b === 168) return false;            // 192.168.0.0/16
  }
  return true;
}

/**
 * Scrape Session Manager
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
Deno.serve(withApiLogging('scrape-session-manager', async (req) => {
  console.log(`Session manager called - Method: ${req.method}`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: 'Method not allowed. Use POST.',
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    let parsed: SessionManagerRequest;
    try {
      parsed = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }
    const { sessionId, action } = parsed;

    console.log(`Session manager: ${action} for session ${sessionId}`);

    if (!sessionId || !action) {
      throw new HttpError(400, 'Missing required parameters: sessionId, action');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      throw new HttpError(401, auth.error || 'Authentication failed');
    }

    const user = auth.user;
    const userId = auth.userId;

    // Verify the caller owns this scraping session
    if (userId && sessionId) {
      const { data: session } = await supabase
        .from('scraping_sessions')
        .select('user_id, workspace_id')
        .eq('id', sessionId)
        .maybeSingle();
      if (session && session.user_id && session.user_id !== userId) {
        throw new HttpError(403, 'Not authorized to manage this scraping session');
      }
    }

    switch (action) {
      case 'start':
      case 'resume':
        await startProcessing(supabase, sessionId, req);
        break;
      case 'pause':
        await pauseProcessing(supabase, sessionId);
        break;
      case 'stop':
        await stopProcessing(supabase, sessionId);
        break;
      default:
        throw new HttpError(400, `Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({
      success: true,
      action,
      sessionId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Client errors (bad input / auth / not-authorized) carry their own status and
    // skip Sentry via the wrapper. Let them propagate.
    if (error instanceof HttpError) throw error;
    console.error('Error in session manager:', error);
    // Top-level capture is handled by withApiLogging (returns 5xx → Sentry).
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));

/**
 * Launch a Firecrawl /v1/crawl job for the session's source URL.
 * Returns the Firecrawl crawl_id on success, or null if unavailable.
 */
async function launchFirecrawlCrawl(
  supabase: any,
  sessionId: string,
  session: any,
): Promise<string | null> {
  const FIRECRAWL_API_KEY = () => Deno.env.get('FIRECRAWL_API_KEY') || '';
  if (!FIRECRAWL_API_KEY()) {
    console.warn('[scrape-session-manager] FIRECRAWL_API_KEY not set — falling back to page-by-page');
    return null;
  }

  const sourceUrl = session.source_url || session.scraping_config?.url;
  if (!sourceUrl) {
    console.warn('[scrape-session-manager] No source URL on session — falling back to page-by-page');
    return null;
  }

  // SSRF guard: only crawl public http(s) URLs. Reject non-http schemes and
  // private/loopback/link-local hosts so a user-supplied source_url can't be
  // pointed at internal services or cloud metadata endpoints (169.254.169.254).
  if (!isPublicHttpUrl(sourceUrl)) {
    throw new Error(`Refusing to crawl non-public or invalid source URL: ${sourceUrl}`);
  }

  const config = session.scraping_config || {};
  // Clamp max_pages to a sane server-side ceiling regardless of client input.
  const maxPages = Math.min(Math.max(1, Number(config.max_pages) || 100), 500);

  // Webhook URL Firecrawl will call when done — append secret so the webhook handler can verify
  const firecrawlWebhookSecret = Deno.env.get('FIRECRAWL_WEBHOOK_SECRET') || '';
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/firecrawl-webhook?session_id=${sessionId}${firecrawlWebhookSecret ? `&webhook_secret=${firecrawlWebhookSecret}` : ''}`;

  const body: Record<string, unknown> = {
    url:           sourceUrl,
    maxDepth:      config.max_depth ?? 3,
    limit:         maxPages,
    webhook:       webhookUrl,
    scrapeOptions: {
      formats:         ['markdown', 'extract'],
      onlyMainContent: true,
      extract: {
        schema: {
          type: 'object',
          properties: {
            products: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name:                 { type: 'string' },
                  description:          { type: 'string' },
                  factory_name:         { type: 'string' },
                  factory_group_name:   { type: 'string' },
                  factory_address:      { type: 'string' },
                  factory_city:         { type: 'string' },
                  factory_country:      { type: 'string' },
                  factory_postal_code:  { type: 'string' },
                  factory_phone:        { type: 'string' },
                  factory_email:        { type: 'string' },
                  factory_website:      { type: 'string' },
                  country_of_origin:    { type: 'string' },
                  material_category:    { type: 'string' },
                  price:                { type: 'string' },
                  color:                { type: 'string' },
                  images:               { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        prompt: 'Extract all product listings and manufacturer/factory information from this page.',
      },
    },
  };

  if (config.include_paths?.length) body.includePaths = config.include_paths;
  if (config.exclude_paths?.length) body.excludePaths = config.exclude_paths;

  try {
    const resp = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[scrape-session-manager] Firecrawl /v1/crawl error ${resp.status}: ${err}`);
      return null;
    }

    const data = await resp.json();
    const crawlId = data.id as string | undefined;

    if (!crawlId) {
      console.error('[scrape-session-manager] No crawl ID returned by Firecrawl');
      return null;
    }

    console.log(`[scrape-session-manager] Firecrawl crawl started: ${crawlId} for ${sourceUrl}`);

    // Store crawl ID and update session status
    await supabase
      .from('scraping_sessions')
      .update({
        status:              'crawling',
        // firecrawl_crawl_id is not a top-level column on scraping_sessions —
        // it lives in metadata (below). Writing it here rejected the whole
        // update, so the session never flipped to 'crawling'.
        last_heartbeat_at:   new Date().toISOString(),
        metadata: {
          ...((session.metadata as any) ?? {}),
          firecrawl_crawl_id:  crawlId,
          firecrawl_url:       sourceUrl,
          firecrawl_max_pages: maxPages,
          firecrawl_started:   new Date().toISOString(),
        },
      })
      .eq('id', sessionId);

    return crawlId;
  } catch (err: any) {
    console.error('[scrape-session-manager] Error launching Firecrawl crawl:', err.message);
    return null;
  }
}

async function startProcessing(supabase: any, sessionId: string, req: Request) {
  console.log(`Starting processing for session: ${sessionId}`);

  // Get session details to access workspace_id and background_job_id
  const { data: session } = await supabase
    .from('scraping_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) {
    throw new Error('Session not found');
  }

  // Update background_jobs status to 'processing' if it exists
  if (session.background_job_id) {
    await supabase
      .from('background_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', session.background_job_id);

    console.log(`✅ Updated background_job ${session.background_job_id} to 'processing'`);
  }

  // ── Try Firecrawl full-site crawl first ──────────────────────────────────
  // Firecrawl handles the entire crawl asynchronously and calls our webhook
  // when done — no need for the page-by-page polling loop in that case.
  const crawlId = await launchFirecrawlCrawl(supabase, sessionId, session);

  if (crawlId) {
    // Firecrawl is running — our webhook will handle completion.
    // Nothing more to do here.
    console.log(`[scrape-session-manager] Delegated to Firecrawl crawl ${crawlId}`);
    return;
  }

  // ── Fallback: update status and process pages one by one ─────────────────
  await supabase
    .from('scraping_sessions')
    .update({
      status: 'processing',
      last_heartbeat_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  // Start background processing
  EdgeRuntime.waitUntil(
    processSessionPages(supabase, sessionId, req).catch(error => {
      console.error('Background processing error:', error);
    }),
  );
}

async function pauseProcessing(supabase: any, sessionId: string) {
  console.log(`Pausing processing for session: ${sessionId}`);

  await supabase
    .from('scraping_sessions')
    .update({ status: 'paused' })
    .eq('id', sessionId);
}

async function stopProcessing(supabase: any, sessionId: string) {
  console.log(`Stopping processing for session: ${sessionId}`);

  await supabase
    .from('scraping_sessions')
    .update({ status: 'stopped' })
    .eq('id', sessionId);
}

async function processSessionPages(supabase: any, sessionId: string, req: Request) {
  console.log(`Background processing started for session: ${sessionId}`);

  try {
    // Get session details
    const { data: session, error: sessionError } = await supabase
      .from('scraping_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error('Session not found');
    }

    const config = session.scraping_config || {};
    const batchSize = 3; // Process 3 pages concurrently
    const delayBetweenBatches = 2000; // 2 second delay between batches

    // Seed scraping_pages if none exist yet. The loop below only ever consumes
    // 'pending' rows but nothing else creates them on this fallback path, so
    // without this the loop sees zero pages and immediately marks the session
    // 'completed' having scraped nothing.
    const { count: existingPageCount } = await supabase
      .from('scraping_pages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if (!existingPageCount) {
      const rawUrls: string[] = Array.isArray(config.page_urls) && config.page_urls.length
        ? config.page_urls
        : (session.source_url ? [session.source_url] : []);
      const seedUrls = rawUrls.filter((u: string) => isPublicHttpUrl(u));

      if (seedUrls.length === 0) {
        await supabase
          .from('scraping_sessions')
          .update({
            status: 'failed',
            scraping_config: {
              ...config,
              error: 'No valid public page URLs to scrape (page-by-page fallback)',
              failed_at: new Date().toISOString(),
            },
          })
          .eq('id', sessionId);
        console.error(`[scrape-session-manager] Session ${sessionId} has no valid URLs to scrape`);
        return;
      }

      const seedRows = seedUrls.map((u: string, idx: number) => ({
        session_id: sessionId,
        url: u,
        status: 'pending',
        page_index: idx,
      }));
      const { error: seedErr } = await supabase
        .from('scraping_pages')
        .upsert(seedRows, { onConflict: 'session_id,url', ignoreDuplicates: true });
      if (seedErr) {
        throw new Error(`Failed to seed scraping_pages: ${seedErr.message}`);
      }
      await supabase
        .from('scraping_sessions')
        .update({ total_pages: seedUrls.length })
        .eq('id', sessionId);
      console.log(`[scrape-session-manager] Seeded ${seedUrls.length} page(s) for fallback scraping`);
    }

    while (true) {
      // ✅ Send heartbeat and check if session is still processing
      const { data: currentSession } = await supabase
        .from('scraping_sessions')
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select('status')
        .single();

      if (!currentSession || currentSession.status !== 'processing') {
        console.log(`Session ${sessionId} is no longer processing, stopping`);
        break;
      }

      // Get next batch of pending pages
      const { data: pendingPages, error: pagesError } = await supabase
        .from('scraping_pages')
        .select('*')
        .eq('session_id', sessionId)
        .eq('status', 'pending')
        .order('page_index', { ascending: true })
        .limit(batchSize);

      if (pagesError) {
        console.error('Error fetching pending pages:', pagesError);
        break;
      }

      if (!pendingPages || pendingPages.length === 0) {
        console.log(`No more pending pages for session ${sessionId}`);

        // Mark session as completed
        await supabase
          .from('scraping_sessions')
          .update({ status: 'completed' })
          .eq('id', sessionId);

        // 🚀 NEW: Trigger Python API to process session and create products
        console.log(`✅ Scraping completed! Triggering product creation for session ${sessionId}`);
        await triggerProductCreation(supabase, sessionId, session);

        break;
      }

      console.log(`Processing batch of ${pendingPages.length} pages`);

      // Process pages in parallel
      const pagePromises = pendingPages.map(page =>
        processIndividualPage(supabase, sessionId, page, config, req),
      );

      await Promise.allSettled(pagePromises);

      // Delay between batches to avoid overwhelming the target site
      if (pendingPages.length === batchSize) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

  } catch (error) {
    console.error(`Error in background processing for session ${sessionId}:`, error);

    // Get session details for Sentry context
    const { data: sessionData } = await supabase
      .from('scraping_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    // 🚨 SENTRY ALERT: Send scraping failure to Sentry
    await captureException(error, {
      tags: {
        function: 'scrape-session-manager',
        error_type: 'scraping_session_failed',
        session_id: sessionId,
        source_url: sessionData?.source_url || 'unknown',
      },
      extra: {
        session_id: sessionId,
        source_url: sessionData?.source_url,
        total_pages: sessionData?.total_pages || 0,
        completed_pages: sessionData?.completed_pages || 0,
        failed_pages: sessionData?.failed_pages || 0,
        error_message: error.message,
        timestamp: new Date().toISOString(),
      },
      fingerprint: ['scraping-session-failed', sessionData?.source_url || 'unknown'],
    });

    // Mark session as failed. scraping_sessions has no error_message column —
    // the status route reads the failure reason from scraping_config.error.
    await supabase
      .from('scraping_sessions')
      .update({
        status: 'failed',
        scraping_config: {
          ...((sessionData?.scraping_config as any) ?? {}),
          error: error.message,
          failed_at: new Date().toISOString(),
        },
      })
      .eq('id', sessionId);
  }
}

async function processIndividualPage(
  supabase: any,
  sessionId: string,
  page: any,
  config: any,
  req: Request,
) {
  try {
    console.log(`Processing page: ${page.url}`);

    // Update current page in session
    await supabase
      .from('scraping_sessions')
      .update({ current_page_url: page.url })
      .eq('id', sessionId);

    // Call the single page scraper
    const authHeader = req.headers.get('authorization');

    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/scrape-single-page`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pageUrl: page.url,
        sessionId: sessionId,
        pageId: page.id,
        options: {
          service: config.service || 'firecrawl',
          prompt: config.extractionPrompt,
          timeout: 30000,
        },
      }),
    });

    const result = await response.json();

    if (!result.success) {
      console.error(`Failed to process page ${page.url}:`, result.error);
    } else {
      console.log(`Successfully processed page ${page.url}, found ${result.materialsFound} materials`);
    }

    // 🆕 Update job_progress after processing each page
    await updateJobProgress(supabase, sessionId);

  } catch (error) {
    console.error(`Error processing individual page ${page.url}:`, error);

    // Mark page as failed
    await supabase
      .from('scraping_pages')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', page.id);
  }
}

/**
 * Append scraping progress to background_jobs.stage_history (single source
 * of truth) after each page is processed.
 */
async function updateJobProgress(supabase: any, sessionId: string) {
  try {
    // Get session details
    const { data: session } = await supabase
      .from('scraping_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session || !session.background_job_id) {
      return; // No background_job linked, skip
    }

    // Compute progress from the authoritative scraping_pages rows, not the
    // session counters (the page-by-page path never incremented them). Counting
    // is race-free under concurrent page processing; we write the fresh counts
    // back to the session so the status route + UI reflect reality.
    const { count: totalCount } = await supabase
      .from('scraping_pages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    const { count: completedCount } = await supabase
      .from('scraping_pages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'completed');
    const { count: failedCount } = await supabase
      .from('scraping_pages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'failed');

    const totalPages = totalCount || 0;
    const completedPages = completedCount || 0;
    const failedPages = failedCount || 0;
    const done = completedPages + failedPages;
    const progressPercent = totalPages > 0 ? Math.round((done / totalPages) * 100) : 0;

    // Persist fresh counts back to the session.
    await supabase
      .from('scraping_sessions')
      .update({
        total_pages: totalPages,
        completed_pages: completedPages,
        failed_pages: failedPages,
      })
      .eq('id', sessionId);

    // Append the stage event to background_jobs.stage_history.
    await supabase.rpc('append_stage_history', {
      p_job_id: session.background_job_id,
      p_event: {
        stage: 'scraping_pages',
        status: 'in_progress',
        progress: progressPercent,
        completed_at: new Date().toISOString(),
        data: {
          completed_pages: completedPages,
          failed_pages: failedPages,
          materials_found: session.materials_processed || 0,
          current_url: session.current_page_url,
          current_step: `Page ${done}/${totalPages}`,
        },
        source: 'scrape_session_manager',
      },
    });

    // Update background_jobs progress and heartbeat.
    // NOTE: the progress column is `progress`, not `progress_percent` (which
    // doesn't exist — writing it makes PostgREST reject the whole update).
    await supabase
      .from('background_jobs')
      .update({
        progress: progressPercent,
        last_heartbeat: new Date().toISOString(),
        metadata: {
          ...session.metadata,
          total_pages: totalPages,
          completed_pages: completedPages,
          failed_pages: failedPages,
          materials_processed: session.materials_processed || 0,
        },
      })
      .eq('id', session.background_job_id);

    console.log(`📊 Updated job progress: ${progressPercent}% (${completedPages}/${totalPages} pages)`);
  } catch (error) {
    console.error('Error updating job progress:', error);
    // Don't throw - progress updates are non-critical
  }
}

/**
 * Trigger Python API to process scraping session and create products.
 *
 * This function is called when scraping completes successfully.
 * Implements retry logic with exponential backoff for resilience.
 *
 * Authentication:
 * - Uses MIVAA_API_KEY environment variable (Material Kai API key format: mk_*)
 * - Sent as Bearer token in Authorization header
 * - Python API validates against configured Material Kai API key
 *
 * Retry Strategy:
 * - Max 3 attempts
 * - Exponential backoff: 2s, 4s, 8s
 * - Tracks retry count in session metadata
 *
 * Security:
 * - API key stored in Supabase secrets (not in code)
 * - HTTPS-only communication
 * - Request/response logging for audit trail
 */
async function triggerProductCreation(supabase: any, sessionId: string, session: any) {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 2000; // 2 seconds

  // Get retry count from session metadata
  const currentRetryCount = session.scraping_config?.webhook_retry_count || 0;

  // 🆕 Create webhook_call record to track this attempt
  let webhookCallId: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const startTime = Date.now();

    try {
      const attemptNumber = currentRetryCount + attempt + 1;
      console.log(`🚀 Triggering product creation for session ${sessionId} (attempt ${attemptNumber}/${MAX_RETRIES})`);

      // Get MIVAA service URL and API key from environment
      // MIVAA_SERVICE_URL: Python API base URL (e.g., https://v1api.materialshub.gr)
      // MIVAA_API_KEY: Material Kai API key (format: mk_*) for authentication
      const MIVAA_SERVICE_URL = Deno.env.get('MIVAA_SERVICE_URL') || 'https://v1api.materialshub.gr';
      const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY');

      if (!MIVAA_API_KEY) {
        throw new Error('MIVAA_API_KEY environment variable not configured');
      }

      // Get workspace_id from session or use default
      const workspaceId = session.workspace_id || 'default';

      // Call Python API directly to process scraping session
      const apiUrl = `${MIVAA_SERVICE_URL}/api/scraping/process-session`;

      const requestPayload = {
        session_id: sessionId,
        workspace_id: workspaceId,
        categories: ['products'],
        model: 'claude'
      };

      // 🆕 Record webhook call in database
      if (attempt === 0) {
        const { data: webhookCall } = await supabase
          .from('webhook_calls')
          .insert({
            source_type: 'scraping_session',
            source_id: sessionId,
            webhook_url: apiUrl,
            webhook_method: 'POST',
            request_payload: requestPayload,
            retry_count: 0,
            max_retries: MAX_RETRIES,
            status: 'pending',
            metadata: {
              workspace_id: workspaceId,
              session_id: sessionId,
            },
          })
          .select('id')
          .single();

        webhookCallId = webhookCall?.id;
        console.log(`📝 Created webhook_call record: ${webhookCallId}`);
      } else if (webhookCallId) {
        // Update retry count for subsequent attempts
        await supabase
          .from('webhook_calls')
          .update({ retry_count: attempt, status: 'retrying' })
          .eq('id', webhookCallId);
      }

      console.log(`📡 Calling Python API: POST ${apiUrl}`);
      console.log(`   Session ID: ${sessionId}`);
      console.log(`   Workspace ID: ${workspaceId}`);
      console.log(`   Attempt: ${attemptNumber}/${MAX_RETRIES}`);
      console.log(`   Auth: Bearer ${MIVAA_API_KEY.substring(0, 6)}...`); // Log first 6 chars only

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MIVAA_API_KEY}`,
        },
        body: JSON.stringify(requestPayload),
      });

      const responseTime = Date.now() - startTime;
      const responseText = await response.text();
      console.log(`📥 Python API Response: ${response.status} ${response.statusText} (${responseTime}ms)`);

      if (!response.ok) {
        throw new Error(`Python API error: ${response.status} - ${responseText}`);
      }

      const result = JSON.parse(responseText);

      if (result.success) {
        console.log(`✅ Product creation triggered successfully!`);
        console.log(`   Products created: ${result.products_created || 0}`);
        console.log(`   Attempts needed: ${attemptNumber}`);

        // 🆕 Update webhook_call record with success
        if (webhookCallId) {
          await supabase
            .from('webhook_calls')
            .update({
              response_status: response.status,
              response_body: result,
              response_time_ms: responseTime,
              status: 'success',
              completed_at: new Date().toISOString(),
            })
            .eq('id', webhookCallId);

          console.log(`✅ Updated webhook_call ${webhookCallId} to 'success'`);
        }

        // Update session metadata with product creation info
        await supabase
          .from('scraping_sessions')
          .update({
            metadata: {
              ...session.metadata,
              product_creation_triggered: true,
              product_creation_timestamp: new Date().toISOString(),
              products_created: result.products_created || 0,
              webhook_retry_count: attemptNumber - 1,
              webhook_success: true,
              webhook_call_id: webhookCallId,
            }
          })
          .eq('id', sessionId);

        // 🆕 Update background_jobs to completed
        if (session.background_job_id) {
          await supabase
            .from('background_jobs')
            .update({
              status: 'completed',
              progress: 100,  // column is `progress`, not `progress_percent`
              completed_at: new Date().toISOString(),
              metadata: {
                ...session.metadata,
                products_created: result.products_created || 0,
                webhook_call_id: webhookCallId,
              },
            })
            .eq('id', session.background_job_id);
        }

        // Success! Exit retry loop
        return;
      } else {
        throw new Error(`Product creation failed: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      const responseTime = Date.now() - startTime;

      console.error(`❌ Attempt ${currentRetryCount + attempt + 1} failed:`, error.message);

      // 🆕 Update webhook_call record with error
      if (webhookCallId) {
        await supabase
          .from('webhook_calls')
          .update({
            error_message: error.message,
            response_time_ms: responseTime,
            status: isLastAttempt ? 'failed' : 'retrying',
            retry_count: attempt,
            next_retry_at: isLastAttempt ? null : new Date(Date.now() + BASE_DELAY_MS * Math.pow(2, attempt)).toISOString(),
            completed_at: isLastAttempt ? new Date().toISOString() : null,
          })
          .eq('id', webhookCallId);
      }

      if (isLastAttempt) {
        // Final attempt failed - update session with error
        console.error(`❌ All ${MAX_RETRIES} attempts failed for session ${sessionId}`);

        await supabase
          .from('scraping_sessions')
          .update({
            metadata: {
              ...session.metadata,
              product_creation_error: error.message,
              product_creation_failed_at: new Date().toISOString(),
              webhook_retry_count: currentRetryCount + MAX_RETRIES,
              webhook_success: false,
              webhook_call_id: webhookCallId,
            }
          })
          .eq('id', sessionId);

        // 🆕 Update background_jobs to failed
        if (session.background_job_id) {
          await supabase
            .from('background_jobs')
            .update({
              status: 'failed',
              error_message: `Product creation failed after ${MAX_RETRIES} attempts: ${error.message}`,
              completed_at: new Date().toISOString(),
            })
            .eq('id', session.background_job_id);
        }

        // Don't throw - we don't want to fail the entire scraping session
        // The user can manually retry product creation from the UI
        console.log(`⚠️ Scraping completed but product creation failed after ${MAX_RETRIES} attempts. User can retry manually.`);
      } else {
        // Calculate exponential backoff delay
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`⏳ Retrying in ${delayMs}ms...`);

        // Update session metadata with retry info
        await supabase
          .from('scraping_sessions')
          .update({
            metadata: {
              ...session.metadata,
              webhook_last_error: error.message,
              webhook_last_retry_at: new Date().toISOString(),
              webhook_retry_count: currentRetryCount + attempt + 1,
            }
          })
          .eq('id', sessionId);

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
}
