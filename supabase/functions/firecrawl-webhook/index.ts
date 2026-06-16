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
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(withApiLogging('firecrawl-webhook', async (req: Request) => {
  await bootstrapForFunction();
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

  // Fail closed: an unset secret must REJECT, not skip the check (audit #217 H8).
  const webhookSecret = Deno.env.get('FIRECRAWL_WEBHOOK_SECRET') || '';
  const providedSecret = url.searchParams.get('webhook_secret');
  if (!webhookSecret || providedSecret !== webhookSecret) {
    return new Response(JSON.stringify({ error: 'Invalid or unconfigured webhook secret' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      .map((p: any, idx: number) => {
        // scraping_pages stores page text in `markdown_content` — that is the
        // column the Python discovery path reads (_fetch_scraped_markdown).
        // There is no structured column on scraping_pages for title/extract, so
        // fold the title in as a heading rather than writing a phantom column.
        const title = p.metadata?.title || '';
        const body  = p.markdown || p.content || '';
        return {
          session_id:       sessionId,
          url:              p.url,
          status:           'completed',
          page_index:       idx,
          markdown_content: title ? `# ${title}\n\n${body}` : body,
          completed_at:     new Date().toISOString(),
        };
      });

    if (pageRows.length > 0) {
      const { error: insertErr } = await supabase
        .from('scraping_pages')
        .upsert(pageRows, { onConflict: 'session_id,url', ignoreDuplicates: false });

      if (insertErr) {
        // Fail loudly: if pages don't persist, discovery has nothing to read and
        // the session would otherwise complete with zero products silently.
        console.error('[firecrawl-webhook] Failed to insert pages:', insertErr.message);
        await supabase
          .from('scraping_sessions')
          .update({
            status: 'failed',
            scraping_config: {
              ...((session.scraping_config as any) ?? {}),
              error: `Failed to persist scraped pages: ${insertErr.message}`,
              failed_at: new Date().toISOString(),
            },
          })
          .eq('id', sessionId);
        return new Response(JSON.stringify({ ok: false, error: 'page_insert_failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        console.log(`[firecrawl-webhook] Stored ${pageRows.length} pages`);
      }

      // Track Firecrawl spend (1 credit per page) — owner is the session creator
      if (session.user_id) {
        try {
          const { debitExternalServiceCredits } = await import('../_shared/credit-utils.ts');
          await debitExternalServiceCredits(
            supabase, session.user_id, 'firecrawl-scrape', 'scrape_session_crawl',
            pageRows.length,
            { session_id: sessionId, crawl_id: crawlId, workspace_id: session.workspace_id },
          );
        } catch (logErr) {
          console.warn('[firecrawl-webhook] credit-utils logging failed:', logErr);
        }
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
      .update({
        status: 'completed',
        // firecrawl_crawl_id is not a column on scraping_sessions — keep it in metadata.
        metadata: {
          ...((session.metadata as any) ?? {}),
          firecrawl_crawl_id: crawlId,
        },
      })
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
      .update({
        status: 'failed',
        // error_message is not a column on scraping_sessions — the status route
        // reads the failure reason from scraping_config.error.
        scraping_config: {
          ...((session.scraping_config as any) ?? {}),
          error: 'Firecrawl crawl job failed',
          failed_at: new Date().toISOString(),
        },
      })
      .eq('id', sessionId);
  }

  return new Response(JSON.stringify({ ok: true, pages_received: pages.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
