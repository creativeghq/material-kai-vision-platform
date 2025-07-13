import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

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
      error: 'Method not allowed. Use POST.' 
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
      auth: { autoRefreshToken: false, persistSession: false }
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
      sessionId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in session manager:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function startProcessing(supabase: any, sessionId: string, req: Request) {
  console.log(`Starting processing for session: ${sessionId}`);
  
  // Update session status
  await supabase
    .from('scraping_sessions')
    .update({ status: 'processing' })
    .eq('id', sessionId);

  // Start background processing
  EdgeRuntime.waitUntil(
    processSessionPages(supabase, sessionId, req).catch(error => {
      console.error('Background processing error:', error);
    })
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
        break;
      }

      console.log(`Processing batch of ${pendingPages.length} pages`);

      // Process pages in parallel
      const pagePromises = pendingPages.map(page => 
        processIndividualPage(supabase, sessionId, page, config, req)
      );

      await Promise.allSettled(pagePromises);

      // Delay between batches to avoid overwhelming the target site
      if (pendingPages.length === batchSize) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

  } catch (error) {
    console.error(`Error in background processing for session ${sessionId}:`, error);
    
    // Mark session as failed
    await supabase
      .from('scraping_sessions')
      .update({ 
        status: 'failed',
        error_message: error.message 
      })
      .eq('id', sessionId);
  }
}

async function processIndividualPage(
  supabase: any, 
  sessionId: string, 
  page: any, 
  config: any, 
  req: Request
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
          timeout: 30000
        }
      })
    });

    const result = await response.json();
    
    if (!result.success) {
      console.error(`Failed to process page ${page.url}:`, result.error);
    } else {
      console.log(`Successfully processed page ${page.url}, found ${result.materialsFound} materials`);
    }

  } catch (error) {
    console.error(`Error processing individual page ${page.url}:`, error);
    
    // Mark page as failed
    await supabase
      .from('scraping_pages')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', page.id);
  }
}