// bank-statement-import — the feed for a bank that has no API.
//
// Revolut syncs itself. Every other account on file — Postbank BG among them — had no way to reach
// the reconciler at all, so a transfer to it was matched by hand or not at all. The operator maps
// the columns once per account (`bank_statement_mappings`) and imports statements against it.

import { createClient } from '@supabase/supabase-js';
import type { DbClient } from '../_shared/supabase-client.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import {
  parseCsv, parseStatement, sniffDelimiter, statementRefs, type StatementMapping,
} from '../_shared/bank-feed/statement-parse.ts';

/** A statement is text. 8 MB is years of transactions and still far under the memory ceiling. */
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 20_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Account { id: string; workspace_id: string; name: string; currency: string | null; feed_kind: string }

/** The account, proven to be in a workspace the caller belongs to. */
async function loadAccount(db: DbClient, userId: string, accountId: string): Promise<Account> {
  const { data, error } = await db
    .from('finance_bank_accounts')
    .select('id, workspace_id, name, currency, feed_kind')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw new HttpError(500, `Could not read the bank account: ${error.message}`);
  const acct = data as Account | null;
  // 404 on a foreign account, never 403 — a 403 confirms the id exists (invariant 1).
  if (!acct) throw new HttpError(404, 'Not found');

  const { data: member } = await db
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', acct.workspace_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member) throw new HttpError(404, 'Not found');
  return acct;
}

Deno.serve(withApiLogging('bank-statement-import', async (req) => {
  await bootstrapForFunction();
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const auth = await authenticate(req);
  if (!auth.success || !auth.userId) throw new HttpError(401, auth.error || 'Unauthorized');
  const userId = auth.userId;

  const db = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  ) as DbClient;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || '');
  const accountId = String(body.bank_account_id || '');
  if (!accountId) throw new HttpError(400, 'bank_account_id is required');

  const csv = typeof body.csv === 'string' ? body.csv : '';
  if (!csv) throw new HttpError(400, 'csv is required');
  if (csv.length > MAX_BYTES) {
    throw new HttpError(413, `That statement is larger than ${Math.round(MAX_BYTES / 1024 / 1024)}MB.`);
  }

  const account = await loadAccount(db, userId, accountId);

  // ── columns ────────────────────────────────────────────────────────────────
  // What the file offers, so the operator maps against real headers rather than typing them.
  if (action === 'columns') {
    const grid = parseCsv(csv.slice(0, 64 * 1024), sniffDelimiter(csv));
    if (grid.length === 0) throw new HttpError(400, 'That file has no rows.');
    return json({
      ok: true,
      headers: grid[0].map((h) => h.trim()).filter(Boolean),
      sample: grid.slice(1, 6),
    });
  }

  if (action !== 'preview' && action !== 'import') {
    throw new HttpError(400, `Unknown action '${action}'. Known: columns, preview, import.`);
  }

  // The mapping, either saved for this account or supplied inline while the operator builds it.
  let mapping: StatementMapping | null = null;
  if (body.mapping_id) {
    const { data } = await db.from('bank_statement_mappings')
      .select('*').eq('id', String(body.mapping_id)).eq('bank_account_id', accountId).maybeSingle();
    mapping = (data as StatementMapping | null) ?? null;
    if (!mapping) throw new HttpError(404, 'Not found');
  } else if (body.mapping && typeof body.mapping === 'object') {
    mapping = body.mapping as StatementMapping;
  }
  if (!mapping?.date_column) throw new HttpError(400, 'A mapping with at least a date column is required');
  if (!mapping.amount_column && !(mapping.credit_column && mapping.debit_column)) {
    throw new HttpError(400, 'Map either one signed amount column, or both a credit and a debit column');
  }

  const parsed = parseStatement(csv, mapping);
  if (parsed.rows.length > MAX_ROWS) {
    throw new HttpError(413, `That statement has ${parsed.rows.length} rows; the limit is ${MAX_ROWS}.`);
  }
  const refs = statementRefs(parsed.rows, accountId);

  // Which of these do we already hold? Reported on the preview so re-importing an overlapping
  // statement is a visible no-op rather than a surprise, and so the operator can tell an empty
  // import ("already have them all") from a broken mapping ("nothing parsed").
  const existing = new Set<string>();
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await db.from('revolut_bank_transactions')
      .select('provider_ref')
      .eq('workspace_id', account.workspace_id)
      .eq('provider', 'statement')
      .in('provider_ref', refs.slice(i, i + 200));
    for (const r of (data ?? []) as Array<{ provider_ref: string }>) existing.add(r.provider_ref);
  }
  const fresh = parsed.rows.map((r, i) => ({ row: r, ref: refs[i] })).filter((x) => !existing.has(x.ref));

  if (action === 'preview') {
    return json({
      ok: true,
      account: { id: account.id, name: account.name, feed_kind: account.feed_kind },
      parsed: parsed.rows.length,
      already_held: existing.size,
      to_import: fresh.length,
      problems: parsed.problems.slice(0, 50),
      problem_count: parsed.problems.length,
      sample: fresh.slice(0, 10).map((x) => x.row),
    });
  }

  // ── import ─────────────────────────────────────────────────────────────────
  // A settlement balance mirrors payments its provider already recorded; importing a statement
  // into one would create rows the reconciler is explicitly built never to match.
  if (account.feed_kind !== 'bank_account') {
    throw new HttpError(409,
      `"${account.name}" is not a bank account we reconcile (feed_kind=${account.feed_kind}). `
      + 'Importing a statement into a merchant settlement balance would double-count money its own provider already settled.');
  }
  if (fresh.length === 0) {
    return json({ ok: true, imported: 0, already_held: existing.size, problems: parsed.problems.length });
  }

  const now = new Date().toISOString();
  const payload = fresh.map(({ row, ref }) => ({
    workspace_id: account.workspace_id,
    bank_account_id: account.id,
    provider: 'statement',
    provider_ref: ref,
    // One row IS the transaction for an imported statement — no legs to reassemble.
    transaction_id: ref,
    leg_id: null,
    legs_total: 1,
    state: 'completed',
    type: 'transfer',
    direction: row.direction,
    amount: row.amount,
    currency: account.currency || 'EUR',
    booked_at: `${row.booked_at}T00:00:00Z`,
    counterparty_name: row.counterparty_name,
    reference: row.reference,
    match_status: 'unmatched',
    raw: { source: 'statement_import', line: row.line, imported_at: now, imported_by: userId },
  }));

  let imported = 0;
  for (let i = 0; i < payload.length; i += 200) {
    const { data, error } = await db.from('revolut_bank_transactions')
      // The unique index on (workspace_id, provider, provider_ref) is the real guard; ignoring a
      // conflict makes a re-import idempotent instead of a failed batch.
      .upsert(payload.slice(i, i + 200), { onConflict: 'workspace_id,provider,provider_ref', ignoreDuplicates: true })
      .select('id');
    if (error) throw new HttpError(500, `Import failed after ${imported} rows: ${error.message}`);
    imported += (data ?? []).length;
  }

  return json({
    ok: true,
    imported,
    already_held: existing.size,
    problems: parsed.problems.length,
    // Nothing is matched here. The reconciler is the one derivation that decides what a credit
    // settles, and it now reads these rows because the account is a `bank_account`.
    next: 'Run Reconcile to match the imported credits against open invoices.',
  });
}));
