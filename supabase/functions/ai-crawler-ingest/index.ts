/** AI-crawler request lines from a connected website's edge (#487 B1). Signed per website; fails closed. */

import { serviceClient } from '../_shared/supabase-client.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import {
  INGEST_MAX_BYTES, parseIngestBody, verifyCrawlerIp, verifyIngestSignature,
} from '../_shared/ai-crawler.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(withApiLogging('ai-crawler-ingest', async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  await bootstrapForFunction();

  const websiteId = new URL(req.url).searchParams.get('website') ?? '';
  if (!UUID.test(websiteId)) throw new HttpError(400, 'website must be a website id');

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > INGEST_MAX_BYTES) throw new HttpError(413, 'Delivery too large');
  const raw = await req.text();
  if (raw.length > INGEST_MAX_BYTES) throw new HttpError(413, 'Delivery too large');

  const db = serviceClient();
  const { data: source, error } = await db.from('website_crawler_sources')
    .select('secret').eq('website_id', websiteId).maybeSingle();
  if (error) throw new Error(`crawler source lookup failed: ${error.message}`);
  if (!source) throw new HttpError(404, 'Not found');

  const ok = await verifyIngestSignature(
    source.secret, req.headers.get('x-kai-timestamp'), req.headers.get('x-kai-signature'), raw,
  );
  if (!ok) throw new HttpError(401, 'Invalid signature');

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
  const events = parseIngestBody(body);
  const rows = await Promise.all(events.map(async (e) => ({ ...e, verified: await verifyCrawlerIp(e.ua, e.ip) })));

  const { data: stored, error: rpcErr } = await db.rpc('ingest_ai_crawler_hits', {
    p_website_id: websiteId, p_rows: rows, p_seen: events.length,
  });
  if (rpcErr) throw new Error(`ingest_ai_crawler_hits failed: ${rpcErr.message}`);

  return new Response(JSON.stringify({ received: events.length, stored: stored ?? 0 }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}));
