/**
 * firecrawl-webhook
 *
 * Receives async callbacks from Firecrawl's /v1/crawl endpoint.
 * Firecrawl calls this URL when a full-site crawl completes (or on each batch).
 *
 * Flow:
 *   1. Firecrawl → POST /firecrawl-webhook?session_id=<id>&crawl_id=<id>
 *   2. We store every scraped page in scraping_pages
 *   3. When crawl is fully done (type === 'crawl.completed'), trigger product creation
 *
 * Firecrawl webhook payload shape:
 *   {
 *     type: 'crawl.page' | 'crawl.completed' | 'crawl.failed',
 *     id: <crawl_id>,
 *     data: [{ url, markdown, metadata: { title, description, ... }, extract? }]
 *   }
 */

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIVAA_SERVICE_URL         = Deno.env.get('MIVAA_SERVICE_URL') || 'https://v1api.materialshub.gr';
const MIVAA_API_KEY             = Deno.env.get('MIVAA_API_KEY') || '';

import { corsHeaders } from '../_shared/cors.ts';

const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id');
  const crawlId   = url.searchParams.get('crawl_id');

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'session_id query param required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const eventType = payload.type as string;
  const pages     = (payload.data as any[]) ?? [];

  console.log(`[firecrawl-webhook] session=${sessionId} crawl=${crawlId} type=${eventType} pages=${pages.length}`);

  // ── Load session ─────────────────────────────────────────────────────────
  const { data: session } = await supabase
    .from('scraping_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) {
    console.error(`Session ${sessionId} not found`);
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Store pages in scraping_pages table ───────────────────────────────────
  if (pages.length > 0) {
    const pageRows = pages
      .filter((p: any) => p.url)
      .map((p: any, idx: number) => ({
        session_id:     sessionId,
        url:            p.url,
        status:         'completed',
        page_index:     idx,
        scraped_data:   {
          markdown:    p.markdown    || p.content || '',
          title:       p.metadata?.title       || '',
          description: p.metadata?.description || '',
          extract:     p.extract               || null,
          metadata:    p.metadata              || {},
        },
        completed_at:   new Date().toISOString(),
      }));

    if (pageRows.length > 0) {
      const { error: insertErr } = await supabase
        .from('scraping_pages')
        .upsert(pageRows, { onConflict: 'session_id,url', ignoreDuplicates: false });

      if (insertErr) {
        console.error('[firecrawl-webhook] Failed to insert pages:', insertErr.message);
      } else {
        console.log(`[firecrawl-webhook] Stored ${pageRows.length} pages`);
      }
    }

    // Update session page counts
    const { data: totalRows } = await supabase
      .from('scraping_pages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    await supabase
      .from('scraping_sessions')
      .update({
        total_pages:      (totalRows as any)?.count ?? pages.length,
        completed_pages:  (totalRows as any)?.count ?? pages.length,
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
  }

  // ── Handle crawl completion ───────────────────────────────────────────────
  if (eventType === 'crawl.completed') {
    console.log(`[firecrawl-webhook] Crawl complete for session ${sessionId} — triggering product creation`);

    await supabase
      .from('scraping_sessions')
      .update({ status: 'completed', firecrawl_crawl_id: crawlId })
      .eq('id', sessionId);

    // Trigger Python backend to create products from scraped pages
    try {
      const resp = await fetch(`${MIVAA_SERVICE_URL}/api/scraping/process-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MIVAA_API_KEY}`,
        },
        body: JSON.stringify({
          session_id:   sessionId,
          workspace_id: session.workspace_id,
          categories:   ['products'],
          model:        'claude',
        }),
      });

      if (resp.ok) {
        const result = await resp.json();
        console.log(`[firecrawl-webhook] Product creation: ${result.products_created ?? 0} products`);

        await supabase
          .from('scraping_sessions')
          .update({
            metadata: {
              ...((session.metadata as any) ?? {}),
              product_creation_triggered: true,
              products_created: result.products_created ?? 0,
              firecrawl_crawl_id: crawlId,
            },
          })
          .eq('id', sessionId);

        // Trigger factory enrichment
        if (result.products_created > 0) {
          const SUPABASE_URL_ENV = Deno.env.get('SUPABASE_URL')!;
          await fetch(`${SUPABASE_URL_ENV}/functions/v1/trigger-factory-enrichment`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              workspace_id:  session.workspace_id,
              scope_column:  'scrape_session_id',
              scope_value:   sessionId,
            }),
          }).catch(e => console.warn('[firecrawl-webhook] Factory enrichment trigger failed:', e.message));
        }
      } else {
        const errText = await resp.text();
        console.error(`[firecrawl-webhook] Product creation error ${resp.status}: ${errText}`);
      }
    } catch (err: any) {
      console.error('[firecrawl-webhook] Product creation trigger failed:', err.message);
    }

  } else if (eventType === 'crawl.failed') {
    console.error(`[firecrawl-webhook] Crawl failed for session ${sessionId}`);
    await supabase
      .from('scraping_sessions')
      .update({ status: 'failed', error_message: 'Firecrawl crawl job failed' })
      .eq('id', sessionId);
  }

  return new Response(JSON.stringify({ ok: true, pages_received: pages.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
