import { createClient } from '@supabase/supabase-js';
import { captureException, captureMessage } from '../_shared/sentry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SessionManagerRequest {
  sessionId: string;
  action: 'start' | 'pause' | 'resume' | 'stop';
}

Deno.serve(async (req) => {
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
    const { sessionId, action }: SessionManagerRequest = await req.json();

    console.log(`Session manager: ${action} for session ${sessionId}`);

    if (!sessionId || !action) {
      throw new Error('Missing required parameters: sessionId, action');
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

    // Get auth info
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header found');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Authentication failed');
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
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({
      success: true,
      action,
      sessionId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in session manager:', error);

    // 🚨 SENTRY ALERT: Send error to Sentry
    await captureException(error, {
      tags: {
        function: 'scrape-session-manager',
        error_type: 'session_manager_error',
      },
      extra: {
        error_message: error.message,
        timestamp: new Date().toISOString(),
      },
      fingerprint: ['scrape-session-manager', 'error'],
    });

    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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

  // Update session status
  await supabase
    .from('scraping_sessions')
    .update({ status: 'processing' })
    .eq('id', sessionId);

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

    while (true) {
      // Check if session is still processing
      const { data: currentSession } = await supabase
        .from('scraping_sessions')
        .select('status')
        .eq('id', sessionId)
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

    // Mark session as failed
    await supabase
      .from('scraping_sessions')
      .update({
        status: 'failed',
        error_message: error.message,
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
 * Update job_progress table with current scraping progress.
 * Called after each page is processed to provide real-time updates.
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

    // Calculate progress percentage
    const totalPages = session.total_pages || 0;
    const completedPages = session.completed_pages || 0;
    const progressPercent = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

    // Update job_progress table (upsert)
    await supabase
      .from('job_progress')
      .upsert({
        job_id: session.background_job_id,
        stage: 'scraping_pages',
        progress_percent: progressPercent,
        current_step: `Page ${completedPages}/${totalPages}`,
        details: {
          completed_pages: completedPages,
          failed_pages: session.failed_pages || 0,
          materials_found: session.materials_processed || 0,
          current_url: session.current_page_url,
        },
      }, {
        onConflict: 'job_id,stage',
      });

    // Update background_jobs progress and heartbeat
    await supabase
      .from('background_jobs')
      .update({
        progress_percent: progressPercent,
        last_heartbeat: new Date().toISOString(),
        metadata: {
          ...session.metadata,
          total_pages: totalPages,
          completed_pages: completedPages,
          failed_pages: session.failed_pages || 0,
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
              progress_percent: 100,
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
