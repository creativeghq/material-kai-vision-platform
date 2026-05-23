// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

// Sales/Finance PR-A — Supplier Cost List parser
//
// Reads a kb_docs row with price_doc_type='supplier_cost_list' and materializes
// the SKU → cost rows it contains onto products.cost. This is the operator-facing
// surface for maintaining procurement costs: an admin uploads a supplier price
// list as a KB doc, then triggers this function to apply it to the catalog.
//
// Input:  { kb_doc_id: uuid, dry_run?: boolean }
// Output: { ok, parsed_rows, matched, updated, unmatched, errors, dry_run }
//
// Match key: products.sku (then products.external_sku as fallback) within the
// same workspace as the KB doc.

interface RequestBody {
  kb_doc_id: string;
  dry_run?: boolean;
}

interface ParsedRow {
  sku: string;
  cost: number;
  currency: string;
  raw_line: string;
}

interface RowOutcome {
  sku: string;
  cost: number;
  currency: string;
  matched: boolean;
  updated: boolean;
  product_id: string | null;
  reason: string | null;
}

const SKU_HEADER_PATTERNS = ['sku', 'code', 'product_code', 'item_code', 'product code', 'item code'];
const COST_HEADER_PATTERNS = ['cost', 'wholesale', 'unit_cost', 'unit cost', 'supplier_price', 'supplier price', 'price'];
const CURRENCY_HEADER_PATTERNS = ['currency', 'ccy', 'curr'];

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseMarkdownTable(content: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: ParsedRow[] = [];

  const lines = content.split(/\r?\n/);
  // Locate the header line — a `|`-delimited line whose cells include a SKU-shaped header
  let headerIndex = -1;
  let headerCells: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length === 0) continue;
    if (cells.some((c) => SKU_HEADER_PATTERNS.includes(c.toLowerCase()))) {
      headerIndex = i;
      headerCells = cells;
      break;
    }
  }

  if (headerIndex === -1) {
    errors.push('No markdown table header with a SKU/code column was found.');
    return { rows, errors };
  }

  const skuIdx = findColumn(headerCells, SKU_HEADER_PATTERNS);
  const costIdx = findColumn(headerCells, COST_HEADER_PATTERNS);
  const currencyIdx = findColumn(headerCells, CURRENCY_HEADER_PATTERNS);

  if (skuIdx === -1) {
    errors.push('SKU column not found in markdown table header.');
    return { rows, errors };
  }
  if (costIdx === -1) {
    errors.push('Cost column not found in markdown table header. Expected one of: ' + COST_HEADER_PATTERNS.join(', '));
    return { rows, errors };
  }

  // Skip the separator row (e.g. `|----|----|`) if present immediately after the header
  let dataStart = headerIndex + 1;
  const next = (lines[dataStart] || '').trim();
  if (/^\|[\s:|-]+\|$/.test(next)) {
    dataStart += 1;
  }

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length === 0) continue;

    const sku = cells[skuIdx] || '';
    const costRaw = cells[costIdx] || '';
    const currency = (currencyIdx >= 0 ? cells[currencyIdx] : '') || '';

    if (!sku) continue;

    // Strip currency symbols and thousands separators; accept comma decimal as fallback
    const cleaned = costRaw.replace(/[€$£\s]/g, '').replace(/(?<=\d),(?=\d{3}(\D|$))/g, '').replace(/,/g, '.');
    const cost = parseFloat(cleaned);
    if (!Number.isFinite(cost) || cost < 0) {
      errors.push(`Row ${i + 1}: cannot parse cost "${costRaw}" for SKU "${sku}"`);
      continue;
    }

    rows.push({
      sku,
      cost,
      currency: currency.toUpperCase() || 'EUR',
      raw_line: line,
    });
  }

  return { rows, errors };
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = await authenticate(req, {
      requireUser: true,
      allowedRoles: ['admin', 'super_admin', 'owner'],
    });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const body = (await req.json()) as RequestBody;
    if (!body.kb_doc_id) return json({ error: 'kb_doc_id is required' }, 400);

    const dryRun = body.dry_run === true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // 1. Load the KB doc
    const { data: doc, error: docErr } = await supabase
      .from('kb_docs')
      .select('id, workspace_id, title, content, price_doc_type, metadata')
      .eq('id', body.kb_doc_id)
      .single();

    if (docErr || !doc) return json({ error: `KB doc not found: ${docErr?.message ?? body.kb_doc_id}` }, 404);

    if (doc.price_doc_type !== 'supplier_cost_list') {
      return json(
        {
          error: `KB doc price_doc_type must be "supplier_cost_list" (got "${doc.price_doc_type ?? 'null'}")`,
        },
        409,
      );
    }

    // 2. Parse the doc content
    const { rows, errors: parseErrors } = parseMarkdownTable(doc.content || '');

    if (rows.length === 0) {
      return json({
        ok: false,
        kb_doc_id: doc.id,
        dry_run: dryRun,
        parsed_rows: 0,
        matched: 0,
        updated: 0,
        unmatched: 0,
        errors: parseErrors.length > 0 ? parseErrors : ['No data rows parsed from markdown table.'],
        rows: [],
      });
    }

    // 3. Bulk-lookup products by SKU within the doc's workspace
    const skus = Array.from(new Set(rows.map((r) => r.sku))).filter(Boolean);
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, sku, external_sku, workspace_id')
      .eq('workspace_id', doc.workspace_id)
      .or(`sku.in.(${skus.map(quoteSql).join(',')}),external_sku.in.(${skus.map(quoteSql).join(',')})`);

    if (prodErr) return json({ error: `Product lookup failed: ${prodErr.message}` }, 500);

    const bySku = new Map<string, { id: string }>();
    for (const p of products || []) {
      if (p.sku) bySku.set(p.sku, { id: p.id });
      if (p.external_sku && !bySku.has(p.external_sku)) bySku.set(p.external_sku, { id: p.id });
    }

    // 4. Apply (or simulate) the updates
    const outcomes: RowOutcome[] = [];
    const nowIso = new Date().toISOString();
    let updatedCount = 0;
    let matchedCount = 0;
    const writeErrors: string[] = [];

    for (const row of rows) {
      const product = bySku.get(row.sku);
      if (!product) {
        outcomes.push({
          sku: row.sku,
          cost: row.cost,
          currency: row.currency,
          matched: false,
          updated: false,
          product_id: null,
          reason: 'No product found with this SKU (or external_sku) in this workspace.',
        });
        continue;
      }
      matchedCount += 1;

      if (dryRun) {
        outcomes.push({
          sku: row.sku,
          cost: row.cost,
          currency: row.currency,
          matched: true,
          updated: false,
          product_id: product.id,
          reason: 'dry_run',
        });
        continue;
      }

      const { error: updErr } = await supabase
        .from('products')
        .update({
          cost: row.cost,
          cost_currency: row.currency,
          cost_updated_at: nowIso,
          cost_source: 'kb_price_list',
        })
        .eq('id', product.id);

      if (updErr) {
        writeErrors.push(`SKU ${row.sku}: ${updErr.message}`);
        outcomes.push({
          sku: row.sku,
          cost: row.cost,
          currency: row.currency,
          matched: true,
          updated: false,
          product_id: product.id,
          reason: updErr.message,
        });
        continue;
      }

      updatedCount += 1;
      outcomes.push({
        sku: row.sku,
        cost: row.cost,
        currency: row.currency,
        matched: true,
        updated: true,
        product_id: product.id,
        reason: null,
      });
    }

    return json({
      ok: writeErrors.length === 0,
      kb_doc_id: doc.id,
      dry_run: dryRun,
      parsed_rows: rows.length,
      matched: matchedCount,
      updated: updatedCount,
      unmatched: rows.length - matchedCount,
      errors: [...parseErrors, ...writeErrors],
      rows: outcomes,
    });
  } catch (err: any) {
    console.error('parse-supplier-cost-list error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
});

// Quote a SKU string for safe use inside a Postgrest `.or()` `in.(...)` list.
// PostgREST's `in.(a,b,c)` syntax expects raw tokens; commas / parens inside a value
// must be escaped by wrapping the value in double quotes and escaping inner quotes.
function quoteSql(value: string): string {
  if (/[(),"\s]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}
