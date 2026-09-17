import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { toCsv, toXml } from '../_shared/serialize.ts';

const FORMATS = ['csv', 'json', 'xml'] as const;
type Format = (typeof FORMATS)[number];

type Row = Record<string, unknown>;

function renamesFrom(mappings: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!mappings) return out;
  const pairs: Array<[unknown, unknown]> = Array.isArray(mappings)
    ? mappings.map((m) => {
      const p = m as Row;
      return [p.target ?? p.our_field ?? p.to, p.source ?? p.their_field ?? p.from];
    })
    : Object.entries(mappings as Row).map(([partnerField, ourColumn]) => [ourColumn, partnerField]);

  const taken = new Set<string>();
  for (const [ours, theirs] of pairs) {
    if (typeof ours !== 'string' || typeof theirs !== 'string' || !ours || !theirs) continue;
    if (taken.has(theirs)) continue;
    taken.add(theirs);
    out[ours] = theirs;
  }
  return out;
}

Deno.serve(withApiLogging('catalog-export', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  let body: {
    workspace_id?: string; format?: string; mapping_template_id?: string;
    category_id?: string; limit?: number; offset?: number;
  };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const workspaceId = body.workspace_id;
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400);
  const format = (body.format ?? 'csv') as Format;
  if (!FORMATS.includes(format)) {
    return json({ error: `format must be one of ${FORMATS.join(', ')}` }, 400);
  }

  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data, error } = await asUser.rpc('export_catalogue_rows', {
    p_workspace_id: workspaceId,
    p_limit: body.limit ?? 1000,
    p_offset: body.offset ?? 0,
    p_category_id: body.category_id ?? null,
  });
  if (error) return json({ error: 'Could not read the catalogue' }, 500);

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    return json({ error: 'No active products to export', products: 0 }, 404);
  }

  let renames: Record<string, string> = {};
  if (body.mapping_template_id) {
    const { data: tpl, error: tplErr } = await asUser
      .from('xml_mapping_templates')
      .select('field_mappings')
      .eq('id', body.mapping_template_id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (tplErr) return json({ error: 'Could not read the mapping template' }, 500);
    if (!tpl) return json({ error: 'That mapping template does not exist here' }, 404);
    renames = renamesFrom((tpl as Row | null)?.field_mappings);
  }

  const ourHeaders = Object.keys(rows[0]);
  const headers = ourHeaders.map((h) => renames[h] ?? h);
  const mapped: Row[] = rows.map((r) => {
    const out: Row = {};
    for (const h of ourHeaders) out[renames[h] ?? h] = r[h];
    return out;
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `catalogue-${stamp}.${format}`;

  if (format === 'json') {
    return new Response(JSON.stringify(mapped, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const payload = format === 'csv'
    ? toCsv(headers, mapped)
    : toXml('catalogue', 'product', headers, mapped);

  return new Response(payload, {
    headers: {
      ...corsHeaders,
      'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}));
